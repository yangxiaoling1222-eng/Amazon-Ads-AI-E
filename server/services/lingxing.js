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
 * - 店铺列表:   /erp/sc/data/seller/lists          (GET)
 * - 广告组合:   /pb/openapi1/newad/portfolios        (POST)
 * - SP广告活动: /pb/openapi1/newad/spCampaigns       (POST)
 * - SP广告组:   /pb/openapi1/newad/spGroups          (POST)
 * - SP广告商品: /pb/openapi1/newad/spProductAds      (POST)
 * - SP关键词:   /pb/openapi1/newad/spKeywords        (POST)
 * - SP否定投放: /pb/openapi1/newad/spNegTargets      (POST)
 * - 本地产品列表: /erp/sc/routing/data/local_inventory/productList (POST)
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
   * 根据领星文档规则:
   * 1. 参数按 ASCII 排序（access_token, app_key, timestamp）
   * 2. 拼成 key1=value1&key2=value2... 格式
   * 3. MD5(32位) 后转大写
   * 4. AES/ECB/PKCS5Padding 加密，密钥 = appId
   */
  generateSign(params) {
    // 1. 按 ASCII 排序参数
    const sortedKeys = Object.keys(params).sort();
    
    // 2. 拼成 key=value&key=value... 格式（value为空不参与，null参与）
    const paramPairs = sortedKeys
      .filter(key => params[key] !== undefined && params[key] !== '')
      .map(key => `${key}=${params[key]}`);
    
    const paramString = paramPairs.join('&');
    console.log('签名原文:', paramString);
    
    // 3. MD5(32位) 后转大写
    const md5Hash = crypto.createHash('md5').update(paramString).digest('hex').toUpperCase();
    console.log('MD5结果:', md5Hash);
    
    // 4. AES/ECB/PKCS5Padding 加密，密钥 = appId
    const key = this.padKey(this.appId);
    const cipher = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0));
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(md5Hash, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    console.log('AES加密结果:', encrypted);
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

      if (response.data.code === '200' || response.data.code === 200) {
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

      if (response.data.code === '200' || response.data.code === 200) {
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
    
    // 合并公共参数和业务参数
    const allParams = { ...commonParams, ...bizParams };
    
    // 构建 URL
    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    
    const url = `${this.baseUrl}${endpoint}?${queryString}`;
    
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // POST 请求：业务参数放 Body
    if (method === 'POST' && bizData) {
      config.data = bizData;
    }

    try {
      console.log(`[${method}] ${endpoint}`);
      const response = await axios(config);
      
      if (response.data.code === '200' || response.data.code === 200) {
        return response.data.data;
      } else {
        throw new Error(response.data.msg || `API错误: ${response.data.code}`);
      }
    } catch (error) {
      if (error.response) {
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

  /**
   * 获取广告组合列表
   * API: /pb/openapi1/newad/portfolios (POST)
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
    return await this.request('POST', '/pb/openapi1/newad/portfolios', {}, {
      sid: params.sid,
      profile_id: params.profileId,
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取SP广告活动列表
   * API: /pb/openapi1/newad/spCampaigns (POST)
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
    return await this.request('POST', '/pb/openapi1/newad/spCampaigns', {}, {
      sid: params.sid,
      profile_id: params.profileId,
      state: params.state || 'enabled',
      offset: params.offset || 0,
      length: params.length || 15
    });
  }

  /**
   * 获取广告报告数据
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
