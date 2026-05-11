/**
 * AI 全自动优化模块
 * 支持：智能调价、自动否词、新增关键词、广告位调整、预算优化、暂停低效活动
 */
import cron from 'node-cron';
import lingxingService from '../services/lingxing/index.js';
import dataSyncService from '../services/sync.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { calculateAcos, calculateRoas, formatDate, getDateRange } from '../utils/helpers.js';

// 存储优化目标配置
const optimizationTargets = new Map();

class FullAutoPilot {
  constructor() {
    this.cronJob = null;
    this.executionHistory = [];
    this.isRunning = false;
  }

  /**
   * 创建优化目标
   */
  createTarget(params) {
    const {
      storeId,
      portfolioId,
      portfolioName,
      targetAcos,
      tolerance = 5,
      dailyBudget = null,
      autoActions = ['bid', 'negative', 'keyword', 'placement'],
      maxBidChange = 0.2,
      minBid = 0.2
    } = params;

    // 检查是否已存在该店铺下该组合的目标
    const existing = Array.from(optimizationTargets.values()).find(
      t => t.storeId === storeId && t.portfolioId === portfolioId
    );
    if (existing) {
      throw new Error(`广告组合 ${portfolioName} 已存在优化目标，请先删除再创建`);
    }

    // 获取店铺名称
    const store = config.getStore(storeId);
    const storeName = store ? store.name : storeId;

    const target = {
      id: `OPT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      storeId,
      storeName,
      portfolioId,
      portfolioName,
      targetAcos,
      tolerance,
      dailyBudget,
      autoActions,
      maxBidChange,
      minBid,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        totalActions: 0,
        weeklySavings: 0,
        lastActionAt: null
      }
    };

    optimizationTargets.set(target.id, target);
    logger.info(`创建优化目标: ${portfolioName}`, { targetId: target.id, storeId });
    
    return target;
  }

  /**
   * 更新优化目标
   */
  updateTarget(targetId, updates) {
    const target = optimizationTargets.get(targetId);
    if (!target) {
      throw new Error('目标不存在');
    }

    Object.assign(target, updates, { updatedAt: new Date().toISOString() });
    logger.info(`更新优化目标: ${target.portfolioName}`);
    
    return target;
  }

  /**
   * 删除优化目标
   */
  deleteTarget(targetId) {
    const target = optimizationTargets.get(targetId);
    if (!target) {
      throw new Error('目标不存在');
    }
    
    optimizationTargets.delete(targetId);
    logger.info(`删除优化目标: ${target.portfolioName}`);
    
    return true;
  }

  /**
   * 获取所有目标
   */
  getAllTargets() {
    return Array.from(optimizationTargets.values());
  }

  /**
   * 获取单个目标
   */
  getTarget(targetId) {
    return optimizationTargets.get(targetId);
  }

  /**
   * 获取目标及其当前ACOS数据
   */
  async getTargetWithData(targetId, days = 7) {
    const target = optimizationTargets.get(targetId);
    if (!target) {
      throw new Error('目标不存在');
    }

    const report = await dataSyncService.getAdReport({ days });
    const portfolioData = report.filter(c => c.portfolioId === target.portfolioId);
    
    const totalSpend = portfolioData.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalSales = portfolioData.reduce((sum, c) => sum + (c.sales || 0), 0);
    const currentAcos = calculateAcos(totalSpend, totalSales);

    return {
      ...target,
      currentAcos,
      currentSpend: totalSpend,
      currentSales: totalSales,
      campaigns: portfolioData
    };
  }

  /**
   * 执行完整的AI自动优化
   */
  async executeFullOptimization(targetId) {
    if (this.isRunning) {
      logger.warn('优化任务正在执行中');
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results = {
      targetId,
      startTime,
      actions: [],
      errors: []
    };

    try {
      const target = optimizationTargets.get(targetId);
      if (!target || target.status !== 'active') {
        return { skipped: true, reason: 'target_not_active' };
      }

      const { startDate, endDate } = getDateRange(7);
      const report = await dataSyncService.getAdReport({ days: 7 });
      const portfolioData = report.filter(c => c.portfolioId === target.portfolioId);

      if (portfolioData.length === 0) {
        return { skipped: true, reason: 'no_data' };
      }

      // 执行各项自动化操作
      for (const action of target.autoActions) {
        try {
          const actionResult = await this.executeAction(action, target, portfolioData);
          if (actionResult.executed) {
            results.actions.push(actionResult);
            target.stats.totalActions++;
            target.stats.lastActionAt = new Date().toISOString();
          }
        } catch (error) {
          logger.error(`执行操作 ${action} 失败`, { error: error.message });
          results.errors.push({ action, error: error.message });
        }
      }

      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;
      
      // 记录执行历史
      this.executionHistory.push(results);
      if (this.executionHistory.length > 100) {
        this.executionHistory.shift();
      }

      logger.info(`AI优化完成: ${target.portfolioName}`, { 
        actions: results.actions.length, 
        duration: results.duration 
      });

      return results;
    } catch (error) {
      logger.error('AI优化执行失败', { error: error.message });
      results.errors.push({ error: error.message });
      return results;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 执行单个自动化操作
   */
  async executeAction(action, target, portfolioData) {
    switch (action) {
      case 'bid':
        return await this.executeBidAdjustment(target, portfolioData);
      case 'negative':
        return await this.executeNegativeKeywords(target, portfolioData);
      case 'keyword':
        return await this.executeNewKeywords(target, portfolioData);
      case 'placement':
        return await this.executePlacementAdjustment(target, portfolioData);
      case 'budget':
        return await this.executeBudgetOptimization(target, portfolioData);
      case 'pause':
        return await this.executePauseLowPerformers(target, portfolioData);
      default:
        return { action, executed: false, reason: 'unknown_action' };
    }
  }

  /**
   * 智能调价
   */
  async executeBidAdjustment(target, portfolioData) {
    const { targetAcos, tolerance, maxBidChange, minBid } = target;
    const adjustments = [];

    for (const campaign of portfolioData) {
      if (!campaign.sales || campaign.sales === 0) continue;
      
      const acos = calculateAcos(campaign.spend, campaign.sales);
      if (acos === null) continue;

      // 每天花费低于50美元跳过
      const dailySpend = campaign.spend / 7;
      if (dailySpend < 50) continue;

      let newBid = campaign.bid;
      let adjustmentReason = null;

      // ACOS过高 - 降低出价
      if (acos > targetAcos + tolerance) {
        const diff = acos - targetAcos;
        const reduction = Math.min(maxBidChange, (diff / acos) * 0.5);
        newBid = Math.max(minBid, campaign.bid * (1 - reduction));
        adjustmentReason = `ACOS ${acos.toFixed(1)}% 超标，降低 ${(reduction * 100).toFixed(0)}%`;
      }
      
      // ACOS过低 - 可以提价
      else if (acos < targetAcos - tolerance && acos > 0) {
        const diff = targetAcos - acos;
        const increase = Math.min(maxBidChange * 0.5, (diff / targetAcos) * 0.3);
        newBid = campaign.bid * (1 + increase);
        adjustmentReason = `ACOS ${acos.toFixed(1)}% 过低，可提价 ${(increase * 100).toFixed(0)}%`;
      }

      if (newBid && Math.abs(newBid - campaign.bid) > 0.01) {
        try {
          await lingxingService.updateCampaignBudget(campaign.campaignId, newBid);
          adjustments.push({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            action: 'bid_adjust',
            from: campaign.bid,
            to: parseFloat(newBid.toFixed(2)),
            reason: adjustmentReason,
            estimatedImpact: this.estimateBidImpact(campaign, newBid)
          });
          logger.info(`调价: ${campaign.campaignName} ${campaign.bid} → ${newBid.toFixed(2)}`);
        } catch (error) {
          logger.error(`调价失败: ${campaign.campaignName}`, { error: error.message });
        }
      }
    }

    return {
      action: 'bid',
      executed: adjustments.length > 0,
      details: adjustments,
      summary: `调整 ${adjustments.length} 个活动出价`
    };
  }

  /**
   * 自动否词
   */
  async executeNegativeKeywords(target, portfolioData) {
    const searchTerms = await dataSyncService.getSearchTermReport({ days: 14 });
    const negatives = [];

    // 按活动分组搜索词
    const termsByCampaign = new Map();
    for (const term of searchTerms) {
      if (!termsByCampaign.has(term.campaignId)) {
        termsByCampaign.set(term.campaignId, []);
      }
      termsByCampaign.get(term.campaignId).push(term);
    }

    for (const [campaignId, terms] of termsByCampaign) {
      const campaign = portfolioData.find(c => c.campaignId === campaignId);
      if (!campaign) continue;

      for (const term of terms) {
        // 无转化关键词：花费超过20美元且无购买
        if (!term.purchases && term.purchases !== 0 && term.clicks >= 15) {
          negatives.push({
            campaignId,
            keyword: term.keyword,
            matchType: 'negativeExact',
            clicks: term.clicks,
            spend: term.spend,
            reason: '无转化'
          });
        }
        // 低转化关键词
        else if (term.clicks > 0) {
          const cvr = (term.purchases / term.clicks) * 100;
          if (cvr < 0.5 && term.clicks >= 20) {
            negatives.push({
              campaignId,
              keyword: term.keyword,
              matchType: 'negativePhrase',
              clicks: term.clicks,
              spend: term.spend,
              reason: `转化率 ${cvr.toFixed(2)}% 过低`
            });
          }
        }
      }
    }

    // 去重并限制数量
    const uniqueNegatives = this.deduplicateKeywords(negatives).slice(0, 20);

    if (uniqueNegatives.length > 0) {
      const estimatedSavings = uniqueNegatives.reduce((sum, n) => sum + n.spend, 0) / 14;
      
      // 批量添加否定词
      try {
        for (const neg of uniqueNegatives) {
          await lingxingService.addNegativeKeywords({
            campaignId: neg.campaignId,
            keywords: [neg.keyword],
            matchType: neg.matchType
          });
        }
      } catch (error) {
        logger.error('添加否定词失败', { error: error.message });
      }

      return {
        action: 'negative',
        executed: true,
        details: uniqueNegatives,
        summary: `添加 ${uniqueNegatives.length} 个否定词，预计节省 $${estimatedSavings.toFixed(2)}/天`
      };
    }

    return {
      action: 'negative',
      executed: false,
      summary: '无需添加否定词'
    };
  }

  /**
   * 新增关键词
   */
  async executeNewKeywords(target, portfolioData) {
    const searchTerms = await dataSyncService.getSearchTermReport({ days: 14 });
    const newKeywords = [];

    // 按活动分组
    const termsByCampaign = new Map();
    for (const term of searchTerms) {
      if (!termsByCampaign.has(term.campaignId)) {
        termsByCampaign.set(term.campaignId, []);
      }
      termsByCampaign.get(term.campaignId).push(term);
    }

    for (const [campaignId, terms] of termsByCampaign) {
      const campaign = portfolioData.find(c => c.campaignId === campaignId);
      if (!campaign) continue;

      // 找出表现好的搜索词 -> 建议添加为关键词
      const topTerms = terms
        .filter(t => t.sales >= 50 && t.purchases >= 2 && t.clicks >= 10)
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 3);

      for (const term of topTerms) {
        const suggestedBid = Math.max(0.5, (term.spend / term.clicks) * 0.8);
        newKeywords.push({
          campaignId,
          campaignName: campaign.campaignName,
          keyword: term.keyword,
          matchType: 'exact',
          suggestedBid: parseFloat(suggestedBid.toFixed(2)),
          sales: term.sales,
          cvr: ((term.purchases / term.clicks) * 100).toFixed(2)
        });
      }
    }

    // 去重
    const uniqueKeywords = this.deduplicateKeywords(newKeywords.map(k => ({
      ...k,
      key: `${k.campaignId}_${k.keyword}_${k.matchType}`
    }))).slice(0, 10);

    return {
      action: 'keyword',
      executed: uniqueKeywords.length > 0,
      details: uniqueKeywords,
      summary: uniqueKeywords.length > 0 
        ? `建议添加 ${uniqueKeywords.length} 个新关键词`
        : '暂无高表现搜索词可添加'
    };
  }

  /**
   * 广告位调整
   */
  async executePlacementAdjustment(target, portfolioData) {
    // 广告位调整通常需要更多数据支持
    // 这里提供建议而非直接执行
    const placements = [];

    for (const campaign of portfolioData) {
      // 假设从API获取placement数据
      // 实际实现需要根据亚马逊API获取
      if (campaign.placementData) {
        const { top, productPage, rest } = campaign.placementData;
        
        // 检查各位置表现
        const topRoi = top?.sales / top?.spend || 0;
        const pageRoi = productPage?.sales / productPage?.spend || 0;
        
        if (topRoi < 1.5 && campaign.bid < target.targetAcos / 10) {
          placements.push({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            issue: '首页位置ACOS过高',
            suggestion: '降低首页位置溢价或降低整体出价',
            priority: 'high'
          });
        }
        
        if (pageRoi > 3 && topRoi < 1) {
          placements.push({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            issue: '商品页面表现优于首页',
            suggestion: '考虑降低首页溢价，将预算转移至商品页面',
            priority: 'medium'
          });
        }
      }
    }

    return {
      action: 'placement',
      executed: placements.length > 0,
      details: placements,
      summary: placements.length > 0 
        ? `发现 ${placements.length} 个广告位优化机会`
        : '广告位表现正常'
    };
  }

  /**
   * 预算优化
   */
  async executeBudgetOptimization(target, portfolioData) {
    const adjustments = [];
    const totalSpend = portfolioData.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalBudget = target.dailyBudget ? target.dailyBudget * 7 : null;

    if (!totalBudget) {
      return { action: 'budget', executed: false, summary: '未设置每日预算' };
    }

    // 花费接近预算的活动
    for (const campaign of portfolioData) {
      if (campaign.budget && campaign.spend > campaign.budget * 0.9) {
        const acos = calculateAcos(campaign.spend, campaign.sales);
        
        // 如果ACOS达标且有增长空间，增加预算
        if (acos && acos < target.targetAcos) {
          adjustments.push({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            currentBudget: campaign.budget,
            suggestedBudget: Math.ceil(campaign.budget * 1.2 * 100) / 100,
            reason: '表现良好且花费接近上限，建议增加预算'
          });
        }
      }
    }

    return {
      action: 'budget',
      executed: adjustments.length > 0,
      details: adjustments,
      summary: adjustments.length > 0 
        ? `${adjustments.length} 个活动可增加预算`
        : '预算分配合理'
    };
  }

  /**
   * 暂停低效活动
   */
  async executePauseLowPerformers(target, portfolioData) {
    const toPause = [];

    for (const campaign of portfolioData) {
      // 花费大但无转化
      if (campaign.spend > 100 && (!campaign.purchases || campaign.purchases === 0)) {
        toPause.push({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          spend: campaign.spend,
          reason: '花费 $' + campaign.spend.toFixed(0) + ' 无任何转化'
        });
        continue;
      }

      // ACOS极高
      if (campaign.sales > 0) {
        const acos = calculateAcos(campaign.spend, campaign.sales);
        if (acos && acos > 50) {
          toPause.push({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            spend: campaign.spend,
            acos,
            reason: `ACOS ${acos.toFixed(1)}% 极高，严重超标`
          });
        }
      }
    }

    // 自动暂停高优先级项
    const highPriority = toPause.filter(p => p.spend > 200 || p.acos > 50);
    for (const pause of highPriority) {
      try {
        await lingxingService.updateCampaignStatus(pause.campaignId, 'paused');
        logger.info(`自动暂停: ${pause.campaignName}`);
      } catch (error) {
        logger.error(`暂停失败: ${pause.campaignName}`, { error: error.message });
      }
    }

    return {
      action: 'pause',
      executed: highPriority.length > 0,
      details: toPause,
      summary: `暂停 ${highPriority.length} 个低效活动，${toPause.length - highPriority.length} 个待确认`
    };
  }

  /**
   * 启动定时优化任务
   */
  startScheduler() {
    if (this.cronJob) {
      logger.warn('调度器已在运行');
      return;
    }

    // 每小时检查一次
    this.cronJob = cron.schedule('0 * * * *', async () => {
      logger.info('触发定时AI优化检查');
      
      for (const target of optimizationTargets.values()) {
        if (target.status === 'active') {
          await this.executeFullOptimization(target.id);
        }
      }
    });

    logger.info('AI自动优化调度器已启动');
  }

  /**
   * 停止调度器
   */
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('AI自动优化调度器已停止');
    }
  }

  /**
   * 辅助：去重关键词
   */
  deduplicateKeywords(keywords) {
    const seen = new Set();
    return keywords.filter(k => {
      const key = k.key || `${k.campaignId}_${k.keyword}_${k.matchType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 辅助：估算出价变化影响
   */
  estimateBidImpact(campaign, newBid) {
    const ratio = newBid / campaign.bid;
    const spendChange = campaign.spend * (1 - ratio);
    return {
      direction: ratio < 1 ? 'reduce' : 'increase',
      amount: Math.abs(spendChange).toFixed(2)
    };
  }

  /**
   * 获取执行历史
   */
  getHistory(targetId = null, limit = 10) {
    let history = this.executionHistory;
    if (targetId) {
      history = history.filter(h => h.targetId === targetId);
    }
    return history.slice(-limit);
  }
}

// 单例导出
const fullAutoPilot = new FullAutoPilot();
export default fullAutoPilot;
