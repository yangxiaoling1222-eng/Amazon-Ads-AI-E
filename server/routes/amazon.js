/**
 * Amazon Ads API 路由
 * 对应服务: server/services/amazon-ads.js
 */

const express = require('express');
const router  = express.Router();
const ads     = require('../services/amazon-ads');

// ─────────────────────────────────────────────────────────────────
// 工具：统一错误响应
// ─────────────────────────────────────────────────────────────────
function fail(res, err, code = 500) {
  const msg = err?.response?.data?.message || err?.message || '请求失败';
  console.error('[Amazon API Error]', msg);
  return res.status(code).json({ success: false, message: msg });
}

function requireParams(res, params, body) {
  const missing = params.filter(p => body[p] == null && body[p] !== 0);
  if (missing.length) {
    res.status(400).json({ success: false, message: `缺少必要参数: ${missing.join(', ')}` });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────
// 1. 连接测试
// ─────────────────────────────────────────────────────────────────
router.get('/test', async (req, res) => {
  try {
    const result = await ads.testConnection();
    res.json(result);
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 2. Profiles
// ─────────────────────────────────────────────────────────────────
router.get('/profiles', async (req, res) => {
  try {
    const data = await ads.getProfiles();
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 3. Campaigns
// ─────────────────────────────────────────────────────────────────
// GET /amazon/campaigns?profileId=xxx&states=ENABLED,PAUSED&portfolioIds=p1,p2
router.get('/campaigns', async (req, res) => {
  try {
    const { profileId, states, portfolioIds } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });

    const filters = {};
    if (states)       filters.states            = states.split(',').map(s => s.trim());
    if (portfolioIds) filters.portfolioIdFilter  = portfolioIds.split(',').map(s => s.trim());

    const data = await ads.getCampaigns(profileId, filters);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// PUT /amazon/campaigns  — 批量更新活动（出价/预算/状态）
// body: { profileId, campaigns: [{ campaignId, budget, state }, ...] }
router.put('/campaigns', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'campaigns'], req.body)) return;
    const { profileId, campaigns } = req.body;
    const data = await ads.updateCampaigns(profileId, campaigns);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 4. Ad Groups
// ─────────────────────────────────────────────────────────────────
// GET /amazon/adgroups?profileId=xxx&campaignIds=c1,c2
router.get('/adgroups', async (req, res) => {
  try {
    const { profileId, campaignIds, states } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });

    const filters = {};
    if (campaignIds) filters.campaignIdFilter = campaignIds.split(',').map(s => s.trim());
    if (states)      filters.states           = states.split(',').map(s => s.trim());

    const data = await ads.getAdGroups(profileId, filters);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 5. Keywords
// ─────────────────────────────────────────────────────────────────
// GET /amazon/keywords?profileId=xxx&campaignIds=c1&adGroupIds=ag1
router.get('/keywords', async (req, res) => {
  try {
    const { profileId, campaignIds, adGroupIds, states } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });

    const filters = {};
    if (campaignIds) filters.campaignIdFilter = campaignIds.split(',').map(s => s.trim());
    if (adGroupIds)  filters.adGroupIdFilter  = adGroupIds.split(',').map(s => s.trim());
    if (states)      filters.states           = states.split(',').map(s => s.trim());

    const data = await ads.getKeywords(profileId, filters);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// PUT /amazon/keywords  — 批量更新关键词出价/状态
// body: { profileId, keywords: [{ keywordId, bid, state }, ...] }
router.put('/keywords', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'keywords'], req.body)) return;
    const { profileId, keywords } = req.body;
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'keywords 数组不能为空' });
    }
    const data = await ads.updateKeywords(profileId, keywords);
    res.json({ success: true, data, updated: keywords.length });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 6. 否定关键词
// ─────────────────────────────────────────────────────────────────
// POST /amazon/negative-keywords
// body: { profileId, negatives: [{ campaignId, adGroupId, keywordText, matchType }, ...] }
router.post('/negative-keywords', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'negatives'], req.body)) return;
    const { profileId, negatives } = req.body;
    if (!Array.isArray(negatives) || negatives.length === 0) {
      return res.status(400).json({ success: false, message: 'negatives 数组不能为空' });
    }
    const data = await ads.addNegativeKeywords(profileId, negatives);
    res.json({ success: true, data, added: negatives.length });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 7. Product Targetings
// ─────────────────────────────────────────────────────────────────
router.get('/targetings', async (req, res) => {
  try {
    const { profileId, campaignIds, adGroupIds, states } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });

    const filters = {};
    if (campaignIds) filters.campaignIdFilter = campaignIds.split(',').map(s => s.trim());
    if (adGroupIds)  filters.adGroupIdFilter  = adGroupIds.split(',').map(s => s.trim());
    if (states)      filters.states           = states.split(',').map(s => s.trim());

    const data = await ads.getTargetings(profileId, filters);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 7.1 ASIN 定向（商品投放）
// ─────────────────────────────────────────────────────────────────

/**
 * POST /amazon/asin-targeting
 * 批量创建 ASIN 商品定向
 * body: { profileId, targetings: [{ campaignId, adGroupId, asin, bid }, ...] }
 */
router.post('/asin-targeting', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'targetings'], req.body)) return;
    const { profileId, targetings } = req.body;
    if (!Array.isArray(targetings) || targetings.length === 0) {
      return res.status(400).json({ success: false, message: 'targetings 不能为空' });
    }
    const data = await ads.createProductTargetings(profileId, targetings);
    res.json({ success: true, data, created: targetings.length });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/asin-targeting/negate
 * 批量创建 ASIN 否定定向
 * body: { profileId, negatives: [{ campaignId, asin }, ...] }
 */
router.post('/asin-targeting/negate', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'negatives'], req.body)) return;
    const { profileId, negatives } = req.body;
    if (!Array.isArray(negatives) || negatives.length === 0) {
      return res.status(400).json({ success: false, message: 'negatives 不能为空' });
    }
    const data = await ads.createNegativeAsinTargetings(profileId, negatives);
    res.json({ success: true, data, created: negatives.length });
  } catch (err) { fail(res, err); }
});

