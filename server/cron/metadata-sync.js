/**
 * 定时元数据同步服务（每小时）
 * 
 * 职责：只同步"变化慢"的元数据，不同步报告数据
 * - 店铺列表（变化极低）
 * - 产品列表（低频变化）
 * - 广告组合/广告活动列表元数据：名称、状态、预算、出价（几小时变一次）
 * 
 * 不负责：
 * - 广告投放报告数据（花费/曝光/点击/ACoS）→ 由 /api/lingxing/reports 实时代理
 * 
 * @module cron/metadata-sync
 */

const lingxingService = require('../services/lingxing');
const db = require('../config/database');
const scheduler = require('../services/scheduler');

const TASK_ID = 'metadata-hourly-sync';
const DEFAULT_INTERVAL_MINUTES = 60; // 默认每小时

// ── 核心同步逻辑：只拉元数据 ─────────────────────────────

async function syncMetadata() {
  console.log(`\n[元数据同步] 开始同步元数据...`);
  const startTime = Date.now();
  const errors = [];

  try {
    // 1. 获取店铺列表
    let stores = [];
    try {
      stores = await lingxingService.getStores();
      _saveStores(stores);
      console.log(`[元数据同步] 店铺: ${stores.length} 个`);
    } catch (e) {
      errors.push('店铺: ' + e.message);
      console.warn('[元数据同步] 获取店铺失败:', e.message);
    }

    // 2. 逐个店铺同步：产品 + 广告组合 + 广告活动（仅元数据）
    const storeIds = (stores || []).map(s => s.sid).filter(Boolean);

    if (storeIds.length > 0) {
      let totalProducts = 0, totalPortfolios = 0, totalCampaigns = 0;

      for (const sid of storeIds) {
        try {
          const [products, portfolios, campaigns] = await Promise.all([
            lingxingService.getProducts({ storeId: sid }),
            lingxingService.getPortfolios({ sid: sid }),
            lingxingService.getCampaigns({ sid: sid })
          ]);

          _saveProducts(products);
          _savePortfolios(portfolios);
          _saveCampaigns(campaigns);

          totalProducts += (products || []).length;
          totalPortfolios += Array.isArray(portfolios) ? portfolios.length : (portfolios?.data || []).length || 0;
          totalCampaigns += (campaigns || []).length;
        } catch (e) {
          errors.push(`店铺${sid}: ${e.message}`);
          console.warn(`[元数据同步] 店铺 ${sid} 同步失败:`, e.message);
        }
      }

      console.log(`[元数据同步] 产品: ${totalProducts}, 广告组合: ${totalPortfolios}, 广告活动: ${totalCampaigns}`);
    }

    // 记录同步日志
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = errors.length === 0 ? 'success' : 'partial';
    const msg = errors.length === 0
      ? `元数据同步完成 (${elapsed}s): ${storeIds.length}个店铺`
      : `元数据同步完成 (${elapsed}s), ${errors.length}项失败: ${errors.join('; ')}`;

    db.run(
      "INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)",
      ['metadata', status, msg]
    );
    console.log(`[元数据同步] ${msg}`);

    return { success: true, status, message: msg };
  } catch (err) {
    console.error(`[元数据同步] 失败:`, err.message);
    db.run(
      "INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)",
      ['metadata', 'error', err.message]
    );
    return { success: false, error: err.message };
  }
}

// ── 保存函数（复用 prepared statement 提升性能） ──────────

