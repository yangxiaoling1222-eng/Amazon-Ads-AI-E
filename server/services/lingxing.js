/**
 * 领星ERP API 服务
 * 文档: https://apidoc.lingxing.com (需 access_key 访问)
 * 
 * 认证流程:
 * 1. POST /api/auth-server/oauth/access-token (form-data: appId + appSecret)
 *    → 获取 access_token
 * 2. 业务请求 URL 拼接公共参数: access_token + app_key + timestamp + sign
 * 3. sign 签名规则:
 *    a) 参数按 ASCII 排序
 *    b) 拼成 key1=value1&key2=value2... 格式
 *    c) MD5(32位) 后转大写
 *    d) AES/ECB/PKCS5Padding 加密，密钥 = appId
 *
 * API 接口路径（来自官方文档）:
 * 【基础数据】
 * - 店铺列表:       /erp/sc/data/seller/lists              (GET)
 * 
 * 【广告数据 - 列表】
 * - 广告组合:       /pb/openapi/newad/portfolios             (POST)
 * - SP广告活动:     /pb/openapi/newad/spCampaigns           (POST)
 * - SP广告组:       /pb/openapi/newad/spAdGroups            (POST)  ← 修复：原 spGroups
 * - SP广告商品:     /pb/openapi/newad/spProductAds          (POST)
 * - SP关键词:       /pb/openapi/newad/spKeywords            (POST)
 * - SP商品定位:     /pb/openapi/newad/spTargets             (POST)  ← 新增
 * - SP否定投放:     /pb/openapi/newad/spNegativeTargetsOrKeywords (POST) ← 修复：原 spNegTargets
 * 
 * 【广告数据 - 报告】
 * - 搜索词报告:     /pb/openapi/newad/queryWordReports      (POST)  ← 新增
 * - 关键词报告:     /pb/openapi/newad/spKeywordReports       (POST)  ← 新增
 * - 商品定位报告:   /pb/openapi/newad/spTargetReports        (POST)  ← 新增
 * - 广告位报告:     /pb/openapi/newad/campaignPlacementReports (POST) ← 新增
 * - SP广告活动报告: /pb/openapi/newad/spCampaignReports      (POST)  ← 新增
 * - SP广告组报告:   /pb/openapi/newad/spAdGroupReports       (POST)  ← 新增
 * - SP商品报告:     /pb/openapi/newad/spProductAdReports    (POST)  ← 新增
 * - ASIN报告:       /pb/openapi/newad/asinReports           (POST)  ← 新增
 * 
 * 【分时数据】
 * - SP广告活动小时: /pb/openapi/newad/spCampaignHourData    (POST)  ← 新增
 * - SP广告组小时:   /pb/openapi/newad/spAdGroupHourData      (POST)  ← 新增
 * - SP广告位小时:   /pb/openapi/newad/spAdPlacementHourData  (POST)  ← 新增
 * 
 * 【HSA广告报告】
 * - HSA搜索词报告:  /pb/openapi/newad/hsaQueryWordReports   (POST)  ← 新增
 * - HSA关键词报告:  /pb/openapi/newad/listHsaKeywordPlacementReport (POST) ← 新增
 */

const axios = require('axios');
const crypto = require('crypto');

