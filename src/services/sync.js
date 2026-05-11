/**
 * 数据同步服务
 * 统一管理领星 ERP 和亚马逊广告 API 的数据同步
 */
import lingxingService from '../services/lingxing/index.js';
import amazonService from '../services/amazon/index.js';
import logger from '../utils/logger.js';
import { getDateRange, formatDate } from '../utils/helpers.js';

class DataSyncService {
  constructor() {
    this.lastSyncTime = null;
    this.syncCache = new Map();
  }

  /**
   * 测试所有连接
   */
  async testAllConnections() {
    const results = {
      lingxing: { status: 'unknown', message: '' },
      amazon: { status: 'unknown', message: '' }
    };

    // 测试领星
    try {
      const lingxingResult = await lingxingService.testConnection();
      results.lingxing = {
        status: lingxingResult.success ? 'connected' : 'error',
        message: lingxingResult.message
      };
    } catch (error) {
      results.lingxing = {
        status: 'error',
        message: error.message
      };
    }

    // 测试亚马逊
    try {
      const amazonResult = await amazonService.testConnection();
      results.amazon = {
        status: amazonResult.success ? 'connected' : 'error',
        message: amazonResult.message
      };
    } catch (error) {
      results.amazon = {
        status: 'error',
        message: error.message
      };
    }

    return results;
  }

  /**
   * 同步广告活动数据
   */
  async syncCampaigns(source = 'lingxing') {
    logger.info(`开始同步广告活动数据，来源: ${source}`);
    
    try {
      let campaigns;
      
      if (source === 'lingxing') {
        campaigns = await lingxingService.getCampaigns();
      } else {
        const profiles = await amazonService.getProfiles();
        if (profiles.length > 0) {
          campaigns = await amazonService.getCampaigns(profiles[0].profileId);
        }
      }

      this.syncCache.set('campaigns', {
        data: campaigns,
        timestamp: Date.now()
      });

      this.lastSyncTime = Date.now();
      logger.info(`成功同步 ${campaigns?.length || 0} 个广告活动`);

      return {
        success: true,
        count: campaigns?.length || 0,
        timestamp: this.lastSyncTime
      };
    } catch (error) {
      logger.error('同步广告活动数据失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取广告数据报告
   */
  async getAdReport(params = {}) {
    const { days = 7, source = 'lingxing' } = params;
    const { startDate, endDate } = getDateRange(days);
    
    logger.info(`获取广告报告，从 ${startDate} 到 ${endDate}`);

    try {
      if (source === 'lingxing') {
        return await lingxingService.getReport({
          startDate,
          endDate,
          reportType: 'campaign'
        });
      } else {
        // 亚马逊需要先创建报告请求，然后轮询
        const profiles = await amazonService.getProfiles();
        if (profiles.length > 0) {
          return await amazonService.getCampaignReport(profiles[0].profileId, {
            startDate,
            endDate
          });
        }
      }
    } catch (error) {
      logger.error('获取广告报告失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取搜索词报告
   */
  async getSearchTermReport(params = {}) {
    const { days = 7, campaignId } = params;
    const { startDate, endDate } = getDateRange(days);

    try {
      return await lingxingService.getSearchTermReport({
        startDate,
        endDate,
        campaignId
      });
    } catch (error) {
      logger.error('获取搜索词报告失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取广告组合 (Portfolio) 数据
   */
  async getPortfolioData() {
    try {
      return await lingxingService.getPortfolios();
    } catch (error) {
      logger.error('获取广告组合数据失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取完整广告数据（包含活动和关键词）
   */
  async getFullAdData(params = {}) {
    const { days = 7 } = params;
    const { startDate, endDate } = getDateRange(days);

    logger.info('开始获取完整广告数据');

    try {
      // 获取活动数据
      const campaigns = await lingxingService.getCampaigns();
      
      // 获取报告数据
      const report = await lingxingService.getReport({
        startDate,
        endDate
      });

      // 获取搜索词数据
      const searchTerms = await lingxingService.getSearchTermReport({
        startDate,
        endDate
      });

      return {
        campaigns,
        report,
        searchTerms,
        dateRange: { startDate, endDate },
        syncedAt: Date.now()
      };
    } catch (error) {
      logger.error('获取完整广告数据失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取关键词表现数据
   */
  async getKeywordPerformance(params = {}) {
    const { days = 7, campaignId } = params;
    const { startDate, endDate } = getDateRange(days);

    try {
      return await lingxingService.getKeywords({
        startDate,
        endDate,
        campaignId
      });
    } catch (error) {
      logger.error('获取关键词表现数据失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 执行全面账户扫描
   */
  async performAccountScan() {
    logger.info('开始执行全面账户扫描');
    
    try {
      const [campaigns, portfolios, report] = await Promise.all([
        lingxingService.getCampaigns(),
        lingxingService.getPortfolios(),
        this.getAdReport({ days: 30 })
      ]);

      return {
        summary: {
          totalCampaigns: campaigns?.length || 0,
          totalPortfolios: portfolios?.length || 0,
          scannedAt: Date.now()
        },
        campaigns,
        portfolios,
        report
      };
    } catch (error) {
      logger.error('执行账户扫描失败', { error: error.message });
      throw error;
    }
  }
}

// 单例导出
export default new DataSyncService();
