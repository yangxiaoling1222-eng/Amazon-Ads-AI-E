/**
 * Amazon Ads API 服务
 * SP API v3 规范：
 *   - list 类接口统一使用 POST 方法，过滤条件放 body
 *   - 更新类接口使用 PUT 方法，批量操作传数组
 *   - 报告接口: POST /reporting/reports
 * 文档: https://advertising.amazon.com/API/docs/en-us/sponsored-products/3-0/openapi/prod
 */

const axios = require('axios');

// ─────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────
const ENDPOINTS = {
  NA: 'https://advertising-api.amazon.com',
  EU: 'https://advertising-api-eu.amazon.com',
  FE: 'https://advertising-api-fe.amazon.com',
  SANDBOX: 'https://advertising-api-test.amazon.com'
};

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// SP API v3 Content-Type 常量
const CT = {
  LIST:          'application/vnd.spCampaign.v3+json',
  CAMPAIGN_PUT:  'application/vnd.spCampaign.v3+json',
  KEYWORD_PUT:   'application/vnd.spKeyword.v3+json',
  ADGROUP_PUT:   'application/vnd.spAdGroup.v3+json',
  TARGETING_PUT: 'application/vnd.spTargetingClause.v3+json',
  NEGATIVE:      'application/vnd.spNegativeKeyword.v3+json',
  REPORT:        'application/vnd.createasyncreportrequest.v3+json',
  JSON:          'application/json'
};

// ─────────────────────────────────────────────────────────────────
// 辅助：指数退避 sleep
// ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = i === maxAttempts - 1;
      const status = err.response?.status;
      // 429 / 5xx 才重试
      if (isLast || (status && status < 429)) throw err;
      await sleep(baseDelay * Math.pow(2, i));
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 智能出价算法
// ─────────────────────────────────────────────────────────────────
/**
 * 根据实际 ACoS 与目标 ACoS 计算建议出价
 * 策略：
 *   - actualAcos > targetAcos * 1.3  => 降价 15%
 *   - actualAcos > targetAcos * 1.1  => 降价  8%
 *   - actualAcos < targetAcos * 0.7  => 涨价 15%（还有空间）
 *   - actualAcos < targetAcos * 0.9  => 涨价  8%
 *   - 其他                           => 不变
 * @param {number} currentBid    当前出价
 * @param {number} actualAcos    实际 ACoS（百分比，如 18.5）
 * @param {number} targetAcos    目标 ACoS（百分比，如 15）
 * @param {object} opts          minBid / maxBid / maxChangePct
 * @returns {{ newBid, changePercent, action }}
 */
function calcSmartBid(currentBid, actualAcos, targetAcos, opts = {}) {
  const { minBid = 0.02, maxBid = 20, maxChangePct = 0.25 } = opts;

  const ratio = actualAcos / targetAcos;
  let changePct = 0;
  let action = 'hold';

  if (ratio > 1.3)       { changePct = -0.15; action = 'decrease_large'; }
  else if (ratio > 1.1)  { changePct = -0.08; action = 'decrease_small'; }
  else if (ratio < 0.7)  { changePct =  0.15; action = 'increase_large'; }
  else if (ratio < 0.9)  { changePct =  0.08; action = 'increase_small'; }

  // 限制最大单次变幅
  changePct = Math.max(-maxChangePct, Math.min(maxChangePct, changePct));

  const rawBid = currentBid * (1 + changePct);
  const newBid = Math.max(minBid, Math.min(maxBid, parseFloat(rawBid.toFixed(2))));

  return { newBid, changePercent: changePct * 100, action };
}

/**
 * 批量生成出价建议（不调 API，仅本地计算）
 * @param {Array} keywords  [{ id, bid, acos }, ...]
 * @param {number} targetAcos
 * @param {object} opts
 * @returns {Array} [{ id, currentBid, suggestedBid, changePercent, action }, ...]
 */