function _saveStores(stores) {
  if (!stores || stores.length === 0) return;
  const stmt = db.getDb()?.prepare?.(
    `INSERT OR REPLACE INTO sync_stores (store_id, store_name, marketplace, region, status, last_sync_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  if (!stmt) { /* fallback */ return; }
  for (const s of stores) {
    try { stmt.run(s.sid || s.id, s.name || '', s.country || s.marketplace_id || '', s.region || '', s.status || 'active'); }
    catch (e) { console.error('[保存店铺]', e.message); }
  }
}

function _saveProducts(products) {
  if (!products || products.length === 0) return;
  const stmt = db.getDb()?.prepare?.(
    `INSERT OR REPLACE INTO sync_products (sku_id, sku, asin, name, img, status, store_id, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  if (!stmt) { return; }
  for (const p of products) {
    try {
      stmt.run(p.sku_id || p.id || p.sku || '', p.sku || p.msku || '', p.asin || p.asin1 || '',
        p.name || p.title || p.product_name || '', p.img || p.image || p.main_image || '',
        p.status || 'active', p.sid || p.store_id || '');
    } catch (e) { console.error('[保存产品]', e.message); }
  }
}

function _savePortfolios(portfolios) {
  if (!portfolios || portfolios.length === 0) return;
  // 领星返回可能是数组或 { data: [] } 格式
  const list = Array.isArray(portfolios) ? portfolios : (portfolios?.data || []);

  for (const p of list) {
    const pid = p.portfolio_id || p.campaign_id || p.id;
    if (!pid) continue;

    // 写入 sync_portfolios 表
    try {
      db.run(`INSERT OR REPLACE INTO sync_portfolios (portfolio_id, name, type, status, budget, store_id, last_sync_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [pid, p.name || p.portfolio_name || '', p.type || p.portfolio_type || 'portfolio',
         p.state || p.status || 'enabled', p.budget || p.daily_budget || 0, p.sid || p.store_id || null]);
    } catch (e) { /* 表可能不存在 */ }

    // 同步到 AI优化器的 portfolios 表
    try {
      const exists = db.query('SELECT id FROM portfolios WHERE id = ?', [pid]);
      if (exists.length === 0) {
        db.run(`INSERT INTO portfolios (id, name, store_id, status, target_acos, current_acos)
                VALUES (?, ?, ?, ?, ?, ?)`,
          [pid, p.name || p.portfolio_name || pid, p.sid || p.store_id || '', p.state || p.status || 'active', 20, 0]);
      }
    } catch (e) { /* 忽略 */ }
  }
}

function _saveCampaigns(campaigns) {
  if (!campaigns || campaigns.length === 0) return;
  const stmt = db.getDb()?.prepare?.(
    `INSERT OR REPLACE INTO sync_campaigns (campaign_id, campaign_name, type, status, budget, store_id, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  if (!stmt) { return; }
  for (const c of campaigns) {
    try {
      stmt.run(c.campaign_id || c.id, c.name || c.campaign_name || '',
        c.campaign_type || c.type || '', c.state || c.status || 'enabled',
        c.daily_budget || c.budget || 0, c.store_id || c.sid || '');
    } catch (e) { console.error('[保存广告活动]', e.message); }
  }
}

// ── 调度管理 ─────────────────────────────────────────────

/**
 * 启动定时元数据同步（默认每小时）
 * @param {number} intervalMinutes 间隔分钟数，默认60
 */
function startSchedule(intervalMinutes = DEFAULT_INTERVAL_MINUTES) {
  // 先移除旧任务
  try { scheduler.removeTask(TASK_ID); } catch (e) {}

  if (intervalMinutes <= 0) {
    console.log('[元数据同步] 已禁用（interval <= 0）');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  scheduler.scheduleTask({
    id: TASK_ID,
    name: '定时元数据同步',
    handler: syncMetadata,
    type: 'interval',
    intervalMs: intervalMs,
    enabled: true,
    metadata: { description: `每${intervalMinutes}分钟从领星同步元数据（店铺/产品/广告组合/广告活动列表）` }
  });

  console.log(`[元数据同步] 已注册，间隔: ${intervalMinutes}分钟`);
}

/**
 * 手动触发一次元数据同步（用于前端"立即同步"按钮）
 */
async function triggerSync() {
  return await syncMetadata();
}

/**
 * 获取当前状态
 */
function getStatus() {
  const tasks = scheduler.getAllTasks?.() || [];
  const task = tasks.find(t => t.id === TASK_ID);
  return {
    enabled: !!(task && task.enabled),
    taskId: TASK_ID,
    status: task?.status || 'stopped',
    lastRun: task?.lastRun || null,
    nextRun: task?.nextRun || null
  };
}

// ── 导出 ─────────────────────────────────────────────────

module.exports = {
  syncMetadata,       // 核心函数：执行一次元数据同步
  startSchedule,      // 注册定时任务
  triggerSync,        // 手动触发一次
  getStatus           // 查询状态
};
