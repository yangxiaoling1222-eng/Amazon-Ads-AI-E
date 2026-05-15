/**
 * 数据自动同步调度服务
 * 读取 syncInterval 配置，注册定时任务拉取领星/亚马逊数据
 */

const scheduler = require('./scheduler');
const lingxingService = require('./lingxing');
const db = require('../config/database');

let _syncTaskId = 'auto-data-sync';
let _syncIntervalMs = null; // 缓存当前间隔，null = 未注册

// ── 核心同步逻辑 ────────────────────────────────────────────────

async function doSync() {
  console.log(`\n[自动同步] 开始同步数据...`);
  const startTime = Date.now();
  const startDate = _getDateDaysAgo(30); // 默认拉取近30天
  const endDate = _getDateStr(new Date());
  const errors = [];

  try {
    // 获取所有店铺
    let stores = [];
    try { stores = await lingxingService.getStores(); } catch (e) { console.warn('[自动同步] 获取店铺列表失败:', e.message); }
    const storeIds = (stores || []).map(s => s.store_id || s.id).filter(Boolean);

    // 如果有店铺，逐个同步
    if (storeIds.length > 0) {
      for (const storeId of storeIds) {
        try {
          await _syncStore(storeId, startDate, endDate);
        } catch (e) {
          errors.push(storeId + ': ' + e.message);
        }
      }
    } else {
      // 没有店铺数据时，仍然尝试调用一次（返回空）
      try { await _syncStore(null, startDate, endDate); } catch (e) {}
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = errors.length === 0 ? 'success' : 'partial';
    const msg = errors.length === 0
      ? `同步完成 (${elapsed}s)`
      : `同步完成，${errors.length} 个店铺失败: ${errors.join('; ')}`;

    db.run(
      "INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)",
      ['auto', status, msg]
    );
    console.log(`[自动同步] ${msg}`);
  } catch (err) {
    console.error(`[自动同步] 失败:`, err.message);
    db.run(
      "INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)",
      ['auto', 'error', err.message]
    );
  }
}

async function _syncStore(storeId, startDate, endDate) {
  let stores = [], products = [], campaigns = [], reportData = { data: [] };
  try { stores = await lingxingService.getStores(); } catch (e) {}
  if (storeId) {
    try { products = await lingxingService.getProducts({ storeId }); } catch (e) {}
    try { campaigns = await lingxingService.getCampaigns({ storeId }); } catch (e) {}
    try { reportData = await lingxingService.getAdReport({ storeId, startDate, endDate }); } catch (e) {}
  }

  // 保存数据
  _saveStores(stores);
  _saveProducts(products);
  _saveCampaigns(campaigns);
  _saveReports(Array.isArray(reportData) ? reportData : (reportData.data || []));
}

function _saveStores(stores) {
  if (!stores || stores.length === 0) return;
  console.log(`[同步] 收到 ${stores.length} 个店铺，准备保存...`);
  const stmt = db.getDb().prepare(
    `INSERT OR REPLACE INTO sync_stores (store_id, store_name, marketplace, region, status, last_sync_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  let savedCount = 0;
  stores.forEach(s => {
    try {
      // 领星API字段映射: sid, name, country, region, status
      stmt.run(s.sid || s.id, s.name || '', s.country || s.marketplace_id || '', s.region || '', s.status || 'active');
      savedCount++;
    } catch (e) {
      console.error('[保存店铺失败]', e.message, s);
    }
  });
  console.log(`[同步] 店铺保存完成: ${savedCount}/${stores.length}`);
}

function _saveProducts(products) {
  if (!products || products.length === 0) return;
  console.log(`[同步] 收到 ${products.length} 个产品，准备保存...`);
  const stmt = db.getDb().prepare(
    `INSERT OR REPLACE INTO sync_products (sku_id, sku, asin, name, img, status, store_id, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  let savedCount = 0;
  products.forEach(p => {
    try {
      // 领星产品API字段映射
      stmt.run(
        p.sku_id || p.id || p.sku || '',
        p.sku || p.msku || '',
        p.asin || p.asin1 || '',
        p.name || p.title || p.product_name || '',
        p.img || p.image || p.main_image || '',
        p.status || 'active',
        p.sid || p.store_id || ''
      );
      savedCount++;
    } catch (e) {
      console.error('[保存产品失败]', e.message, JSON.stringify(p).substring(0, 200));
    }
  });
  console.log(`[同步] 产品保存完成: ${savedCount}/${products.length}`);
}

function _saveCampaigns(campaigns) {
  if (!campaigns || campaigns.length === 0) return;
  const stmt = db.getDb().prepare(
    `INSERT OR REPLACE INTO sync_campaigns (campaign_id, campaign_name, type, status, budget, store_id, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  campaigns.forEach(c => {
    try {
      stmt.run(
        c.campaign_id || c.id,
        c.campaign_name || c.name || '',
        c.type || c.campaign_type || '',
        c.status || 'enabled',
        c.budget || 0,
        c.store_id || ''
      );
    } catch (e) {}
  });
}

function _saveReports(reports) {
  if (!reports || reports.length === 0) return;
  const stmt = db.getDb().prepare(
    `INSERT OR REPLACE INTO sync_reports (date, campaign_id, impressions, clicks, cost, sales, orders, ctr, cpc, acos, roas, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  reports.forEach(r => {
    try {
      stmt.run(
        r.date || r.report_date || '',
        r.campaign_id || r.campaignId || '',
        r.impressions || 0,
        r.clicks || 0,
        r.cost || 0,
        r.sales || r.revenue || 0,
        r.orders || r.conversions || 0,
        r.ctr || 0,
        r.cpc || 0,
        r.acos || 0,
        r.roas || 0
      );
    } catch (e) {}
  });
}

function _getDateStr(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return _getDateStr(d);
}

// ── 调度器管理 ───────────────────────────────────────────────────

/**
 * 从数据库读取 syncInterval 并注册/更新同步任务
 * @param {number} intervalMinutes 分钟数，null=禁用
 */
function updateSyncSchedule(intervalMinutes) {
  // 先移除旧任务
  try { scheduler.removeTask(_syncTaskId); } catch (e) {}

  if (!intervalMinutes || intervalMinutes <= 0) {
    _syncIntervalMs = null;
    console.log('[自动同步] 已禁用');
    return;
  }

  _syncIntervalMs = intervalMinutes * 60 * 1000;

  scheduler.scheduleTask({
    id: _syncTaskId,
    name: '自动数据同步',
    handler: doSync,
    type: 'interval',
    intervalMs: _syncIntervalMs,
    enabled: true,
    metadata: { description: '按配置间隔自动从领星ERP同步广告数据' }
  });

  console.log(`[自动同步] 已注册，间隔: ${intervalMinutes}分钟`);
}

/**
 * 获取当前同步状态
 */
function getSyncStatus() {
  const tasks = scheduler.getAllTasks();
  const task = tasks.find(t => t.id === _syncTaskId);
  return {
    enabled: !!(task && task.enabled),
    intervalMs: _syncIntervalMs,
    status: task?.status || 'stopped',
    lastRun: task?.lastRun || null,
    nextRun: task?.nextRun || null
  };
}

// ── 启动时初始化 ─────────────────────────────────────────────────

// 服务器启动时读取配置并注册
function init() {
  try {
    const rows = db.query("SELECT config_value FROM api_config WHERE config_key = 'syncInterval'");
    if (rows && rows.length > 0) {
      try {
        const val = JSON.parse(rows[0].config_value);
        const interval = parseInt(val?.minutes || val);
        if (interval > 0) {
          updateSyncSchedule(interval);
          return;
        }
      } catch (e) {
        const interval = parseInt(rows[0].config_value);
        if (interval > 0) {
          updateSyncSchedule(interval);
          return;
        }
      }
    }
    console.log('[自动同步] 未配置自动同步间隔（syncInterval）');
  } catch (e) {
    console.error('[自动同步] 初始化失败:', e.message);
  }
}

module.exports = { init, updateSyncSchedule, getSyncStatus, doSync };