/**
 * GET /amazon/asin-targeting?profileId=xxx&campaignIds=c1,c2
 * 查询已有的 ASIN 定向列表
 */
router.get('/asin-targeting', async (req, res) => {
  try {
    const { profileId, campaignIds } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });
    const ids = campaignIds ? campaignIds.split(',').map(s => s.trim()) : [];
    const targetings = await ads.getAsinTargetings(profileId, ids);
    const asinList = targetings.map(t => {
      try {
        const expr = t.targetingClause?.expression || [];
        const asinExpr = expr.find(e => e.type === 'asinSameAs' || e.type === 'asin');
        return {
          targetingId: t.targetingId,
          asin: asinExpr?.value || '',
          campaignId: t.campaignId,
          adGroupId:  t.adGroupId,
          state: t.state,
          bid:   t.bid
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json({ success: true, total: asinList.length, targetings: asinList });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 8. 搜索词报告 + 关键词收割
// ─────────────────────────────────────────────────────────────────

/**
 * GET /amazon/search-terms?profileId=xxx&startDate=2026-04-01&endDate=2026-04-30&campaignIds=c1,c2
 * 获取搜索词报告原始数据
 */
router.get('/search-terms', async (req, res) => {
  try {
    const { profileId, startDate, endDate, campaignIds } = req.query;
    if (!profileId) return res.status(400).json({ success: false, message: '需要提供 profileId' });

    const opts = {};
    if (startDate)  opts.startDate  = startDate;
    if (endDate)    opts.endDate    = endDate;
    if (campaignIds) opts.campaignIds = campaignIds.split(',').map(s => s.trim());

    const data = await ads.getSearchTermReport(profileId, opts);
    res.json({ success: true, total: data.length, data });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/harvest/analyze
 * 分析搜索词报告，返回"可收割词"和"建议否定词"，不执行任何操作
 * body: {
 *   searchTerms: [...],    // 搜索词报告数据（可从 /amazon/search-terms 获取）
 *   rules: {               // 可选，收割规则
 *     harvestMinOrders, harvestMaxAcos, negateMinClicks,
 *     negateMaxAcos, negateNoConvClicks, targetAcos, avgOrderValue
 *   }
 * }
 */
router.post('/harvest/analyze', (req, res) => {
  try {
    if (!requireParams(res, ['searchTerms'], req.body)) return;
    const { searchTerms, rules = {} } = req.body;

    if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
      return res.status(400).json({ success: false, message: 'searchTerms 不能为空' });
    }

    const result = ads.analyzeSearchTerms(searchTerms, rules);
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/harvest/execute
 * 执行关键词收割：
 *   1. 把"收割词"创建为手动精准关键词
 *   2. 把"否定词"添加为否定关键词
 * body: {
 *   profileId,
 *   harvest: [{ adGroupId, campaignId, searchTerm, suggestedBid }, ...],
 *   negate:  [{ campaignId, adGroupId, searchTerm, matchType }, ...],
 *   options: {
 *     dryRun: true,           // 不实际调 API，只返回预览
 *     harvestMatchType: 'EXACT',    // 默认 EXACT
 *     skipExisting: true      // 如果词已存在则跳过（默认 true）
 *   }
 * }
 */
router.post('/harvest/execute', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId'], req.body)) return;
    const {
      profileId,
      harvest  = [],
      negate   = [],
      options  = {}
    } = req.body;

    const { dryRun = false, harvestMatchType = 'EXACT' } = options;

    if (harvest.length === 0 && negate.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要处理的词' });
    }

    // 构建结果
    const result = {
      dryRun,
      harvestCount: harvest.length,
      negateCount:  negate.length,
      harvestResult: null,
      negateResult:  null
    };

    if (!dryRun) {
      // 执行：创建精准关键词
      if (harvest.length > 0) {
        const kwPayload = harvest.map(h => ({
          adGroupId:   h.adGroupId,
          campaignId:  h.campaignId,
          keywordText: h.searchTerm,
          matchType:   harvestMatchType,
          bid:         h.suggestedBid || 0.50,
          state:       'ENABLED'
        }));
        result.harvestResult = await ads.createKeywords(profileId, kwPayload);
      }

      // 执行：添加否定词
      if (negate.length > 0) {
        const negPayload = negate.map(n => ({
          campaignId:  n.campaignId,
          adGroupId:   n.adGroupId,
          keywordText: n.searchTerm,
          matchType:   n.matchType || 'NEGATIVE_EXACT'
        }));
        result.negateResult = await ads.addNegativeKeywords(profileId, negPayload);
      }
    }

    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/harvest/auto
 * 一键全自动收割：拉报告 → 分析 → 执行（三步合一）
 * body: {
 *   profileId,
 *   startDate, endDate,
 *   campaignIds: ['c1', 'c2'],   // 可选，不填则全部活动
 *   rules: { ... },              // 收割规则
 *   options: { dryRun, harvestMatchType }
 * }
 */
router.post('/harvest/auto', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId'], req.body)) return;
    const {
      profileId,
      startDate, endDate, campaignIds,
      rules   = {},
      options = {}
    } = req.body;

    // Step 1: 拉搜索词报告
    const reportOpts = {};
    if (startDate)  reportOpts.startDate  = startDate;
    if (endDate)    reportOpts.endDate    = endDate;
    if (campaignIds) reportOpts.campaignIds = campaignIds;

    const searchTerms = await ads.getSearchTermReport(profileId, reportOpts);

    // Step 2: 分析
    const analysis = ads.analyzeSearchTerms(searchTerms, rules);

    // Step 3: 执行
    const { dryRun = false, harvestMatchType = 'EXACT' } = options;
    const execResult = { dryRun, harvestResult: null, negateResult: null };

    if (!dryRun) {
      if (analysis.harvest.length > 0) {
        const kwPayload = analysis.harvest.map(h => ({
          adGroupId:   h.adGroupId,
          campaignId:  h.campaignId,
          keywordText: h.searchTerm,
          matchType:   harvestMatchType,
          bid:         h.suggestedBid || 0.50,
          state:       'ENABLED'
        }));
        execResult.harvestResult = await ads.createKeywords(profileId, kwPayload);
      }

      if (analysis.negate.length > 0) {
        const negPayload = analysis.negate.map(n => ({
          campaignId:  n.campaignId,
          adGroupId:   n.adGroupId,
          keywordText: n.searchTerm,
          matchType:   'NEGATIVE_EXACT'
        }));
        execResult.negateResult = await ads.addNegativeKeywords(profileId, negPayload);
      }
    }

    res.json({
      success: true,
      reportRows: searchTerms.length,
      ...analysis,
      ...execResult
    });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 9. 手动创建关键词
// ─────────────────────────────────────────────────────────────────
/**
 * POST /amazon/keywords
 * body: { profileId, keywords: [{ adGroupId, campaignId, keywordText, matchType, bid, state }] }
 */
router.post('/keywords', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'keywords'], req.body)) return;
    const { profileId, keywords } = req.body;
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'keywords 不能为空' });
    }
    const data = await ads.createKeywords(profileId, keywords);
    res.json({ success: true, data, created: keywords.length });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 10. 报告（通用）
// ─────────────────────────────────────────────────────────────────
// POST /amazon/report
// body: { profileId, reportRequest: { ... } }
router.post('/report', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'reportRequest'], req.body)) return;
    const { profileId, reportRequest } = req.body;
    const data = await ads.getReport(profileId, reportRequest);
    res.json({ success: true, data });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 9. 智能出价建议（本地计算，不调 Amazon API）
// ─────────────────────────────────────────────────────────────────
/**
 * POST /amazon/bid-suggestions
 * body: {
 *   targetAcos: 15,          // 目标 ACoS（%）
 *   keywords: [
 *     { id, keyword, bid, acos },  // acos 为实际 ACoS（%）
 *     ...
 *   ],
 *   options: { minBid, maxBid, maxChangePct }   // 可选
 * }
 */
router.post('/bid-suggestions', (req, res) => {
  try {
    if (!requireParams(res, ['targetAcos', 'keywords'], req.body)) return;
    const { targetAcos, keywords, options = {} } = req.body;

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: 'keywords 数组不能为空' });
    }

    const suggestions = ads.generateBidSuggestions(keywords, targetAcos, options);
    res.json({
      success: true,
      targetAcos,
      total: keywords.length,
      adjustCount: suggestions.length,
      suggestions
    });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 10. 一键应用智能出价（计算 + 调用 Amazon API）
// ─────────────────────────────────────────────────────────────────
/**
 * POST /amazon/apply-smart-bids
 * body: {
 *   profileId,
 *   targetAcos,
 *   keywords: [{ id, bid, acos, keyword }],
 *   options: { minBid, maxBid, maxChangePct, dryRun }
 * }
 */
router.post('/apply-smart-bids', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'targetAcos', 'keywords'], req.body)) return;
    const { profileId, targetAcos, keywords, options = {} } = req.body;

    const result = await ads.applySmartBids(profileId, keywords, targetAcos, options);
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 11. 库存管理 + 库存联动广告
// ─────────────────────────────────────────────────────────────────
const inventory = require('../services/inventory');

/**
 * GET /amazon/inventory/summary
 * 获取库存预警概览
 */
router.get('/inventory/summary', (req, res) => {
  try {
    const summary = inventory.getAlertSummary();
    res.json({ success: true, ...summary });
  } catch (err) { fail(res, err); }
});

/**
 * GET /amazon/inventory/all
 * 获取所有库存记录
 */
router.get('/inventory/all', (req, res) => {
  try {
    const items = inventory.getAllInventory();
    res.json({ success: true, total: items.length, items });
  } catch (err) { fail(res, err); }
});

/**
 * GET /amazon/inventory/:sku
 * 获取单个 SKU 库存
 */
router.get('/inventory/:sku', (req, res) => {
  try {
    const item = inventory.getInventory(req.params.sku);
    if (!item) return res.status(404).json({ success: false, message: '未找到该 SKU' });
    res.json({ success: true, data: item });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/inventory/upsert
 * 录入/更新单个 SKU 库存
 * body: { sku, asin, name, stock, dailySales?, unitCost? }
 */
router.post('/inventory/upsert', (req, res) => {
  try {
    if (!requireParams(res, ['sku', 'stock'], req.body)) return;
    const item = inventory.upsertInventoryItem(req.body);
    res.json({ success: true, data: item });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/inventory/batch
 * 批量录入库存（支持前端导出的 Excel 数据）
 * body: { items: [{ sku, asin?, name?, stock, dailySales?, unitCost? }, ...] }
 */
router.post('/inventory/batch', (req, res) => {
  try {
    if (!requireParams(res, ['items'], req.body)) return;
    if (!Array.isArray(req.body.items)) {
      return res.status(400).json({ success: false, message: 'items 必须是数组' });
    }
    const results = inventory.upsertBatch(req.body.items);
    res.json({ success: true, total: results.length, results });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/inventory/link-ads
 * 库存联动广告：生成调整建议（基于库存 + 广告活动数据）
 * body: {
 *   campaigns: [{ campaignId, campaignName, campaignBudget, state }],
 *   reduceBy: 'aggressive' | 'moderate' | 'mild'
 * }
 */
router.post('/inventory/link-ads', async (req, res) => {
  try {
    if (!requireParams(res, ['campaigns'], req.body)) return;
    const { campaigns, keywords = [], reduceBy = 'moderate' } = req.body;
    const result = inventory.generateInventoryActions(campaigns, keywords, { reduceBy });
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/inventory/execute-actions
 * 执行库存联动建议（暂停/降预算）
 * body: {
 *   profileId,
 *   actions: [{ campaignId, suggestedAction, suggestedBudget?, currentBudget? }, ...],
 *   dryRun: true/false
 * }
 */
router.post('/inventory/execute-actions', async (req, res) => {
  try {
    if (!requireParams(res, ['profileId', 'actions'], req.body)) return;
    const { profileId, actions, dryRun = false } = req.body;

    // 记录历史
    inventory.logInventoryAction({ profileId, actions, dryRun });

    if (dryRun) {
      return res.json({ success: true, dryRun: true, executed: 0, message: 'dryRun 模式，仅记录建议' });
    }

    // 分类：暂停 & 降预算
    const pauseActions = actions.filter(a => a.suggestedAction === 'PAUSE');
    const reduceActions = actions.filter(a => a.suggestedAction === 'REDUCE_BUDGET');

    let campaignUpdates = [];

    for (const a of reduceActions) {
      if (a.suggestedBudget != null) {
        campaignUpdates.push({
          campaignId: a.campaignId,
          budget: a.suggestedBudget
        });
      }
    }
    for (const a of pauseActions) {
      campaignUpdates.push({
        campaignId: a.campaignId,
        state: 'PAUSED'
      });
    }

    let updateResult = { updated: 0 };
    if (campaignUpdates.length > 0) {
      updateResult = await ads.updateCampaigns(profileId, campaignUpdates);
    }

    res.json({
      success: true,
      dryRun: false,
      executed: campaignUpdates.length,
      pauseCount: pauseActions.length,
      reduceCount: reduceActions.length,
      updateResult
    });
  } catch (err) { fail(res, err); }
});

/**
 * GET /amazon/inventory/history
 * 获取库存联动操作历史
 */
router.get('/inventory/history', (req, res) => {
  try {
    const history = inventory.getActionHistory(Number(req.query.limit) || 50);
    res.json({ success: true, total: history.length, history });
  } catch (err) { fail(res, err); }
});

/**
 * DELETE /amazon/inventory/all
 * 清空所有库存数据（谨慎使用）
 */
router.delete('/inventory/all', (req, res) => {
  try {
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ success: false, message: '请确认删除：添加 ?confirm=true' });
    }
    const result = inventory.clearInventory();
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// 12. TACOS 计算（广告销售占总销售的比例）
// ─────────────────────────────────────────────────────────────────

/**
 * GET /amazon/tacos?profileId=xxx&startDate=2026-03-01&endDate=2026-03-31
 * 计算 TACOS：总广告花费 / 总销售额（含自然销售）
 *
 * 注意：自然销售数据需要 SP-API 或用户手动录入
 * 如无自然销售数据，退化为 totalAcos
 *
 * body 可选: { adSales, totalSales }  // 手动提供数据时的格式
 */
router.get('/tacos', async (req, res) => {
  try {
    const { profileId, startDate, endDate } = req.query;

    // 如果前端提供了手动数据
    if (req.query.adSales && req.query.totalSales) {
      const adSales    = Number(req.query.adSales);
      const totalSales = Number(req.query.totalSales);
      const tacos = totalSales > 0 ? (adSales / totalSales) * 100 : 0;
      return res.json({
        success: true,
        tacos: parseFloat(tacos.toFixed(2)),
        adSales,
        naturalSales: totalSales - adSales,
        totalSales,
        source: 'manual'
      });
    }

    // 从 Amazon API 拉取广告数据
    if (!profileId) {
      return res.status(400).json({ success: false, message: '需要 profileId 或手动提供 adSales/totalSales' });
    }

    // 拉取日期范围内的广告汇总（用 getCampaigns + 每活动 spending 汇总）
    // 更准确的是拉 report，但 report 是异步的，这里用简化的 campaign 维度
    const campaigns = await ads.getCampaigns(profileId, { states: ['ENABLED', 'PAUSED'] });

    // 如果有报表数据，按需拉取（这里返回结构化的空壳，让前端自行填充）
    res.json({
      success: true,
      message: 'TACOS 计算需要广告销售数据 + 自然销售数据',
      source: 'api_requires_report',
      instructions: {
        adSales:    '请从广告报表获取总广告销售额（sales14d）',
        totalSales: '请提供包含自然销售的总销售额（需 SP-API 或手动）',
        formula: 'TACOS(%) = (广告花费 / 总销售额) × 100'
      },
      // Mock 数据示例（实际使用时替换为真实数据）
      mockData: {
        adSales:    45230,
        naturalSales: 128700,
        totalSales: 173930,
        adSpend:    8134,
        tacos: 4.68,
        totalAcos: (8134 / 45230) * 100
      }
    });
  } catch (err) { fail(res, err); }
});

/**
 * POST /amazon/tacos/calculate
 * 手动计算 TACOS（前端汇总好数据后提交）
 * body: { adSpend, adSales, naturalSales, totalSales, startDate?, endDate? }
 */
router.post('/tacos/calculate', (req, res) => {
  try {
    const { adSpend, adSales, naturalSales, totalSales, startDate, endDate } = req.body;

    if (adSpend == null || adSales == null) {
      return res.status(400).json({ success: false, message: '需要 adSpend 和 adSales' });
    }

    const total  = totalSales  || (adSales + (naturalSales || 0));
    const tacos  = total  > 0 ? (adSpend / total)  * 100 : 0;
    const acos   = adSales > 0 ? (adSpend / adSales) * 100 : 0;
    const naturals = total - adSales;

    res.json({
      success: true,
      startDate, endDate,
      adSpend:   parseFloat(adSpend.toFixed(2)),
      adSales:   parseFloat(adSales.toFixed(2)),
      naturalSales: naturals > 0 ? parseFloat(naturals.toFixed(2)) : null,
      totalSales:  parseFloat(total.toFixed(2)),
      tacos:      parseFloat(tacos.toFixed(2)),
      acos:       parseFloat(acos.toFixed(2)),
      ratio: {
        naturalRatio: total > 0 ? parseFloat(((total - adSales) / total * 100).toFixed(1)) : null,
        adRatio:      total > 0 ? parseFloat((adSales / total * 100).toFixed(1)) : null
      },
      verdict: tacos <= 5 ? '极优秀' : tacos <= 10 ? '优秀' : tacos <= 20 ? '良好' : tacos <= 30 ? '需优化' : '严重超标'
    });
  } catch (err) { fail(res, err); }
});

module.exports = router;
