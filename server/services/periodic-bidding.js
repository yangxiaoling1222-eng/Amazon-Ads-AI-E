/**
 * 周期智能调价 - ACOS 规则引擎
 * 根据广告活动 ACOS 表现自动调整出价
 * 规则：提价 / 降价 / 大幅降价
 */

const db = require('../config/database');

// 加载数据库配置
let database;
try {
  database = require('../config/database');
} catch (e) {
  database = null;
}

/**
 * 获取有效的 ACOS 调价规则
 * @param {string} campaignId - 广告活动ID
 * @returns {Promise<Object|null>}
 */
async function getEffectiveRules(campaignId) {
  if (!database) return null;

  try {
    const rules = database.prepare(`
      SELECT * FROM acos_rules
      WHERE campaign_id = ? AND enabled = 1
        AND (start_date IS NULL OR start_date <= date('now'))
        AND (end_date IS NULL OR end_date >= date('now'))
      ORDER BY priority DESC
      LIMIT 1
    `).get(campaignId);

    return rules || null;
  } catch (e) {
    console.error('获取ACOS规则失败:', e.message);
    return null;
  }
}

/**
 * 计算目标 ACOS
 * @param {Object} rule - 规则对象
 * @param {Object} currentMetrics - 当前指标
 * @returns {number|null}
 */
function calculateTargetAcos(rule, currentMetrics) {
  if (!rule || !currentMetrics) return null;

  const targetAcos = parseFloat(rule.target_acos) || 0;
  if (targetAcos <= 0) return null;

  // 根据策略微调目标 ACOS
  let adjustedTarget = targetAcos;

  if (rule.strategy === 'aggressive') {
    adjustedTarget = targetAcos * 0.9; // 激进策略降低10%
  } else if (rule.strategy === 'conservative') {
    adjustedTarget = targetAcos * 1.1; // 保守策略提高10%
  }

  return adjustedTarget;
}

/**
 * 判断调价方向
 * @param {Object} rule - 规则对象
 * @param {Object} metrics - 当前指标
 * @param {number} targetAcos - 目标ACOS
 * @returns {string|null} 'increase' | 'decrease' | 'aggressive_decrease' | null
 */
function determineBidAction(rule, metrics, targetAcos) {
  if (!metrics || !rule) return null;

  const acos = metrics.acos;
  const orders = metrics.orders || 0;

  // 跳过 acos=0/NaN 的情况，避免误判提价
  if (!acos || acos === 0 || isNaN(acos)) {
    console.log('  ⏭️ 跳过: ACOS为0或无效，不做调价');
    return null;
  }

  // 检查最小订单数要求
  const effectiveRules = rule;
  const minOrders = effectiveRules.min_orders || 1;
  if (orders < minOrders) {
    console.log(`  ⏭️ 跳过: 订单数(${orders}) < 最小要求(${minOrders})`);
    return null;
  }

  const tolerance = parseFloat(rule.tolerance) || 5; // 默认5%容差

  if (acos > targetAcos + tolerance) {
    // ACOS 过高，需要降价
    if (acos > targetAcos + tolerance * 2) {
      return 'aggressive_decrease'; // 大幅降价
    }
    return 'decrease';
  } else if (acos < targetAcos - tolerance) {
    // ACOS 过低，可以提价获取更多流量
    return 'increase';
  }

  return null;
}

/**
 * 计算新出价
 * @param {number} currentBid - 当前出价
 * @param {string} action - 调价动作
 * @param {Object} rule - 规则对象
 * @returns {number}
 */
function calculateNewBid(currentBid, action, rule) {
  if (!currentBid || currentBid <= 0) return 0;

  let adjustment = 0;
  let maxBid = parseFloat(rule.max_bid) || 10;
  let minBid = parseFloat(rule.min_bid) || 0.02;

  switch (action) {
    case 'increase':
      adjustment = parseFloat(rule.increase_step) || 0.1;
      break;
    case 'decrease':
      adjustment = -Math.abs(parseFloat(rule.decrease_step) || 0.1);
      break;
    case 'aggressive_decrease':
      adjustment = -Math.abs(parseFloat(rule.aggressive_step) || 0.2);
      break;
    default:
      return currentBid;
  }

  // 如果是百分比调整
  if (rule.adjustment_type === 'percentage') {
    let newBid = currentBid * (1 + adjustment / 100);
    newBid = Math.min(Math.max(newBid, minBid), maxBid);
    return Math.round(newBid * 100) / 100;
  }

  let newBid = currentBid + adjustment;
  newBid = Math.min(Math.max(newBid, minBid), maxBid);
  return Math.round(newBid * 100) / 100;
}

/**
 * 执行单次调价周期
 * @param {boolean} dryRun - 是否为试运行模式
 * @returns {Promise<Object>}
 */
