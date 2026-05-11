/**
 * 库存管理服务
 * 功能：
 *   1. 库存台账（手动录入或接 SP-API）
 *   2. DOI（库存周转天数）计算
 *   3. 库存预警规则引擎
 *   4. 库存联动广告控制建议
 */

class InventoryService {

  constructor() {
    this.inventoryCache = new Map();
    this.ALERT_THRESHOLDS = {
      CRITICAL: 7,   // 库存不足7天，断货风险极高
      WARNING:  14,  // 库存不足14天，需要关注
      LOW:      21,  // 库存不足21天，建议开始补货
      HEALTHY:  30   // 库存超过30天，正常
    };
    this.DEFAULT_DAILY_SALES = {};
    this._actionHistory = [];
  }

  _getAlertLevel(doi) {
    if (doi <= this.ALERT_THRESHOLDS.CRITICAL) return 'CRITICAL';
    if (doi <= this.ALERT_THRESHOLDS.WARNING)  return 'WARNING';
    if (doi <= this.ALERT_THRESHOLDS.LOW)      return 'LOW';
    return 'HEALTHY';
  }

  _getActionSuggestion(doi, alertLevel) {
    switch (alertLevel) {
      case 'CRITICAL':
        return { priority: 'HIGH', action: 'PAUSE_ADS', message: '库存极度不足（<7天），立即暂停广告投放，防止断货导致权重崩塌', budgetAdjust: -1.0, bidAdjust: -1.0 };
      case 'WARNING':
        return { priority: 'MEDIUM', action: 'REDUCE_BUDGET', message: `库存仅剩${doi.toFixed(0)}天，建议立即补货，同时降低广告强度`, budgetAdjust: -0.6, bidAdjust: -0.3 };
      case 'LOW':
        return { priority: 'LOW', action: 'REDUCE_BUDGET', message: `库存${doi.toFixed(0)}天，建议补货并逐步降低广告预算`, budgetAdjust: -0.3, bidAdjust: -0.15 };
      default:
        return { priority: 'NONE', action: 'KEEP_NORMAL', message: '库存充足，维持当前广告策略', budgetAdjust: 0, bidAdjust: 0 };
    }
  }

  // ── 库存台账 ─────────────────────────────────────────────────

  upsertInventoryItem(item) {
    const sku = item.sku;
    if (!sku) throw new Error('SKU 不能为空');

    const dailySales = item.dailySales || this.DEFAULT_DAILY_SALES[sku] || 1;
    const doi = item.stock / dailySales;
    const alertLevel = this._getAlertLevel(doi);
    const action = this._getActionSuggestion(doi, alertLevel);

    const record = {
      sku,
      asin:      item.asin      || '',
      name:      item.name      || '',
      stock:     Number(item.stock) || 0,
      dailySales,
      doi:       Math.round(doi * 10) / 10,
      alertLevel,
      unitCost:  Number(item.unitCost) || 0,
      action,
      updatedAt: item.updatedAt || new Date().toISOString()
    };

    this.inventoryCache.set(sku, record);
    return record;
  }

  upsertBatch(items) {
    const results = [];
    for (const item of items) {
      try {
        results.push({ sku: item.sku, ok: true, data: this.upsertInventoryItem(item) });
      } catch (e) {
        results.push({ sku: item.sku, ok: false, error: e.message });
      }
    }
    return results;
  }

  // ── 查询 ─────────────────────────────────────────────────────

  getInventory(sku) {
    return this.inventoryCache.get(sku) || null;
  }

  getAllInventory() {
    return Array.from(this.inventoryCache.values());
  }

  getAlertSummary() {
    const all = this.getAllInventory();
    return {
      total:    all.length,
      critical: all.filter(i => i.alertLevel === 'CRITICAL').length,
      warning:  all.filter(i => i.alertLevel === 'WARNING').length,
      low:      all.filter(i => i.alertLevel === 'LOW').length,
      healthy:  all.filter(i => i.alertLevel === 'HEALTHY').length,
      items: all
    };
  }

  // ── 联动分析 ──────────────────────────────────────────────────

  generateInventoryActions(campaigns, keywords, options = {}) {
    const { reduceBy = 'moderate' } = options;
    const reductionMap = { aggressive: 0.5, moderate: 0.75, mild: 0.9 };

    const allInventory = this.getAllInventory();
    if (allInventory.length === 0) {
      return { actions: [], message: '暂无库存数据，请先录入库存' };
    }

    const skuDoiMap = new Map(allInventory.map(i => [i.sku, i]));
    const actions = [];
    const processedCampaigns = new Set();

    for (const inv of allInventory) {
      const { doi, alertLevel, action, sku, name } = inv;
      if (alertLevel === 'HEALTHY') continue;

      const matchedCampaigns = campaigns.filter(c => {
        if (processedCampaigns.has(c.campaignId)) return false;
        const cname = (c.campaignName || '').toLowerCase();
        const sname = (name || '').toLowerCase();
        return cname.includes(sku.toLowerCase()) || sname.includes(sku.toLowerCase()) || cname.includes(sname);
      });

      for (const camp of matchedCampaigns) {
        processedCampaigns.add(camp.campaignId);

        if (alertLevel === 'CRITICAL' || action.action === 'PAUSE_ADS') {
          actions.push({
            campaignId:    camp.campaignId,
            campaignName:  camp.campaignName,
            sku,
            alertLevel,
            doi:           doi.toFixed(1),
            suggestedAction: 'PAUSE',
            currentBudget:  camp.campaignBudget,
            currentState:   camp.state,
            reason:         `${sku} 库存仅剩 ${doi.toFixed(0)} 天 — ${action.message}`
          });
        } else {
          const ratio = reductionMap[reduceBy] || 0.75;
          const newBudget = Math.max(1, (camp.campaignBudget || 5) * ratio);
          actions.push({
            campaignId:     camp.campaignId,
            campaignName:   camp.campaignName,
            sku,
            alertLevel,
            doi:            doi.toFixed(1),
            suggestedAction: 'REDUCE_BUDGET',
            currentBudget:  camp.campaignBudget,
            suggestedBudget: Math.round(newBudget * 100) / 100,
            budgetChange:   `${Math.round((ratio - 1) * 100)}%`,
            currentState:   camp.state,
            reason:         `${sku} 库存 ${doi.toFixed(0)} 天（${reduceBy}模式）— ${action.message}`
          });
        }
      }
    }

    return {
      actions,
      summary: {
        total:   actions.length,
        pause:   actions.filter(a => a.suggestedAction === 'PAUSE').length,
        reduce:  actions.filter(a => a.suggestedAction === 'REDUCE_BUDGET').length,
        skipped: campaigns.length - processedCampaigns.size
      }
    };
  }

  // ── 历史记录 ──────────────────────────────────────────────────

  logInventoryAction(action) {
    this._actionHistory.unshift({
      ...action,
      timestamp: new Date().toISOString()
    });
    if (this._actionHistory.length > 500) {
      this._actionHistory = this._actionHistory.slice(0, 500);
    }
  }

  getActionHistory(limit = 50) {
    return this._actionHistory.slice(0, limit);
  }

  clearInventory() {
    this.inventoryCache.clear();
    return { ok: true };
  }
}

module.exports = new InventoryService();