function generateBidSuggestions(keywords, targetAcos, opts = {}) {
  return keywords
    .filter(k => k.acos != null && k.bid != null)
    .map(k => {
      const { newBid, changePercent, action } = calcSmartBid(k.bid, k.acos, targetAcos, opts);
      return {
        id: k.id,
        keyword: k.keyword,
        currentBid: k.bid,
        suggestedBid: newBid,
        changePercent: parseFloat(changePercent.toFixed(1)),
        action,
        currentAcos: k.acos,
        targetAcos
      };
    })
    .filter(k => k.action !== 'hold');       // 只返回有动作的
}

// ─────────────────────────────────────────────────────────────────
// 主服务类
// ─────────────────────────────────────────────────────────────────
class AmazonAdsService {
  constructor() {
    this.clientId     = process.env.AMAZON_CLIENT_ID;
    this.clientSecret = process.env.AMAZON_CLIENT_SECRET;
    this.refreshToken = process.env.AMAZON_REFRESH_TOKEN;
    this.region       = (process.env.AMAZON_REGION || 'NA').toUpperCase();
    this.sandbox      = process.env.AMAZON_SANDBOX === 'true';

    this._accessToken  = null;
    this._tokenExpiry  = null;
  }

  // ── 基础 URL ──────────────────────────────────────────────────
  get baseUrl() {
    return this.sandbox ? ENDPOINTS.SANDBOX : (ENDPOINTS[this.region] || ENDPOINTS.NA);
  }

  // ── Token 管理（带重试）────────────────────────────────────────
  async getAccessToken() {
    if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }
    return withRetry(async () => {
      const res = await axios.post(TOKEN_URL,
        new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: this.refreshToken,
          client_id:     this.clientId,
          client_secret: this.clientSecret
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      this._accessToken = res.data.access_token;
      // 提前 5 分钟标记过期
      this._tokenExpiry = Date.now() + (res.data.expires_in - 300) * 1000;
      return this._accessToken;
    });
  }

  // ── 公共请求头 ────────────────────────────────────────────────
  async _headers(profileId, contentType = CT.JSON) {
    const token = await this.getAccessToken();
    const h = {
      'Authorization':                      `Bearer ${token}`,
      'Content-Type':                        contentType,
      'Amazon-Advertising-API-ClientId':     this.clientId
    };
    if (profileId) h['Amazon-Advertising-API-Scope'] = profileId;
    return h;
  }

