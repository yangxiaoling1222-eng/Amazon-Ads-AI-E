/**
 * 领星 ERP API 服务
 * 支持获取广告数据、财务报表、资金流向等
 */
import axios from 'axios';
import crypto from 'crypto';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

class LingxingService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    // 如果 token 还没过期，直接返回
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const timestamp = Date.now();
      const sign = this.generateSign(timestamp);

      const response = await axios.post(`${config.lingxing.baseUrl()}/auth/token`, {
        appId: config.lingxing.appId,
        secret: config.lingxing.secret,
        timestamp,
        sign
      });

      if (response.data.code === 0) {
        this.accessToken = response.data.data.accessToken;
        // token 有效期 2 小时，提前 5 分钟刷新
        this.tokenExpiry = Date.now() + (2 * 60 * 60 * 1000) - (5 * 60 * 1000);
        logger.info('领星 ERP 认证成功');
        return this.accessToken;
      } else {
        throw new Error(`认证失败: ${response.data.message}`);
      }
    } catch (error) {
      logger.error('领星 ERP 认证失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成签名
   */
  generateSign(timestamp) {
    const str = `${config.lingxing.appId}${config.lingxing.secret}${timestamp}`;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * 通用请求方法
   */
  async request(method, endpoint, params = {}, data = null) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios({
        method,
        url: `${config.lingxing.baseUrl()}${endpoint}`,
        params: {
          ...params,
          accessToken: token
        },
        data
      });

      if (response.data.code === 0) {
        return response.data.data;
      } else {
        throw new Error(`API 错误: ${response.data.message}`);
      }
    } catch (error) {
      logger.error(`领星 API 请求失败: ${endpoint}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.getAccessToken();
      return { success: true, message: '连接成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取店铺列表
   */
  async getStores() {
    return this.request('GET', '/store/list');
  }

  /**
   * 获取广告活动列表
   */
  async getCampaigns(params = {}) {
    const defaultParams = {
      page: 1,
      pageSize: 100,
      ...params
    };
    return this.request('GET', '/ads/campaign/list', defaultParams);
  }

  /**
   * 获取广告组列表
   */
  async getAdGroups(campaignId) {
    return this.request('GET', '/ads/adgroup/list', { campaignId });
  }

  /**
   * 获取广告关键词列表
   */
  async getKeywords(params = {}) {
    return this.request('GET', '/ads/keyword/list', params);
  }

  /**
   * 获取广告数据报告
   */
  async getReport(params = {}) {
    const {
      startDate,
      endDate,
      storeId,
      reportType = 'campaign',
      page = 1,
      pageSize = 100
    } = params;

    return this.request('GET', '/ads/report', {
      startDate,
      endDate,
      storeId,
      reportType,
      page,
      pageSize
    });
  }

  /**
   * 获取搜索词报告
   */
  async getSearchTermReport(params = {}) {
    const {
      startDate,
      endDate,
      campaignId,
      adGroupId
    } = params;

    return this.request('GET', '/ads/searchterm/report', {
      startDate,
      endDate,
      campaignId,
      adGroupId
    });
  }

  /**
   * 获取广告活动性能数据（按时间范围）
   */
  async getCampaignPerformance(params = {}) {
    const {
      startDate,
      endDate,
      campaignType = 'all', // all, sp, sb, sd
      storeId
    } = params;

    return this.request('GET', '/ads/campaign/performance', {
      startDate,
      endDate,
      campaignType,
      storeId
    });
  }

  /**
   * 获取广告组合（Portfolio）列表
   */
  async getPortfolios() {
    return this.request('GET', '/ads/portfolio/list');
  }

  /**
   * 更新广告活动状态
   */
  async updateCampaignStatus(campaignId, status) {
    return this.request('POST', '/ads/campaign/status', {}, {
      campaignId,
      status // enabled, paused, archived
    });
  }

  /**
   * 更新关键词出价
   */
  async updateKeywordBid(keywordId, newBid) {
    return this.request('POST', '/ads/keyword/bid', {}, {
      keywordId,
      bid: newBid
    });
  }

  /**
   * 更新广告活动预算
   */
  async updateCampaignBudget(campaignId, newBudget) {
    return this.request('POST', '/ads/campaign/budget', {}, {
      campaignId,
      budget: newBudget
    });
  }

  /**
   * 批量更新关键词
   */
  async batchUpdateKeywords(updates) {
    return this.request('POST', '/ads/keyword/batch', {}, {
      updates // [{keywordId, bid, state}]
    });
  }

  /**
   * 添加否定关键词
   */
  async addNegativeKeywords(params) {
    const { campaignId, keywords, matchType = 'negativeExact' } = params;
    return this.request('POST', '/ads/negative/keyword', {}, {
      campaignId,
      keywords,
      matchType
    });
  }

  /**
   * 获取财务报表
   */
  async getFinancialStatements(params = {}) {
    const { startDate, endDate, storeId } = params;
    return this.request('GET', '/finance/statement', {
      startDate,
      endDate,
      storeId
    });
  }

  /**
   * 获取资金流水
   */
  async getCashFlow(params = {}) {
    const { startDate, endDate, storeId, flowType } = params;
    return this.request('GET', '/finance/cashflow', {
      startDate,
      endDate,
      storeId,
      flowType
    });
  }
}

// 单例导出
export default new LingxingService();
