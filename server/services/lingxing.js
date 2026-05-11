/**
 * 领星ERP API 服务
 * 文档: https://open.lingxing.com/docs/
 */

const axios = require('axios');

// Mock数据
const MOCK_DATA = {
  stores: [
    {
      store_id: 'store_001',
      store_name: '美国站',
      marketplace: 'Amazon.com',
      region: 'NA',
      status: 'active'
    },
    {
      store_id: 'store_002',
      store_name: '英国站',
      marketplace: 'Amazon.co.uk',
      region: 'EU',
      status: 'active'
    },
    {
      store_id: 'store_003',
      store_name: '德国站',
      marketplace: 'Amazon.de',
      region: 'EU',
      status: 'active'
    }
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
          date: dateStr,
          campaign_id,
          impressions,
          clicks,
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
    this.apiKey = process.env.LINGXING_API_KEY;
    this.apiSecret = process.env.LINGXING_API_SECRET;
    this.baseUrl = process.env.LINGXING_API_URL || 'https://openapi.lingxing.com/api';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.mockMode = process.env.MOCK_MODE === 'true';
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('正在请求领星API:', `${this.baseUrl}/auth/token`);
      console.log('API Key:', this.apiKey);
      
      const response = await axios.post(`${this.baseUrl}/auth/token`, {
        api_key: this.apiKey,
        api_secret: this.apiSecret
      });

      console.log('API响应:', JSON.stringify(response.data));

      if (response.data.code === 0) {
        this.accessToken = response.data.data.access_token;
        this.tokenExpiry = Date.now() + (response.data.data.expires_in - 300) * 1000;
        return this.accessToken;
      } else {
        throw new Error(response.data.message || `获取令牌失败: ${response.data.code}`);
      }
    } catch (error) {
      if (error.response) {
        console.error('领星API错误响应:', error.response.status, error.response.data);
        throw new Error(`API错误 ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      console.error('领星API认证失败:', error.message);
      throw error;
    }
  }

  /**
   * 通用API请求
   */
  async request(method, endpoint, params = {}, data = null) {
    const token = await this.getAccessToken();
    
    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: method === 'GET' ? params : undefined,
      data: method !== 'GET' ? data : undefined
    };

    try {
      const response = await axios(config);
      
      if (response.data.code === 0) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || `API错误: ${response.data.code}`);
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`API请求失败: ${error.response.status} - ${error.response.data?.message || error.message}`);
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
   */
  async getStores() {
    if (this.mockMode) {
      console.log('[Mock] 返回店铺列表');
      return MOCK_DATA.stores;
    }
    return await this.request('GET', '/store/list', {
      page: 1,
      page_size: 100
    });
  }

  /**
   * 获取广告组合列表
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
    return await this.request('GET', '/campaign/list', {
      page: params.page || 1,
      page_size: params.pageSize || 100,
      store_id: params.storeId
    });
  }

  /**
   * 获取广告报告数据
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
      
      // 聚合数据
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
    return await this.request('POST', '/report/ad', {
      store_id: params.storeId,
      campaign_id: params.campaignId,
      ad_group_id: params.adGroupId,
      start_date: params.startDate,
      end_date: params.endDate,
      metrics: params.metrics || ['impressions', 'clicks', 'cost', 'sales']
    });
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
      
      // 按campaign_id聚合
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
    return await this.request('POST', '/report/portfolio', {
      store_id: params.storeId,
      portfolio_id: params.portfolioId,
      start_date: params.startDate,
      end_date: params.endDate
    });
  }

  /**
   * 获取产品列表
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
    return await this.request('GET', '/product/list', {
      page: params.page || 1,
      page_size: params.pageSize || 100,
      store_id: params.storeId
    });
  }

  /**
   * 同步广告数据
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
    return await this.request('POST', '/sync/ad', {
      store_id: params.storeId,
      start_date: params.startDate,
      end_date: params.endDate
    });
  }
}

// 导出单例
module.exports = new LingxingService();