// Mock数据
const MOCK_DATA = {
  stores: [
    { store_id: 'store_001', store_name: '美国站', marketplace: 'Amazon.com', region: 'NA', status: 'active' },
    { store_id: 'store_002', store_name: '英国站', marketplace: 'Amazon.co.uk', region: 'EU', status: 'active' },
    { store_id: 'store_003', store_name: '德国站', marketplace: 'Amazon.de', region: 'EU', status: 'active' }
  ],
  products: [
    { sku_id: 'SKU001', sku: 'Wireless-Headphones-BK', asin: 'B08XXXXX1', name: '无线蓝牙耳机 黑色', img: 'https://placehold.co/80x80/333/fff?text=耳机', status: 'active', store_id: 'store_001' },
    { sku_id: 'SKU002', sku: 'Wireless-Headphones-WT', asin: 'B08XXXXX2', name: '无线蓝牙耳机 白色', img: 'https://placehold.co/80x80/eee/333?text=耳机', status: 'active', store_id: 'store_001' },
    { sku_id: 'SKU003', sku: 'Smart-Watch-Pro', asin: 'B09XXXXX1', name: '智能手表Pro', img: 'https://placehold.co/80x80/1a1a1a/fff?text=手表', status: 'active', store_id: 'store_001' },
    { sku_id: 'SKU004', sku: 'USB-C-Cable-2M', asin: 'B07XXXXX1', name: 'USB-C数据线 2米', img: 'https://placehold.co/80x80/3498db/fff?text=数据线', status: 'active', store_id: 'store_002' },
    { sku_id: 'SKU005', sku: 'Bluetooth-Speaker', asin: 'B06XXXXX1', name: '蓝牙音箱', img: 'https://placehold.co/80x80/e74c3c/fff?text=音箱', status: 'active', store_id: 'store_003' }
  ],
  campaigns: [
    { campaign_id: 'camp_001', campaign_name: '耳机-自动投放', type: 'SP', status: 'enabled', budget: 50, store_id: 'store_001' },
    { campaign_id: 'camp_002', campaign_name: '耳机-精准关键词', type: 'SP', status: 'enabled', budget: 80, store_id: 'store_001' },
    { campaign_id: 'camp_003', campaign_name: '手表-自动投放', type: 'SP', status: 'enabled', budget: 60, store_id: 'store_001' },
    { campaign_id: 'camp_004', campaign_name: '品牌推广', type: 'SB', status: 'enabled', budget: 100, store_id: 'store_001' },
    { campaign_id: 'camp_005', campaign_name: '竞品定位投放', type: 'SD', status: 'enabled', budget: 40, store_id: 'store_001' }
  ],
  reportData: (() => {
    const data = [];
    const campaigns = ['camp_001', 'camp_002', 'camp_003', 'camp_004', 'camp_005'];
    const startDate = new Date('2026-04-23');
    for (let i = 0; i < 30; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      campaigns.forEach(campaign_id => {
        const impressions = Math.floor(Math.random() * 5000) + 1000;
        const clicks = Math.floor(impressions * (Math.random() * 0.1 + 0.02));
        const cost = clicks * (Math.random() * 1.5 + 0.5);
        const sales = Math.floor(cost * (Math.random() * 5 + 1));
        data.push({
          date: dateStr, campaign_id, impressions, clicks,
          cost: Math.round(cost * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          orders: Math.floor(sales / 30),
          ctr: Math.round((clicks / impressions) * 10000) / 100,
          cpc: Math.round((cost / clicks) * 100) / 100,
          acos: cost > 0 ? Math.round((cost / sales) * 10000) / 100 : 0,
          roas: cost > 0 ? Math.round((sales / cost) * 100) / 100 : 0
        });
      });
    }
    return data;
  })()
};

class LingxingService {
  constructor() {
    this.appId = process.env.LINGXING_API_KEY;
    this.appSecret = process.env.LINGXING_API_SECRET;
    this.baseUrl = process.env.LINGXING_API_URL || 'https://openapi.lingxing.com';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.refreshToken = null;
    this.mockMode = process.env.MOCK_MODE === 'true';
  }

  /**
   * 生成签名 sign
   * 官方文档规则（006_newInstructions.md 4.1节）:
   * a) 所有业务请求入参 + 3个公共参数（access_token、app_key、timestamp）按 ASCII 排序
   *    ⚠️ 注意：sign 本身不参与签名；POST body参数也需要参与签名
   * b) key1=value1&key2=value2&...（value为空字符串不参与，null参与）
   * c) MD5(32位) 后转大写
   * d) AES/ECB/PKCS5PADDING 加密，密钥为 appId（16字节）
   * 
   * 传输时需要对 sign 进行 encodeURIComponent（URL编码）
   * timestamp 长度取10位（秒级，不是毫秒级）
   */
  generateSign(allParams) {
    // 排除 sign 字段本身
    const signParams = Object.assign({}, allParams);
    delete signParams.sign;

    // a) 按 ASCII 排序所有参数键
    const sortedKeys = Object.keys(signParams).sort();
    
    // b) value为空字符串不参与；null参与；数组/对象类型需先转为string
    const paramPairs = sortedKeys
      .filter(key => signParams[key] !== undefined && signParams[key] !== '')
      .map(key => {
        let val = signParams[key];
        // 数组或对象需转为JSON字符串参与签名（官方FAQ Q2第6条）
        if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
          val = JSON.stringify(val);
        }
        return `${key}=${val}`;
      });
    
    const paramString = paramPairs.join('&');
    console.log('[签名] 原文:', paramString);
    
    // c) MD5(32位) 后转大写
    const md5Hash = crypto.createHash('md5').update(paramString).digest('hex').toUpperCase();
    console.log('[签名] MD5:', md5Hash);
    
    // d) AES/ECB/PKCS5PADDING 加密，密钥为 appId（补齐/截取到16字节）
    const key = this.padKey(this.appId);
    const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(md5Hash, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    console.log('[签名] AES base64:', encrypted);
    
    // 返回 base64 原始值（调用方负责 URL 编码）
    return encrypted;
  }

  /**
   * 补齐 AES 密钥到 16 字节
   */
  padKey(key) {
    const keyBuffer = Buffer.from(key, 'utf8');
    if (keyBuffer.length >= 16) {
      return keyBuffer.slice(0, 16);
    }
    const padLen = 16 - keyBuffer.length;
    const padding = Buffer.alloc(padLen, padLen);
    return Buffer.concat([keyBuffer, padding]);
  }

  /**
   * 获取访问令牌 (OAuth)
   * 官方文档 011_GetToken.md：
   * POST /api/auth-server/oauth/access-token
   * Content-Type: multipart/form-data
   * 参数：appId + appSecret
   * 
   * ⚠️ appSecret 可能含特殊字符（007_QA.md Q1），需要先 urlencode 再传输
   * 返回：code="200"（字符串），data.access_token / data.refresh_token / data.expires_in
   */
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const url = `${this.baseUrl}/api/auth-server/oauth/access-token`;
      console.log('正在请求领星Token:', url);
      console.log('AppId:', this.appId);
      
      // 官方要求 multipart/form-data
      // appSecret 含特殊字符时需要 urlencode（QA Q1）
      // 用 URLSearchParams 并设置正确的 Content-Type 也可以（form-data 本质等价）
      // 这里用 axios multipart 方式，兼容性最强
      const { Readable } = require('stream');
      const boundary = `----FormBoundary${Date.now()}`;
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="appId"`,
        '',
        this.appId,
        `--${boundary}`,
        `Content-Disposition: form-data; name="appSecret"`,
        '',
        this.appSecret,
        `--${boundary}--`
      ].join('\r\n');

      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
      });

      console.log('Token响应:', JSON.stringify(response.data));

      // 官方返回 code:"200"（字符串），兼容数字200
      if (response.data.code === '200' || response.data.code === 200) {
        this.accessToken = response.data.data.access_token;
        this.refreshToken = response.data.data.refresh_token;
        // expires_in 单位是秒（示例值7199），提前5分钟过期
        this.tokenExpiry = Date.now() + (response.data.data.expires_in - 300) * 1000;
        console.log('Token获取成功，过期时间:', new Date(this.tokenExpiry).toLocaleString());
        return this.accessToken;
      } else {
        throw new Error(response.data.msg || `获取令牌失败: code=${response.data.code}`);
      }
    } catch (error) {
      if (error.response) {
        console.error('领星Token错误响应:', error.response.status, error.response.data);
        throw new Error(`Token错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      console.error('领星Token认证失败:', error.message);
      throw error;
    }
  }

  /**
   * 刷新访问令牌
   * 官方文档 012_RefreshToken.md：
   * POST /api/auth-server/oauth/refresh
   * Content-Type: multipart/form-data
   * 参数：appId + refreshToken
   * ⚠️ 每个 refresh_token 只能使用一次！
   */
  async refreshAccessToken() {
    try {
      const url = `${this.baseUrl}/api/auth-server/oauth/refresh`;
      console.log('正在刷新领星Token:', url);

      const boundary = `----FormBoundary${Date.now()}`;
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="appId"`,
        '',
        this.appId,
        `--${boundary}`,
        `Content-Disposition: form-data; name="refreshToken"`,
        '',
        this.refreshToken,
        `--${boundary}--`
      ].join('\r\n');

      const response = await axios.post(url, body, {
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
      });

      if (response.data.code === '200' || response.data.code === 200) {
        this.accessToken = response.data.data.access_token;
        this.refreshToken = response.data.data.refresh_token; // 每次续约会生成新的 refresh_token
        this.tokenExpiry = Date.now() + (response.data.data.expires_in - 300) * 1000;
        console.log('Token续约成功，过期时间:', new Date(this.tokenExpiry).toLocaleString());
        return this.accessToken;
      } else {
        throw new Error(response.data.msg || `刷新令牌失败: code=${response.data.code}`);
      }
    } catch (error) {
      console.error('刷新Token失败:', error.message);
      throw error;
    }
  }

  /**
   * 通用API请求
   * 官方文档 006_newInstructions.md 2.3节：
   * 
   * GET请求：业务参数 + 公共参数全部拼接在URL上
   * POST请求：
   *   - URL上只放4个公共参数（access_token, app_key, timestamp, sign）
   *   - 业务参数放 body（json格式）
   *   - 但签名时，业务参数需要参与签名（重要！）
   * 
   * ⚠️ sign 的 URL 编码：sign 放 URL 时必须做 encodeURIComponent
   * ⚠️ 响应码：/erp/ 路径成功返回 code:0；/api/auth-server/ 返回 code:"200"
   * ⚠️ timestamp：10位秒级时间戳，不是13位毫秒级
   * ⚠️ 不要缓存 sign，每次请求都要用实时 timestamp 重新生成
   */
  async request(method, endpoint, bizParams = {}, bizData = null) {
    const token = await this.getAccessToken();
    // timestamp 必须是10位秒级（官方FAQ Q2: 参与签名的时间戳长度取10位）
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // 组装公共参数（不含sign）
    const commonParams = {
      access_token: token,
      app_key: this.appId,
      timestamp
    };

    // 签名参数 = 公共参数 + 所有业务参数（GET的bizParams + POST的bizData）
    // 官方规则4.1: "所有的业务请求入参+3个固定参数"一起签名
    const allSignParams = { ...commonParams, ...bizParams };
    if (method === 'POST' && bizData) {
      // POST body 参数也参与签名（数组/对象会在generateSign内转JSON字符串）
      Object.assign(allSignParams, bizData);
    }
    const sign = this.generateSign(allSignParams);

    // URL 上放公共参数 + sign（sign需URL编码）
    // GET时额外把bizParams也放URL；POST时bizParams通常为空
    const urlParams = { ...commonParams, ...bizParams, sign };
    const queryString = Object.entries(urlParams)
      .map(([k, v]) => {
        if (k === 'sign') {
          return `sign=${encodeURIComponent(v)}`;
        }
        return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
      })
      .join('&');

    const url = `${this.baseUrl}${endpoint}?${queryString}`;

    const reqConfig = {
      method,
      url,
      timeout: 120000, // 120秒超时（报告数据量大，需要更长时间）
      headers: {
        'Content-Type': 'application/json',
        'X-API-VERSION': '2'
      }
    };

    // POST：业务参数放 body（JSON）
    if (method === 'POST' && bizData) {
      reqConfig.data = bizData;
    }

    try {
      console.log(`[${method}] ${endpoint}`);
      const response = await axios(reqConfig);
      console.log(`[响应] ${endpoint}:`, JSON.stringify(response.data).substring(0, 500));

      const code = response.data.code;
      // /erp/ 路径成功返回 code:0（数字）；其他路径也可能返回 code:0
      if (code === 0 || code === '0' || code === '200' || code === 200) {
        return response.data.data;
      } else {
        const msg = response.data.message || response.data.msg || `API错误: code=${code}`;
        console.error(`[接口错误] ${endpoint}: ${msg}`);
        throw new Error(msg);
      }
    } catch (error) {
      if (error.response) {
        console.error(`[HTTP错误] ${endpoint} ${error.response.status}:`, JSON.stringify(error.response.data).substring(0, 500));
        throw new Error(`API请求失败: ${error.response.status} - ${error.response.data?.msg || error.response.data?.message || error.message}`);
      }
      if (!error.message.startsWith('API')) {
        console.error(`[请求异常] ${endpoint}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * 测试API连接
   */
  async testConnection() {
    if (this.mockMode) {
      return { success: true, message: 'Mock模式: 领星API连接成功（模拟数据）', mock: true };
    }
    try {
      await this.getAccessToken();
      return { success: true, message: '领星API连接成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ==================== 基础数据接口 ====================

  /**
   * 获取店铺列表
   * 官方文档 015_SellerLists.md：
   * GET /erp/sc/data/seller/lists
   * 返回字段：sid(店铺id), name(店铺名), country(国家), region(站点简称), status(0停/1正常/2异常/3欠费)
   * ⚠️ 注意：字段是 sid/name，不是 store_id/store_name
   */
  async getStores() {
    if (this.mockMode) {
      console.log('[Mock] 返回店铺列表');
      return MOCK_DATA.stores;
    }
    return await this.request('GET', '/erp/sc/data/seller/lists', {});
  }

  // ==================== 广告列表接口 ====================

  /**
   * 获取广告组合列表
   * API: /pb/openapi/newad/portfolios (POST)
   */
  async getPortfolios(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告组合列表');
      let campaigns = MOCK_DATA.campaigns;
      if (params.storeId) {
        campaigns = campaigns.filter(c => c.store_id === params.storeId);
      }
      return campaigns;
    }
    return await this.request('POST', '/pb/openapi/newad/portfolios', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP广告活动列表
   * 官方文档 333_spCampaigns.md：
   * POST /pb/openapi/newad/spCampaigns
   * 参数：sid(int,必填) + profile_id(与sid二选一) + state(不传=所有) + offset + length
   * ⚠️ sid 是 int 类型（来自店铺列表的 sid 字段）
   * ⚠️ state 不传则返回所有状态，不要默认设为 'enabled'
   */
  async getCampaigns(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告活动列表');
      let campaigns = MOCK_DATA.campaigns;
      if (params.storeId || params.sid) {
        const sid = params.sid || params.storeId;
        campaigns = campaigns.filter(c => c.store_id === sid);
      }
      return campaigns;
    }
    const sid = params.sid || params.storeId;
    const body = {
      offset: params.offset || 0,
      length: params.length || 100
    };
    if (sid !== undefined && sid !== null && sid !== '') body.sid = parseInt(sid) || sid;
    if (params.profileId) body.profile_id = params.profileId;
    if (params.state) body.state = params.state; // 不传则返回所有状态
    return await this.request('POST', '/pb/openapi/newad/spCampaigns', {}, body);
  }

  /**
   * 获取SP广告组列表
   * API: /pb/openapi/newad/spAdGroups (POST)  ← 修复：原 spGroups
   */
  async getAdGroups(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告组列表');
      return [];
    }
    return await this.request('POST', '/pb/openapi/newad/spAdGroups', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      campaign_id: params.campaignId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP广告商品列表
   * API: /pb/openapi/newad/spProductAds (POST)
   */
  async getProductAds(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告商品列表');
      return [];
    }
    return await this.request('POST', '/pb/openapi/newad/spProductAds', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      ad_group_id: params.adGroupId,
      campaign_id: params.campaignId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP关键词列表
   * API: /pb/openapi/newad/spKeywords (POST)
   */
  async getKeywords(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回关键词列表');
      return [];
    }
    return await this.request('POST', '/pb/openapi/newad/spKeywords', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      ad_group_id: params.adGroupId,
      campaign_id: params.campaignId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP商品定位列表
   * API: /pb/openapi/newad/spTargets (POST)  ← 新增
   */
  async getTargets(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回商品定位列表');
      return [];
    }
    return await this.request('POST', '/pb/openapi/newad/spTargets', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      ad_group_id: params.adGroupId,
      campaign_id: params.campaignId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP否定投放列表
   * API: /pb/openapi/newad/spNegativeTargetsOrKeywords (POST)  ← 修复：原 spNegTargets
   */
  async getNegativeTargetsOrKeywords(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回否定投放列表');
      return [];
    }
    return await this.request('POST', '/pb/openapi/newad/spNegativeTargetsOrKeywords', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      campaign_id: params.campaignId,
      ad_group_id: params.adGroupId,
      target_type: params.targetType || 'keyword',  // keyword / target
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  // ==================== 报告接口 ====================

  /**
   * 获取搜索词报告（关键词收割核心接口）
   * API: /pb/openapi/newad/queryWordReports (POST)  ← 新增
   * 说明: 获取用户搜索词数据，用于分析哪些词带来了转化
   * 
   * @param {Object} params
   * @param {string} params.sid - 店铺id
   * @param {string} params.reportDate - 报表日期 Y-m-d
   * @param {string} params.targetType - 投放类型: keyword(关键词) / target(商品投放)
   */
  async getSearchTermReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回搜索词报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/queryWordReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      target_type: params.targetType || 'keyword',
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取关键词报告
   * API: /pb/openapi/newad/spKeywordReports (POST)  ← 新增
   * 说明: 获取关键词维度的广告表现数据
   */
  async getKeywordReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回关键词报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spKeywordReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取商品定位报告（ASIN定向分析）
   * API: /pb/openapi/newad/spTargetReports (POST)  ← 新增
   * 说明: 获取商品定位维度的广告表现数据
   */
  async getTargetReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回商品定位报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spTargetReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取广告位报告（分时出价核心接口）
   * API: /pb/openapi/newad/campaignPlacementReports (POST)  ← 新增
   * 说明: 获取广告位维度的表现数据，包括 TOP OF SEARCH / PRODUCT PAGE 等
   * placement_type 示例: TOP OF SEARCH ON-AMAZON, OTHER ON-AMAZON
   */
  async getPlacementReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告位报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/campaignPlacementReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取SP广告活动报告
   * 官方文档 294_spCampaignReports.md：
   * POST /pb/openapi/newad/spCampaignReports
   * 参数：sid(必填,int) + report_date(必填,格式Y-m-d) + show_detail(0/1) + offset + length
   * ⚠️ report_date 是必填参数，每次只能查一天
   * ⚠️ 若要拉取多天数据需要循环调用
   */
  async getCampaignReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告活动报告');
      return { data: [], total: 0 };
    }
    const sid = params.sid || params.storeId;
    const body = {
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    };
    if (sid !== undefined && sid !== null && sid !== '') body.sid = parseInt(sid) || sid;
    if (params.profileId) body.profile_id = params.profileId;
    return await this.request('POST', '/pb/openapi/newad/spCampaignReports', {}, body);
  }

  /**
   * 获取SP广告组报告
   * API: /pb/openapi/newad/spAdGroupReports (POST)  ← 新增
   */
  async getAdGroupReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告组报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spAdGroupReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取SP广告商品报告
   * API: /pb/openapi/newad/spProductAdReports (POST)  ← 新增
   */
  async getProductAdReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告商品报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spProductAdReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取ASIN报告
   * API: /pb/openapi/newad/asinReports (POST)  ← 新增
   */
  async getAsinReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回ASIN报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/asinReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  // ==================== 分时数据接口 ====================

  /**
   * 获取SP广告活动小时数据（分时出价核心接口）
   * API: /pb/openapi/newad/spCampaignHourData (POST)  ← 新增
   */
  async getCampaignHourData(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告活动小时数据');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spCampaignHourData', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      campaign_id: params.campaignId,
      report_date: params.reportDate || params.startDate,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取SP广告组小时数据
   * API: /pb/openapi/newad/spAdGroupHourData (POST)  ← 新增
   */
  async getAdGroupHourData(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告组小时数据');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spAdGroupHourData', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      campaign_id: params.campaignId,
      ad_group_id: params.adGroupId,
      report_date: params.reportDate || params.startDate,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取SP广告位小时数据
   * API: /pb/openapi/newad/spAdPlacementHourData (POST)  ← 新增
   */
  async getAdPlacementHourData(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告位小时数据');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spAdPlacementHourData', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      campaign_id: params.campaignId,
      report_date: params.reportDate || params.startDate,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  // ==================== HSA广告报告接口 ====================

  /**
   * 获取HSA搜索词报告
   * API: /pb/openapi/newad/hsaQueryWordReports (POST)  ← 新增
   */
  async getHsaQueryWordReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回HSA搜索词报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/hsaQueryWordReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  /**
   * 获取HSA关键词广告位报告
   * API: /pb/openapi/newad/listHsaKeywordPlacementReport (POST)  ← 新增
   */
  async getHsaKeywordPlacementReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回HSA关键词广告位报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/listHsaKeywordPlacementReport', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
  }

  // ==================== 产品数据接口 ====================

  /**
   * 获取本地产品列表
   * API: /erp/sc/routing/data/local_inventory/productList (POST)
   */
  async getProducts(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回产品列表');
      let products = MOCK_DATA.products;
      if (params.storeId) {
        products = products.filter(p => p.store_id === params.storeId);
      }
      return products;
    }
    return await this.request('POST', '/erp/sc/routing/data/local_inventory/productList', {}, {
      offset: params.offset || 0,
      length: params.length || 1000
    });
  }

  // ==================== 报告数据接口（兼容旧接口） ====================

  /**
   * 获取广告报告数据（使用真实 SP 广告活动报告接口）
   * 逐天调用 spCampaignReports 接口，聚合多天数据
   */
  async getAdReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告报告数据');
      let data = MOCK_DATA.reportData;
      
      if (params.campaignId) {
        data = data.filter(d => d.campaign_id === params.campaignId);
      }
      if (params.startDate) {
        data = data.filter(d => d.date >= params.startDate);
      }
      if (params.endDate) {
        data = data.filter(d => d.date <= params.endDate);
      }
      
      const summary = data.reduce((acc, item) => {
        acc.impressions += item.impressions;
        acc.clicks += item.clicks;
        acc.cost += item.cost;
        acc.sales += item.sales;
        acc.orders += item.orders;
        return acc;
      }, { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 });
      
      summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions * 100).toFixed(2) : 0;
      summary.cpc = summary.clicks > 0 ? (summary.cost / summary.clicks).toFixed(2) : 0;
      summary.acos = summary.sales > 0 ? (summary.cost / summary.sales * 100).toFixed(2) : 0;
      summary.roas = summary.cost > 0 ? (summary.sales / summary.cost).toFixed(2) : 0;
      
      return { data, summary };
    }

    // 真实模式：逐天调用 spCampaignReports 接口
    const sid = params.sid || params.storeId;
    const startDate = params.startDate || this.getDefaultStartDate();
    const endDate = params.endDate || new Date().toISOString().slice(0, 10);

    console.log(`[getAdReport] 开始拉取报告数据: sid=${sid}, ${startDate} ~ ${endDate}`);

    const allData = [];
    
    // 逐天遍历日期范围
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      const reportDate = current.toISOString().slice(0, 10);
      try {
        const dayData = await this.getCampaignReport({
          sid,
          reportDate,
          showDetail: false
        });
        
        // dayData 可能是 { data: [...], total: N } 格式或直接数组
        const items = Array.isArray(dayData) ? dayData : (dayData?.data || []);
        
        // 将每条记录补上 report_date
        for (const item of items) {
          allData.push({
            ...item,
            date: item.report_date || reportDate,
            campaign_id: item.campaign_id || null,
            store_id: String(sid || ''),
            impressions: parseInt(item.impressions) || 0,
            clicks: parseInt(item.clicks) || 0,
            cost: parseFloat(item.cost) || 0,
            sales: parseFloat(item.sales) || 0,
            orders: parseInt(item.orders || item.attributed_units_ordered || 0) || 0,
            ctr: item.ctr || 0,
            cpc: item.cpc || 0,
            acos: item.acos || 0,
            roas: item.roas || 0
          });
        }
        
        if (items.length > 0) {
          console.log(`[getAdReport] ${reportDate}: 获取 ${items.length} 条记录`);
        }
      } catch (e) {
        console.warn(`[getAdReport] ${reportDate} 获取失败:`, e.message);
        // 单天失败不影响其他天数
      }
      
      current.setDate(current.getDate() + 1);
      
      // 避免请求过快，稍微间隔（API 可能有频率限制）
      if (current <= end) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // 计算汇总
    const summary = allData.reduce((acc, item) => {
      acc.impressions += item.impressions;
      acc.clicks += item.clicks;
      acc.cost += item.cost;
      acc.sales += item.sales;
      acc.orders += item.orders;
      return acc;
    }, { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 });

    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions * 100).toFixed(2) : '0';
    summary.cpc = summary.clicks > 0 ? (summary.cost / summary.clicks).toFixed(2) : '0';
    summary.acos = summary.sales > 0 ? (summary.cost / summary.sales * 100).toFixed(2) : '0';
    summary.roas = summary.cost > 0 ? (summary.sales / summary.cost).toFixed(2) : '0';

    console.log(`[getAdReport] 报告拉取完成: 共 ${allData.length} 条记录`);
    return { data: allData, summary };
  }

  /**
   * 获取默认起始日期（30天前）
   */
  getDefaultStartDate() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }

  /**
   * 获取广告组合性能数据
   */
  async getPortfolioPerformance(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回组合性能数据');
      let data = MOCK_DATA.reportData;
      
      if (params.startDate) {
        data = data.filter(d => d.date >= params.startDate);
      }
      if (params.endDate) {
        data = data.filter(d => d.date <= params.endDate);
      }
      
      const byCampaign = {};
      data.forEach(item => {
        if (!byCampaign[item.campaign_id]) {
          byCampaign[item.campaign_id] = { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 };
        }
        byCampaign[item.campaign_id].impressions += item.impressions;
        byCampaign[item.campaign_id].clicks += item.clicks;
        byCampaign[item.campaign_id].cost += item.cost;
        byCampaign[item.campaign_id].sales += item.sales;
        byCampaign[item.campaign_id].orders += item.orders;
      });
      
      return Object.entries(byCampaign).map(([campaign_id, metrics]) => ({
        campaign_id,
        ...metrics,
        acos: metrics.sales > 0 ? (metrics.cost / metrics.sales * 100).toFixed(2) : 0,
        roas: metrics.cost > 0 ? (metrics.sales / metrics.cost).toFixed(2) : 0
      }));
    }
    return await this.request('POST', '/report/portfolio', {}, {
      store_id: params.storeId,
      portfolio_id: params.portfolioId,
      start_date: params.startDate,
      end_date: params.endDate
    });
  }

  // ==================== 数据同步接口 ====================

  /**
   * 同步广告数据
   * 调用多个接口获取完整广告数据
   */
  async syncAdData(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 模拟同步广告数据');
      return {
        success: true,
        synced: {
          campaigns: MOCK_DATA.campaigns.length,
          products: MOCK_DATA.products.length,
          reportDays: 30
        },
        message: 'Mock模式: 数据同步完成（模拟数据）'
      };
    }
    
    try {
      // 1. 获取店铺列表
      const stores = await this.getStores();
      
      
      // 4. 获取产品列表
      const products = await this.getProducts(params);
      
      // 逐个店铺循环获取广告数据
    const results = {
      stores: stores?.length || 0,
      portfolios: 0,
      campaigns: 0,
      products: products?.length || 0
    };

    for (const store of stores || []) {
      const storeSid = store.sid;
      try {
        const [portfolios, campaigns] = await Promise.all([
          this.getPortfolios({ sid: storeSid }),
          this.getCampaigns({ sid: storeSid })
        ]);
        results.portfolios += portfolios?.length || 0;
        results.campaigns += campaigns?.length || 0;
      } catch (e) {
        console.warn(`[syncAdData] 店铺 ${storeSid} 广告数据获取失败:`, e.message);
      }
    }

    return {
      success: true,
      synced: results,
      message: '数据同步完成'
    };
    } catch (error) {
      console.error('同步广告数据失败:', error.message);
      throw error;
    }
  }
}

// 导出单例
module.exports = new LingxingService();