async function runBiddingCycle(dryRun = true) {
  const results = {
    timestamp: new Date().toISOString(),
    dryRun,
    processed: 0,
    adjusted: 0,
    skipped: 0,
    errors: [],
    changes: []
  };

  if (!database) {
    results.errors.push('数据库未连接');
    return results;
  }

  try {
    // 获取所有启用的活动及其最新指标
    const campaigns = database.prepare(`
      SELECT
        c.id,
        c.campaign_id,
        c.campaign_name,
        c.current_bid,
        r.*
      FROM campaigns c
      LEFT JOIN acos_rules r ON c.campaign_id = r.campaign_id AND r.enabled = 1
      WHERE c.auto_bidding_enabled = 1
    `).all();

    for (const campaign of campaigns) {
      results.processed++;

      // 获取最新 ACOS 数据（从每日报表）
      const metrics = database.prepare(`
        SELECT
          SUM(spend) as total_spend,
          SUM(sales) as total_sales,
          SUM(orders) as total_orders,
          CASE WHEN SUM(sales) > 0 THEN SUM(spend) / SUM(sales) * 100 ELSE 0 END as acos
        FROM daily_metrics
        WHERE campaign_id = ?
        AND report_date >= date('now', '-7 days')
      `).get(campaign.campaign_id);

      if (!metrics || metrics.total_spend === 0) {
        results.skipped++;
        continue;
      }

      const rule = campaign.id ? campaign : null;
      const targetAcos = calculateTargetAcos(rule, metrics);

      if (!targetAcos) {
        results.skipped++;
        continue;
      }

      const action = determineBidAction(rule, metrics, targetAcos);

      if (!action) {
        results.skipped++;
        continue;
      }

      const newBid = calculateNewBid(campaign.current_bid, action, rule);

      results.changes.push({
        campaignId: campaign.campaign_id,
        campaignName: campaign.campaign_name,
        currentBid: campaign.current_bid,
        newBid,
        action,
        acos: Math.round(metrics.acos * 100) / 100,
        targetAcos: Math.round(targetAcos * 100) / 100,
        orders: metrics.total_orders
      });

      if (!dryRun) {
        // 更新数据库
        database.prepare(`
          UPDATE campaigns SET current_bid = ?, last_bid_update = datetime('now')
          WHERE campaign_id = ?
        `).run(newBid, campaign.campaign_id);

        // 记录调价历史
        database.prepare(`
          INSERT INTO bid_history (campaign_id, old_bid, new_bid, action, acos, target_acos, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(campaign.campaign_id, campaign.current_bid, newBid, action, metrics.acos, targetAcos);
      }

      results.adjusted++;
    }
  } catch (e) {
    results.errors.push(e.message);
    console.error('调价周期执行失败:', e);
  }

  return results;
}

/**
 * 获取调价历史
 * @param {string} campaignId - 可选：活动ID
 * @param {number} limit - 返回条数
 * @returns {Array}
 */
function getBidHistory(campaignId, limit = 50) {
  if (!database) return [];

  try {
    let sql = `
      SELECT * FROM bid_history
    `;
    const params = [];

    if (campaignId) {
      sql += ' WHERE campaign_id = ?';
      params.push(campaignId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return database.prepare(sql).all(...params);
  } catch (e) {
    console.error('获取调价历史失败:', e.message);
    return [];
  }
}

/**
 * 创建/更新调价规则
 * @param {Object} ruleData - 规则数据
 * @returns {Object}
 */
function saveRule(ruleData) {
  if (!database) return { success: false, error: '数据库未连接' };

  try {
    const {
      campaign_id,
      target_acos = 15,
      tolerance = 5,
      increase_step = 0.1,
      decrease_step = 0.1,
      aggressive_step = 0.2,
      min_orders = 1,
      max_bid = 10,
      min_bid = 0.02,
      strategy = 'normal',
      adjustment_type = 'fixed',
      enabled = 1,
      start_date = null,
      end_date = null,
      priority = 0
    } = ruleData;

    // 检查是否已存在
    const existing = database.prepare(
      'SELECT id FROM acos_rules WHERE campaign_id = ?'
    ).get(campaign_id);

    if (existing) {
      database.prepare(`
        UPDATE acos_rules SET
          target_acos = ?, tolerance = ?, increase_step = ?, decrease_step = ?,
          aggressive_step = ?, min_orders = ?, max_bid = ?, min_bid = ?,
          strategy = ?, adjustment_type = ?, enabled = ?,
          start_date = ?, end_date = ?, priority = ?,
          updated_at = datetime('now')
        WHERE campaign_id = ?
      `).run(
        target_acos, tolerance, increase_step, decrease_step,
        aggressive_step, min_orders, max_bid, min_bid,
        strategy, adjustment_type, enabled,
        start_date, end_date, priority,
        campaign_id
      );
      return { success: true, message: '规则已更新' };
    } else {
      database.prepare(`
        INSERT INTO acos_rules (
          campaign_id, target_acos, tolerance, increase_step, decrease_step,
          aggressive_step, min_orders, max_bid, min_bid, strategy,
          adjustment_type, enabled, start_date, end_date, priority, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        campaign_id, target_acos, tolerance, increase_step, decrease_step,
        aggressive_step, min_orders, max_bid, min_bid, strategy,
        adjustment_type, enabled, start_date, end_date, priority
      );
      return { success: true, message: '规则已创建' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 删除调价规则
 * @param {string} campaignId - 活动ID
 * @returns {Object}
 */
function deleteRule(campaignId) {
  if (!database) return { success: false, error: '数据库未连接' };

  try {
    database.prepare('DELETE FROM acos_rules WHERE campaign_id = ?').run(campaignId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 获取所有调价规则
 * @returns {Array}
 */
function getAllRules() {
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT r.*, c.campaign_name
      FROM acos_rules r
      LEFT JOIN campaigns c ON r.campaign_id = c.campaign_id
      ORDER BY r.priority DESC, r.created_at DESC
    `).all();
  } catch (e) {
    console.error('获取规则列表失败:', e.message);
    return [];
  }
}

module.exports = {
  getEffectiveRules,
  calculateTargetAcos,
  determineBidAction,
  calculateNewBid,
  runBiddingCycle,
  getBidHistory,
  saveRule,
  deleteRule,
  getAllRules
};
