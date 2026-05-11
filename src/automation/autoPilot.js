/**
 * 广告自动驾驶模块
 * 实现全天候监控与自动调价
 */
import cron from 'node-cron';
import lingxingService from '../services/lingxing/index.js';
import amazonService from '../services/amazon/index.js';
import dataSyncService from '../services/sync.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { calculateAcos, formatDate } from '../utils/helpers.js';

// 存储每个 Portfolio 的目标配置
const portfolioTargets = new Map();

class AutoPilot {
  constructor() {
    this.isRunning = false;
    this.lastCheck = null;
    this.executionHistory = [];
    this.cronJob = null;
  }

  /**
   * 设置广告组合的 ACOS 目标
   */
  setTarget(portfolioId, targetAcos, options = {}) {
    const config = {
      portfolioId,
      targetAcos,
      tolerance: options.tolerance || config.automation.acosTolerance,
      minBid: options.minBid || 0.2,
      maxBid: options.maxBid || 10,
      enabled: options.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    portfolioTargets.set(portfolioId, config);
    logger.info(`已设置 Portfolio ${portfolioId} 的 ACOS 目标: ${targetAcos}%`);
    
    return config;
  }

  /**
   * 获取所有目标配置
   */
  getAllTargets() {
    return Array.from(portfolioTargets.values());
  }

  /**
   * 获取特定 Portfolio 的目标配置
   */
  getTarget(portfolioId) {
    return portfolioTargets.get(portfolioId);
  }

  /**
   * 删除目标配置
   */
  removeTarget(portfolioId) {
    const deleted = portfolioTargets.delete(portfolioId);
    if (deleted) {
      logger.info(`已删除 Portfolio ${portfolioId} 的目标配置`);
    }
    return deleted;
  }

  /**
   * 执行一次完整的自动驾驶检查
   */
  async executeCheck() {
    if (this.isRunning) {
      logger.warn('自动驾驶检查已在执行中，跳过本次检查');
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results = {
      startTime,
      checks: [],
      adjustments: [],
      errors: []
    };

    logger.info('开始执行自动驾驶检查');

    try {
      // 获取所有广告数据
      const report = await dataSyncService.getAdReport({ days: 7 });
      
      // 遍历所有启用的目标配置
      for (const [portfolioId, targetConfig] of portfolioTargets) {
        if (!targetConfig.enabled) continue;

        try {
          const checkResult = await this.checkPortfolio(portfolioId, targetConfig, report);
          results.checks.push(checkResult);
          
          if (checkResult.adjustment) {
            results.adjustments.push(checkResult.adjustment);
          }
        } catch (error) {
          logger.error(`检查 Portfolio ${portfolioId} 失败`, { error: error.message });
          results.errors.push({
            portfolioId,
            error: error.message
          });
        }
      }

      results.endTime = Date.now();
      results.duration = results.endTime - startTime;
      results.summary = {
        totalChecks: results.checks.length,
        totalAdjustments: results.adjustments.length,
        errors: results.errors.length
      };

      // 记录执行历史
      this.executionHistory.push(results);
      if (this.executionHistory.length > 100) {
        this.executionHistory.shift();
      }

      this.lastCheck = Date.now();
      logger.info(`自动驾驶检查完成，耗时 ${results.duration}ms，调整 ${results.adjustments.length} 项`);

      return results;
    } catch (error) {
      logger.error('自动驾驶检查执行失败', { error: error.message });
      results.errors.push({ error: error.message });
      return results;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 检查单个 Portfolio
   */
  async checkPortfolio(portfolioId, targetConfig, report) {
    const { targetAcos, tolerance, minBid, maxBid } = targetConfig;
    
    // 查找该 Portfolio 下的所有活动
    const portfolioCampaigns = report.filter(c => c.portfolioId === portfolioId);
    
    if (portfolioCampaigns.length === 0) {
      return { portfolioId, status: 'no_campaigns' };
    }

    // 计算整体 ACOS
    const totalSpend = portfolioCampaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalSales = portfolioCampaigns.reduce((sum, c) => sum + (c.sales || 0), 0);
    const currentAcos = calculateAcos(totalSpend, totalSales);

    const result = {
      portfolioId,
      targetAcos,
      currentAcos,
      lowerBound: targetAcos - tolerance,
      upperBound: targetAcos + tolerance,
      status: 'normal',
      adjustment: null
    };

    // 判断状态
    if (currentAcos === null) {
      result.status = 'no_data';
      return result;
    }

    if (currentAcos > targetAcos + tolerance) {
      result.status = 'acos_high';
    } else if (currentAcos < targetAcos - tolerance) {
      result.status = 'acos_low';
    }

    // 需要调整
    if (result.status !== 'normal') {
      const adjustment = this.calculateAdjustment(
        portfolioCampaigns,
        targetAcos,
        currentAcos,
        minBid,
        maxBid
      );

      if (adjustment) {
        result.adjustment = adjustment;
        result.adjustmentReason = this.generateAdjustmentReason(result.status, currentAcos, targetAcos);
        
        // 执行调整
        await this.executeAdjustment(adjustment);
      }
    }

    return result;
  }

  /**
   * 计算调整方案
   */
  calculateAdjustment(campaigns, targetAcos, currentAcos, minBid, maxBid) {
    const adjustments = [];
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);

    for (const campaign of campaigns) {
      if (!campaign.bid || campaign.bid <= 0) continue;
      
      // 优先调整花费最高的活动
      const spendRatio = campaign.spend / totalSpend;
      if (spendRatio < 0.1) continue; // 跳过花费占比小于 10% 的活动

      let newBid;
      
      if (currentAcos > targetAcos) {
        // ACOS 过高，降低出价
        const reduction = Math.min(
          config.automation.maxBidAdjustment,
          Math.abs(currentAcos - targetAcos) / currentAcos * 0.5
        );
        newBid = Math.max(minBid, campaign.bid * (1 - reduction));
      } else {
        // ACOS 过低，可以提价
        const increase = Math.min(
          config.automation.maxBidAdjustment,
          Math.abs(targetAcos - currentAcos) / targetAcos * 0.3
        );
        newBid = Math.min(maxBid, campaign.bid * (1 + increase));
      }

      if (Math.abs(newBid - campaign.bid) > 0.01) {
        adjustments.push({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          currentBid: campaign.bid,
          newBid: parseFloat(newBid.toFixed(2)),
          change: ((newBid - campaign.bid) / campaign.bid * 100).toFixed(1) + '%',
          spend: campaign.spend
        });
      }
    }

    return adjustments.length > 0 ? adjustments : null;
  }

  /**
   * 生成调整原因说明
   */
  generateAdjustmentReason(status, currentAcos, targetAcos) {
    if (status === 'acos_high') {
      return `ACOS 为 ${currentAcos.toFixed(1)}%，超出目标 ${targetAcos}% 容忍范围，正在降低出价以优化`;
    } else if (status === 'acos_low') {
      return `ACOS 为 ${currentAcos.toFixed(1)}%，低于目标 ${targetAcos}%，可以适当提高出价以获取更多流量`;
    }
    return '';
  }

  /**
   * 执行调整
   */
  async executeAdjustment(adjustments) {
    const results = [];

    for (const adj of adjustments) {
      try {
        // 使用领星 API 更新出价
        await lingxingService.updateCampaignBudget(adj.campaignId, adj.newBid);
        
        results.push({
          campaignId: adj.campaignId,
          success: true,
          newBid: adj.newBid
        });

        logger.info(`已调整广告活动 ${adj.campaignName} 出价: ${adj.currentBid} → ${adj.newBid}`);
      } catch (error) {
        logger.error(`调整广告活动 ${adj.campaignId} 失败`, { error: error.message });
        results.push({
          campaignId: adj.campaignId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 启动定时任务
   */
  startScheduler() {
    if (this.cronJob) {
      logger.warn('调度器已经在运行中');
      return;
    }

    // 每小时执行一次
    this.cronJob = cron.schedule('0 * * * *', async () => {
      logger.info('触发定时自动驾驶检查');
      await this.executeCheck();
    });

    logger.info('自动驾驶调度器已启动（每小时执行）');
  }

  /**
   * 停止定时任务
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('自动驾驶调度器已停止');
    }
  }

  /**
   * 获取执行历史
   */
  getHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCheck: this.lastCheck ? formatDate(this.lastCheck) : null,
      schedulerActive: this.cronJob !== null,
      configuredPortfolios: portfolioTargets.size,
      recentHistory: this.executionHistory.slice(-5).map(h => ({
        time: formatDate(h.startTime),
        checks: h.summary.totalChecks,
        adjustments: h.summary.totalAdjustments,
        errors: h.summary.errors
      }))
    };
  }
}

// 单例导出
const autoPilot = new AutoPilot();
export default autoPilot;