  // ── 带重试的 axios 封装 ───────────────────────────────────────
  async _request(method, path, profileId, data = null, contentType = CT.JSON) {
    return withRetry(async () => {
      const headers = await this._headers(profileId, contentType);
      const cfg = { method, url: `${this.baseUrl}${path}`, headers };
      if (data) {
        if (method.toLowerCase() === 'get') cfg.params = data;
        else cfg.data = data;
      }
      const res = await axios(cfg);
      return res.data;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Profiles（v2，GET 方法不变）
  // ─────────────────────────────────────────────────────────────
  async getProfiles() {
    const token = await this.getAccessToken();
    const res = await axios.get(`${this.baseUrl}/v2/profiles`, {
      headers: {
        'Authorization':                  `Bearer ${token}`,
        'Amazon-Advertising-API-ClientId': this.clientId,
        'Content-Type':                    CT.JSON
      }
    });
    return res.data;
  }

  // ─────────────────────────────────────────────────────────────
  // Campaigns  ── SP API v3: POST /sp/campaigns/list
  // ─────────────────────────────────────────────────────────────
  async getCampaigns(profileId, filters = {}) {
    const body = {
      stateFilter: { include: filters.states || ['ENABLED', 'PAUSED', 'ARCHIVED'] },
      maxResults: filters.maxResults || 1000,
      ...( filters.portfolioIdFilter && { portfolioIdFilter: { include: filters.portfolioIdFilter } })
    };
    return this._request('post', '/sp/campaigns/list', profileId, body, CT.LIST);
  }

  /**
   * 批量更新广告活动（出价/预算/状态）
   * @param {string} profileId
   * @param {Array}  campaigns  [{ campaignId, budget, state, dynamicBidding }, ...]
   */
  async updateCampaigns(profileId, campaigns) {
    return this._request('put', '/sp/campaigns', profileId, { campaigns }, CT.CAMPAIGN_PUT);
  }

  // ─────────────────────────────────────────────────────────────
  // Ad Groups  ── POST /sp/adGroups/list
  // ─────────────────────────────────────────────────────────────
  async getAdGroups(profileId, filters = {}) {
    const body = {
      stateFilter: { include: filters.states || ['ENABLED', 'PAUSED'] },
      maxResults: filters.maxResults || 1000,
      ...( filters.campaignIdFilter && { campaignIdFilter: { include: filters.campaignIdFilter } })
    };
    return this._request('post', '/sp/adGroups/list', profileId, body, CT.LIST);
  }

  // ─────────────────────────────────────────────────────────────
  // Keywords  ── POST /sp/keywords/list
  // ─────────────────────────────────────────────────────────────
  async getKeywords(profileId, filters = {}) {
    const body = {
      stateFilter: { include: filters.states || ['ENABLED', 'PAUSED'] },
      maxResults: filters.maxResults || 5000,
      ...( filters.campaignIdFilter && { campaignIdFilter: { include: filters.campaignIdFilter } }),
      ...( filters.adGroupIdFilter  && { adGroupIdFilter:  { include: filters.adGroupIdFilter  } })
    };
    return this._request('post', '/sp/keywords/list', profileId, body, CT.LIST);
  }

  /**
   * 批量更新关键词出价
   * @param {string} profileId
   * @param {Array}  keywords  [{ keywordId, bid, state }, ...]
   */
  async updateKeywords(profileId, keywords) {
    return this._request('put', '/sp/keywords', profileId, { keywords }, CT.KEYWORD_PUT);
  }

  /**
   * 添加否定关键词（活动级）
   * @param {string} profileId
   * @param {Array}  negatives  [{ campaignId, adGroupId, keywordText, matchType }, ...]
   *   matchType: 'NEGATIVE_EXACT' | 'NEGATIVE_PHRASE'
   */
  async addNegativeKeywords(profileId, negatives) {
    return this._request('post', '/sp/negativeKeywords', profileId, { negativeKeywords: negatives }, CT.NEGATIVE);
  }

  // ─────────────────────────────────────────────────────────────
  // Product Targetings  ── POST /sp/productTargetings/list
  // ─────────────────────────────────────────────────────────────
  async getTargetings(profileId, filters = {}) {
    const body = {
      stateFilter: { include: filters.states || ['ENABLED', 'PAUSED'] },
      maxResults: filters.maxResults || 2000,
      ...( filters.campaignIdFilter && { campaignIdFilter: { include: filters.campaignIdFilter } }),
      ...( filters.adGroupIdFilter  && { adGroupIdFilter:  { include: filters.adGroupIdFilter  } })
    };
    return this._request('post', '/sp/productTargetings/list', profileId, body, CT.LIST);
  }

  /**
   * 批量创建 ASIN 定向（商品投放）
   * @param {string} profileId
   * @param {Array}  targetings  [{ adGroupId, campaignId, asin, bid, state }, ...]
   *   asin: ASIN 编码（如 'B08N5WRWNW'）
   *   bid:  出价（$）
   */
  async createProductTargetings(profileId, targetings) {
    const payload = {
      targetings: targetings.map(t => ({
        campaignId:  t.campaignId,
        adGroupId:   t.adGroupId,
        state:       t.state || 'ENABLED',
        bid:         t.bid,
        targetingClause: {
          expression: [
            {
              type:   'asinSameAs',
              value:  t.asin
            }
          ],
          type: 'expression'
        }
      }))
    };
    return this._request('post', '/sp/productTargetings', profileId, payload, CT.TARGETING_PUT);
  }

  /**
   * 批量创建 ASIN 否定定向（商品投放否定）
   * @param {string} profileId
   * @param {Array}  negatives  [{ campaignId, asin, matchType }, ...]
   *   matchType: 'ASIN_NEGATIVE_EXACT'
   */
  async createNegativeAsinTargetings(profileId, negatives) {
    const payload = {
      negativeTargetings: negatives.map(n => ({
        campaignId: n.campaignId,
        state:      'ENABLED',
        targetingClause: {
          expression: [
            {
              type:  'asinSameAs',
              value: n.asin
            }
          ],
          type: 'expression'
        }
      }))
    };
    return this._request('post', '/sp/negativeProductTargetings', profileId, payload, CT.TARGETING_PUT);
  }

  /**
   * 删除 ASIN 定向
   * @param {string} profileId
   * @param {Array}  targetingIds  要删除的定向 ID 列表
   */
  async deleteProductTargetings(profileId, targetingIds) {
    const payload = { deleteTargetings: targetingIds.map(id => ({ targetingId: id })) };
    return this._request('post', '/sp/productTargetings/delete', profileId, payload, CT.TARGETING_PUT);
  }

  /**
   * 获取现有 ASIN 定向列表（用于检查是否已存在）
   * @param {string} profileId
   * @param {Array}  campaignIds  可选，限定活动范围
   */
  async getAsinTargetings(profileId, campaignIds = []) {
    const filters = {};
    if (campaignIds.length) filters.campaignIdFilter = campaignIds;
    const data = await this.getTargetings(profileId, filters);
    const targetings = data.targetings || data || [];
    // 只返回 ASIN 定向（expression 类型为 asinSameAs）
    return targetings.filter(t => {
      try {
        const expr = t.targetingClause?.expression || [];
        return expr.some(e => e.type === 'asinSameAs' || e.type === 'asin');
      } catch { return false; }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 报告  ── POST /reporting/reports
  // ─────────────────────────────────────────────────────────────
  /**
   * 请求并等待报告
   * @param {string} profileId
   * @param {object} reportRequest  符合 reporting/reports 规范的请求体
   */
  async getReport(profileId, reportRequest) {
    const headers = await this._headers(profileId, CT.REPORT);

    // 1. 创建报告任务
    const createRes = await axios.post(`${this.baseUrl}/reporting/reports`, reportRequest, { headers });
    const reportId  = createRes.data.reportId;

    // 2. 轮询（指数退避：10s → 20s → 40s，最多 10 次）
    for (let i = 0; i < 10; i++) {
      await sleep(10000 * Math.pow(1.5, i));   // 10s, 15s, 22s …
      const statusRes = await axios.get(
        `${this.baseUrl}/reporting/reports/${reportId}`,
        { headers: await this._headers(profileId) }
      );
      const { status, url } = statusRes.data;

      if (status === 'COMPLETED') {
        if (!url) throw new Error('报告已完成但未返回下载链接');
        // 报告文件在 S3，直接 GET（无需授权头）
        const dlRes = await axios.get(url, { responseType: 'arraybuffer' });
        return dlRes.data;
      }
      if (status === 'FAILED') throw new Error('报告生成失败：' + (statusRes.data.failureReason || '未知'));
    }
    throw new Error('报告生成超时（最大等待约 3 分钟）');
  }

  // ─────────────────────────────────────────────────────────────
  // 搜索词报告（Search Term Report）
  // ─────────────────────────────────────────────────────────────
  /**
   * 获取 SP 搜索词报告（异步报告，会等待完成）
   * @param {string} profileId
   * @param {object} opts  { startDate, endDate, campaignIds }
   *   startDate/endDate: 'YYYY-MM-DD'
   */
  async getSearchTermReport(profileId, opts = {}) {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const endDate   = opts.endDate   || fmt(new Date(today - 86400000));    // 昨天
    const startDate = opts.startDate || fmt(new Date(today - 30 * 86400000)); // 30天前

    const reportRequest = {
      name: `SearchTermReport_${Date.now()}`,
      startDate,
      endDate,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['searchTerm'],
        columns: [
          'campaignId', 'campaignName', 'adGroupId', 'adGroupName',
          'keywordId', 'keyword', 'keywordType', 'matchType',
          'searchTerm',
          'impressions', 'clicks', 'spend', 'sales14d',
          'purchases14d', 'unitsSoldClicks14d'
        ],
        reportTypeId: 'spSearchTerm',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON'
      }
    };

    if (opts.campaignIds && opts.campaignIds.length) {
      reportRequest.configuration.filters = [
        { field: 'campaignId', values: opts.campaignIds }
      ];
    }

    const rawBuffer = await this.getReport(profileId, reportRequest);
    // 解压 GZIP JSON
    const zlib = require('zlib');
    const jsonStr = zlib.gunzipSync(rawBuffer).toString('utf8');
    return JSON.parse(jsonStr);
  }

  // ─────────────────────────────────────────────────────────────
  // 批量创建关键词（手动精准/词组）
  // ─────────────────────────────────────────────────────────────
  /**
   * 批量创建关键词
   * @param {string} profileId
   * @param {Array}  keywords  [{ adGroupId, campaignId, keywordText, matchType, bid, state }, ...]
   *   matchType: 'EXACT' | 'PHRASE' | 'BROAD'
   */
  async createKeywords(profileId, keywords) {
    return this._request('post', '/sp/keywords', profileId, { keywords }, CT.KEYWORD_PUT);
  }

  // ─────────────────────────────────────────────────────────────
  // 关键词收割引擎（核心业务逻辑）
  // ─────────────────────────────────────────────────────────────
  /**
   * ASIN 检测：10位字母数字组合（Amazon 标准 ASIN 格式）
   * @param {string} term
   * @returns {string|null} ASIN 或 null
   */
  detectAsin(term) {
    if (!term || typeof term !== 'string') return null;
    const t = term.trim().toUpperCase();
    // 标准 ASIN: 10位字母数字（B0开头或纯数字）
    if (/^B[0-9A-Z]{9}$/.test(t)) return t;
    if (/^[0-9A-Z]{10}$/.test(t)) return t;
    return null;
  }

  /**
   * 分析搜索词报告，识别：
   *   1. 高转化词 → 建议推到手动精准
   *   2. 高消耗低转化词 → 建议否定
   *   3. 纯浪费词（有点击无订单且消耗高）→ 建议否定
   *   4. ASIN 识别 → 分类到 asinHarvest / asinNegate
   *
   * @param {Array}  searchTerms  搜索词报告数据行
   * @param {object} rules        收割规则
   *   rules.harvestMinOrders     最少订单数才能"收割"，默认 1
   *   rules.harvestMaxAcos       收割词的最大 ACoS(%)，默认 40
   *   rules.negateMinClicks      触发否定的最少点击数，默认 10
   *   rules.negateMaxAcos        超过此 ACoS 且有订单时才否定，默认 80
   *   rules.negateNoConvClicks   无转化但点击超过此数量时否定，默认 15
   *   rules.targetAcos           目标 ACoS，用于计算建议出价，默认 25
   *   rules.avgOrderValue        平均客单价（$），用于推算建议出价，默认 30
   *   rules.asinHarvestMaxAcos   ASIN 收割最大 ACoS，默认 35
   *   rules.asinNegateMinClicks  ASIN 否定最小点击，默认 10
   * @returns {{ harvest: [], negate: [], info: [], asinHarvest: [], asinNegate: [] }}
   */
  analyzeSearchTerms(searchTerms, rules = {}) {
    const {
      harvestMinOrders    = 1,
      harvestMaxAcos      = 40,
      negateMinClicks     = 10,
      negateMaxAcos       = 80,
      negateNoConvClicks  = 15,
      targetAcos          = 25,
      avgOrderValue       = 30,
      asinHarvestMaxAcos  = 35,
      asinNegateMinClicks = 10
    } = rules;

    const harvest    = [];
    const negate     = [];
    const info       = [];
    const asinHarvest = [];
    const asinNegate  = [];

    for (const row of searchTerms) {
      const searchTerm = (row.searchTerm || '').trim();
      if (!searchTerm || searchTerm === row.keyword) continue;

      const clicks    = Number(row.clicks    || 0);
      const orders    = Number(row.purchases14d || 0);
      const spend     = Number(row.spend     || 0);
      const sales     = Number(row.sales14d  || 0);
      const acos      = sales > 0 ? (spend / sales) * 100 : (spend > 0 ? 999 : 0);

      // —— ASIN 检测 ——（优先独立处理）
      const asin = this.detectAsin(searchTerm);
      if (asin) {
        // ASIN 收割：ACoS 健康
        if (orders >= harvestMinOrders && acos <= asinHarvestMaxAcos) {
          const cvr          = clicks > 0 ? orders / clicks : 0;
          const suggestedBid = parseFloat(((targetAcos / 100) * avgOrderValue * cvr).toFixed(2));
          asinHarvest.push({
            asin,
            searchTerm,
            campaignId:   row.campaignId,
            campaignName: row.campaignName,
            adGroupId:    row.adGroupId,
            adGroupName:  row.adGroupName,
            clicks, orders,
            spend:  parseFloat(spend.toFixed(2)),
            sales:  parseFloat(sales.toFixed(2)),
            acos:   parseFloat(acos.toFixed(1)),
            cvr:    parseFloat((cvr * 100).toFixed(1)),
            suggestedBid: Math.max(0.15, suggestedBid),
            reason: `${orders} 单 / ACoS ${acos.toFixed(1)}% — 建议 ASIN 定向投放`
          });
          continue;
        }
        // ASIN 否定：无转化且点击够多
        if (orders === 0 && clicks >= asinNegateMinClicks) {
          asinNegate.push({
            asin,
            searchTerm,
            campaignId:   row.campaignId,
            campaignName: row.campaignName,
            adGroupId:    row.adGroupId,
            clicks, orders: 0,
            spend: parseFloat(spend.toFixed(2)),
            acos:  null,
            reason: `${clicks} 次点击无转化 / 消耗 $${spend.toFixed(2)}，建议否定投放`
          });
          continue;
        }
        // ASIN 有转化但 ACoS 过高
        if (orders > 0 && acos > negateMaxAcos && clicks >= negateMinClicks) {
          asinNegate.push({
            asin,
            searchTerm,
            campaignId:   row.campaignId,
            campaignName: row.campaignName,
            adGroupId:    row.adGroupId,
            clicks, orders,
            spend: parseFloat(spend.toFixed(2)),
            acos:  parseFloat(acos.toFixed(1)),
            reason: `ACoS ${acos.toFixed(1)}% 超过阈值 ${negateMaxAcos}%，建议否定投放`
          });
          continue;
        }
        // ASIN 观察中
        if (clicks >= 3) {
          info.push({ searchTerm: asin, clicks, orders, spend: parseFloat(spend.toFixed(2)), acos: acos > 0 ? parseFloat(acos.toFixed(1)) : null, isAsin: true });
        }
        continue;
      }

      // —— 普通词收割条件：有一定转化 & ACoS 健康 ——
      if (orders >= harvestMinOrders && acos <= harvestMaxAcos) {
        const cvr          = clicks > 0 ? orders / clicks : 0;
        const suggestedBid = parseFloat(((targetAcos / 100) * avgOrderValue * cvr).toFixed(2));
        harvest.push({
          searchTerm,
          matchType:    row.matchType    || 'AUTO',
          campaignId:   row.campaignId,
          campaignName: row.campaignName,
          adGroupId:    row.adGroupId,
          adGroupName:  row.adGroupName,
          clicks, orders,
          spend:  parseFloat(spend.toFixed(2)),
          sales:  parseFloat(sales.toFixed(2)),
          acos:   parseFloat(acos.toFixed(1)),
          cvr:    parseFloat((cvr * 100).toFixed(1)),
          suggestedBid: Math.max(0.10, suggestedBid),
          reason: `${orders} 单 / ACoS ${acos.toFixed(1)}% — 建议精准收割`
        });
        continue;
      }

      // —— 否定条件 A：有订单但 ACoS 过高 ——
      if (orders > 0 && acos > negateMaxAcos && clicks >= negateMinClicks) {
        negate.push({
          searchTerm,
          campaignId:   row.campaignId,
          campaignName: row.campaignName,
          adGroupId:    row.adGroupId,
          clicks, orders,
          spend:  parseFloat(spend.toFixed(2)),
          acos:   parseFloat(acos.toFixed(1)),
          matchType: 'NEGATIVE_EXACT',
          reason: `ACoS ${acos.toFixed(1)}% 超过阈值 ${negateMaxAcos}%，建议否定`
        });
        continue;
      }

      // —— 否定条件 B：有点击无转化（白消耗） ——
      if (orders === 0 && clicks >= negateNoConvClicks) {
        negate.push({
          searchTerm,
          campaignId:   row.campaignId,
          campaignName: row.campaignName,
          adGroupId:    row.adGroupId,
          clicks, orders: 0,
          spend:  parseFloat(spend.toFixed(2)),
          acos:   null,
          matchType: 'NEGATIVE_EXACT',
          reason: `${clicks} 次点击无转化 / 消耗 $${spend.toFixed(2)}，建议否定`
        });
        continue;
      }

      // —— 观察中 ——（ASIN 已经在上面处理）
      if (clicks >= 5 && !asin) {
        info.push({ searchTerm, clicks, orders, spend: parseFloat(spend.toFixed(2)), acos: acos > 0 ? parseFloat(acos.toFixed(1)) : null, isAsin: false });
      }
    }

    return {
      harvest:    harvest.sort((a, b) => b.orders - a.orders),
      negate:     negate.sort((a, b) => b.spend - a.spend),
      info:       info.sort((a, b) => b.clicks - a.clicks),
      asinHarvest: asinHarvest.sort((a, b) => b.orders - a.orders),
      asinNegate:  asinNegate.sort((a, b) => b.spend - a.spend),
      summary: {
        total:        searchTerms.length,
        harvestCount:  harvest.length,
        negateCount:   negate.length,
        infoCount:     info.length,
        asinHarvestCount: asinHarvest.length,
        asinNegateCount:  asinNegate.length
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 智能出价建议（本地计算，不调 API）
  // ─────────────────────────────────────────────────────────────
  calcSmartBid(currentBid, actualAcos, targetAcos, opts) {
    return calcSmartBid(currentBid, actualAcos, targetAcos, opts);
  }

  generateBidSuggestions(keywords, targetAcos, opts) {
    return generateBidSuggestions(keywords, targetAcos, opts);
  }

  // ─────────────────────────────────────────────────────────────
  // 一键应用出价建议
  // ─────────────────────────────────────────────────────────────
  /**
   * 根据 ACoS 数据批量调整关键词出价
   * @param {string} profileId
   * @param {Array}  keywords    [{ id, bid, acos }, ...]    来自关键词报告
   * @param {number} targetAcos
   * @param {object} opts        minBid / maxBid / maxChangePct / dryRun
   */
  async applySmartBids(profileId, keywords, targetAcos, opts = {}) {
    const suggestions = generateBidSuggestions(keywords, targetAcos, opts);

    if (opts.dryRun) {
      return { dryRun: true, suggestions, count: suggestions.length };
    }

    if (!suggestions.length) {
      return { updated: 0, suggestions: [] };
    }

    const payload = suggestions.map(s => ({
      keywordId: s.id,
      bid: s.suggestedBid
    }));

    const result = await this.updateKeywords(profileId, payload);
    return { updated: suggestions.length, suggestions, apiResult: result };
  }

  // ─────────────────────────────────────────────────────────────
  // 连接测试
  // ─────────────────────────────────────────────────────────────
  async testConnection() {
    try {
      const profiles = await this.getProfiles();
      return {
        success: true,
        message: `Amazon Ads API 连接成功，找到 ${profiles.length} 个广告账户`,
        profiles
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'Amazon Ads API 连接失败'
      };
    }
  }
}

// 导出单例 + 工具函数
const service = new AmazonAdsService();
service.calcSmartBidUtil         = calcSmartBid;
service.generateBidSuggestionsUtil = generateBidSuggestions;

module.exports = service;
