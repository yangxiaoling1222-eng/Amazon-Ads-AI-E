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
   * 根据领星文档规则（5步）:
   * 步骤1: 将所有参数（业务参数 + access_token + app_key + timestamp）按 ASCII 排序
   * 步骤2: 拼接为 key1=value1&key2=value2 格式（value为空不参与，value为null会参与）
   * 步骤3: 对拼接字符串进行MD5(32位)加密并转大写
   * 步骤4: 使用AES/ECB/PKCS5Padding加密MD5值，密钥为AppId
   * 步骤5: 对最终签名进行URL编码后使用
   */
  generateSign(params) {
    // 1. 按 ASCII 排序参数
    const sortedKeys = Object.keys(params).sort();
    
    // 2. 拼成 key=value&key=value... 格式（value为空不参与，null参与）
    const paramPairs = sortedKeys
      .filter(key => params[key] !== undefined && params[key] !== '')
      .map(key => `${key}=${params[key]}`);
    
    const paramString = paramPairs.join('&');
    console.log('[签名] 原文:', paramString);
    
    // 3. MD5(32位) 后转大写
    const md5Hash = crypto.createHash('md5').update(paramString).digest('hex').toUpperCase();
    console.log('[签名] MD5:', md5Hash);
    
    // 4. AES/ECB/PKCS5Padding 加密，密钥 = appId
    const key = this.padKey(this.appId);
    const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(md5Hash, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    console.log('[签名] AES结果:', encrypted);
    
    // 5. URL 编码
    const signEncoded = encodeURIComponent(encrypted);
    console.log('[签名] URL编码后:', signEncoded);
    
    return signEncoded;
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
   * POST /api/auth-server/oauth/access-token
   * form-data: appId + appSecret
   */
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const url = `${this.baseUrl}/api/auth-server/oauth/access-token`;
      console.log('正在请求领星Token:', url);
      console.log('AppId:', this.appId);
      
      const formData = new URLSearchParams();
      formData.append('appId', this.appId);
      formData.append('appSecret', this.appSecret);
      
      const response = await axios.post(url, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      console.log('Token响应:', JSON.stringify(response.data));

      // 领星返回 code: 0 表示成功（不是200）
      if (response.data.code === '200' || response.data.code === 200 || response.data.code === '0' || response.data.code === 0) {
        this.accessToken = response.data.data.access_token;
        this.refreshToken = response.data.data.refresh_token;
        // expires_in 单位是秒，提前5分钟过期
        this.tokenExpiry = Date.now() + (response.data.data.expires_in - 300) * 1000;
        console.log('Token获取成功，过期时间:', new Date(this.tokenExpiry).toLocaleString());
        return this.accessToken;
      } else {
        throw new Error(response.data.msg || `获取令牌失败: ${response.data.code}`);
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
   * POST /api/auth-server/oauth/refresh
   */
  async refreshAccessToken() {
    try {
      const url = `${this.baseUrl}/api/auth-server/oauth/refresh`;
      console.log('正在刷新领星Token:', url);
      
      const formData = new URLSearchParams();
      formData.append('appId', this.appId);
      formData.append('refreshToken', this.refreshToken);
      
      const response = await axios.post(url, formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data.code === '200' || response.data.code === 200 || response.data.code === '0' || response.data.code === 0) {
        this.accessToken = response.data.data.access_token;
        this.refreshToken = response.data.data.refresh_token;
        this.tokenExpiry = Date.now() + (response.data.data.expires_in - 300) * 1000;
        return this.accessToken;
      } else {
        throw new Error(response.data.msg || `刷新令牌失败: ${response.data.code}`);
      }
    } catch (error) {
      console.error('刷新Token失败:', error.message);
      throw error;
    }
  }

  /**
   * 生成带签名的公共请求参数
   */
  async buildCommonParams() {
    const token = await this.getAccessToken();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    const params = {
      access_token: token,
      app_key: this.appId,
      timestamp: timestamp
    };
    
    // 生成签名
    params.sign = this.generateSign(params);
    
    return params;
  }

  /**
   * 通用API请求
   * GET: 业务参数 + 公共参数 都拼在 URL 上
   * POST: 公共参数拼在 URL 上，业务参数放 Body (JSON)
   */
  async request(method, endpoint, bizParams = {}, bizData = null) {
    const commonParams = await this.buildCommonParams();
    
    // 合并公共参数和业务参数（用于签名）
    let signParams = { ...commonParams, ...bizParams };
    if (method === 'POST' && bizData) {
      // 把 body 参数也加入签名
      signParams = { ...signParams, ...bizData };
    }
    
    // 构建 URL（只放公共参数 + URL 业务参数）
    const urlParams = { ...commonParams, ...bizParams };
    const queryString = Object.entries(urlParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    
    const url = `${this.baseUrl}${endpoint}?${queryString}`;
    
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-API-VERSION': '2'  // 使用 offset 分页模式
      }
    };
    
    // POST 请求：业务参数放 Body
    if (method === 'POST' && bizData) {
      config.data = bizData;
    }

    try {
      console.log(`[${method}] ${endpoint}`);
      const response = await axios(config);
      
      // 打印完整响应，方便调试
      console.log(`[响应] ${endpoint}:`, JSON.stringify(response.data).substring(0, 500));
      
      if (response.data.code === '200' || response.data.code === 200 || response.data.code === '0' || response.data.code === 0) {
        return response.data.data;
      } else {
        throw new Error(response.data.msg || `API错误: ${response.data.code}`);
      }
    } catch (error) {
      console.error(`[错误] ${endpoint}:`, error.message);
      if (error.response) {
        console.error(`[HTTP错误] ${error.response.status}:`, JSON.stringify(error.response.data).substring(0, 500));
        throw new Error(`API请求失败: ${error.response.status} - ${error.response.data?.msg || error.message}`);
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
   * API: /erp/sc/data/seller/lists (GET)
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
   * API: /pb/openapi/newad/spCampaigns (POST)
   */
  async getCampaigns(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告活动列表');
      let campaigns = MOCK_DATA.campaigns;
      if (params.storeId) {
        campaigns = campaigns.filter(c => c.store_id === params.storeId);
      }
      return campaigns;
    }
    return await this.request('POST', '/pb/openapi/newad/spCampaigns', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
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
   * API: /pb/openapi/newad/spCampaignReports (POST)  ← 新增
   */
  async getCampaignReport(params = {}) {
    if (this.mockMode) {
      console.log('[Mock] 返回广告活动报告');
      return { data: [], total: 0 };
    }
    return await this.request('POST', '/pb/openapi/newad/spCampaignReports', {}, {
      sid: params.sid || params.storeId,
      profile_id: params.profileId,
      report_date: params.reportDate || params.startDate,
      show_detail: params.showDetail ? 1 : 0,
      offset: params.offset || 0,
      length: params.length || 100
    });
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
   * 获取广告报告数据（兼容旧接口，使用SP广告活动报告）
   * 注意：领星文档中未明确提供报告接口，使用模拟数据
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
    // 报告接口在文档中未明确列出，使用模拟数据
    console.log('[Info] 广告报告接口未在文档中定义，使用模拟数据');
    let data = MOCK_DATA.reportData;
    if (params.campaignId) data = data.filter(d => d.campaign_id === params.campaignId);
    if (params.startDate) data = data.filter(d => d.date >= params.startDate);
    if (params.endDate) data = data.filter(d => d.date <= params.endDate);
    return { data, summary: {} };
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
      
      // 2. 获取广告组合
      const portfolios = await this.getPortfolios(params);
      
      // 3. 获取广告活动
      const campaigns = await this.getCampaigns(params);
      
      // 4. 获取产品列表
      const products = await this.getProducts(params);
      
      return {
        success: true,
        synced: {
          stores: stores?.length || 0,
          portfolios: portfolios?.length || 0,
          campaigns: campaigns?.length || 0,
          products: products?.length || 0
        },
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
