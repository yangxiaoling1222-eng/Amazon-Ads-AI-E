/**
 * 亚马逊广告 API 服务 (Direct API)
 * 通过 LWA (Login with Amazon) 验证实现直连
 */
import axios from 'axios';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { sleep } from '../../utils/helpers.js';

class AmazonAdsService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.profileId = null;
  }

  /**
   * 获取访问令牌 (LWA Refresh Token Flow)
   */
  async getAccessToken() {
    // 如果 token 还没过期，直接返回
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post('https://api.amazon.com/auth/o2/token', 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.amazon.refreshToken,
          client_id: config.amazon.clientId,
          client_secret: config.amazon.clientSecret
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // token 有效期通常为 1 小时，提前 5 分钟刷新
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - (5 * 60 * 1000);
      
      logger.info('亚马逊广告 API 认证成功');
      return this.accessToken;
    } catch (error) {
      logger.error('亚马逊广告 API 认证失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取请求头
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Amazon-Advertising-API-ClientId': config.amazon.clientId,
      'Content-Type': 'application/vnd.createasyncrequestresponse.v3+json',
      'Accept': 'application/vnd.createasyncrequestresponse.v3+json'
    };
  }

  /**
   * 获取广告账户列表
   */
  async getProfiles() {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(`${config.amazon.getEndpoint()}/v2/profiles`, {
        headers: this.getHeaders()
      });
      
      return response.data;
    } catch (error) {
      logger.error('获取广告账户列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取广告活动列表
   */
  async getCampaigns(profileId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(`${config.amazon.getEndpoint()}/v2/campaigns/extended`, {
        headers: {
          ...this.getHeaders(),
          'Amazon-Advertising-API-Scope': profileId
        },
        params: {
          campaignType: 'sponsoredProducts',
          stateFilter: 'enabled,paused,archived'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('获取广告活动列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取广告组列表
   */
  async getAdGroups(profileId, campaignId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(`${config.amazon.getEndpoint()}/v2/adGroups/extended`, {
        headers: {
          ...this.getHeaders(),
          'Amazon-Advertising-API-Scope': profileId
        },
        params: {
          campaignId,
          stateFilter: 'enabled,paused,archived'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('获取广告组列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取关键词列表
   */
  async getKeywords(profileId, campaignId, adGroupId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(`${config.amazon.getEndpoint()}/v2/keywords/extended`, {
        headers: {
          ...this.getHeaders(),
          'Amazon-Advertising-API-Scope': profileId
        },
        params: {
          campaignId,
          adGroupId,
          matchTypeFilter: 'exact,phrase,broad',
          stateFilter: 'enabled,paused,archived'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('获取关键词列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取广告活动报告
   */
  async getCampaignReport(profileId, params = {}) {
    const token = await this.getAccessToken();
    
    try {
      // 创建报告请求
      const reportRequest = {
        stateFilter: 'enabled,paused',
        campaignType: 'sponsoredProducts',
        segment: 'campaign',
        metrics: 'campaignId,campaignName,campaignStatus,campaignType,spend,impressions,clicks,purchases1d, purchases7d,purchases30d,sales1d,sales7d,sales30d',
        ...params
      };

      // 提交报告请求
      const response = await axios.post(
        `${config.amazon.getEndpoint()}/reporting/reports`,
        reportRequest,
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );

      // 返回报告 ID，需要轮询获取结果
      return {
        reportId: response.data.reportId,
        status: response.data.status,
        statusDetails: response.data.statusDetails
      };
    } catch (error) {
      logger.error('获取广告活动报告失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取报告状态
   */
  async getReportStatus(profileId, reportId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(
        `${config.amazon.getEndpoint()}/reporting/reports/${reportId}`,
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('获取报告状态失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 下载报告
   */
  async downloadReport(profileId, reportId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.get(
        `${config.amazon.getEndpoint()}/reporting/reports/${reportId}/download`,
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('下载报告失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新广告活动出价
   */
  async updateCampaignBid(profileId, campaignId, newBid) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.put(
        `${config.amazon.getEndpoint()}/v2/campaigns/${campaignId}`,
        {
          campaignId,
          bid: newBid
        },
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('更新广告活动出价失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新关键词出价
   */
  async updateKeywordBid(profileId, keywordId, newBid) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.put(
        `${config.amazon.getEndpoint()}/v2/keywords/${keywordId}`,
        {
          keywordId,
          bid: newBid
        },
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('更新关键词出价失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 批量更新关键词
   */
  async batchUpdateKeywords(profileId, updates) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.post(
        `${config.amazon.getEndpoint()}/v2/keywords`,
        updates,
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('批量更新关键词失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 暂停广告活动
   */
  async pauseCampaign(profileId, campaignId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.put(
        `${config.amazon.getEndpoint()}/v2/campaigns/${campaignId}`,
        {
          campaignId,
          state: 'paused'
        },
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('暂停广告活动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启用广告活动
   */
  async enableCampaign(profileId, campaignId) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.put(
        `${config.amazon.getEndpoint()}/v2/campaigns/${campaignId}`,
        {
          campaignId,
          state: 'enabled'
        },
        {
          headers: {
            ...this.getHeaders(),
            'Amazon-Advertising-API-Scope': profileId
          }
        }
      );
      
      return response.data;
    } catch (error) {
      logger.error('启用广告活动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const profiles = await this.getProfiles();
      return { 
        success: true, 
        message: '连接成功',
        data: profiles
      };
    } catch (error) {
      return { 
        success: false, 
        message: error.message 
      };
    }
  }
}

// 单例导出
export default new AmazonAdsService();
