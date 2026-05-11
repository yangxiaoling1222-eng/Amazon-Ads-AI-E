/**
 * 智能分析与建议引擎
 * 生成包含出价调整、预算优化、状态变更及新增关键词的三级建议体系
 */
import lingxingService from '../services/lingxing/index.js';
import dataSyncService from '../services/sync.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { calculateAcos, calculateRoas, groupBy, formatPercent } from '../utils/helpers.js';

class AnalysisEngine {
  constructor() {
    // 建议优先级
    this.PRIORITY = {
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low'
    };

    // 建议类型
    this.SUGGESTION_TYPE = {
      BID_INCREASE: 'bid_increase',
      BID_DECREASE: 'bid_decrease',
      BUDGET_INCREASE: 'budget_increase',
      BUDGET_DECREASE: 'budget_decrease',
      PAUSE_CAMPAIGN: 'pause_campaign',
      ENABLE_CAMPAIGN: 'enable_campaign',
      ADD_KEYWORDS: 'add_keywords',
      NEGATIVE_KEYWORDS: 'negative_keywords',
      REVIEW_CREATIVE: 'review_creative'
    };
  }

  /**
   * 执行完整账户分析
   */
  async analyze(params = {}) {
    const { days = 30 } = params;
    
    logger.info(`开始执行账户分析，时间范围: ${days}天`);
    
    try {
      // 并行获取多种数据
      const [shortReport, longReport, searchTerms, portfolios] = await Promise.all([
        dataSyncService.getAdReport({ days: 7 }),
        dataSyncService.getAdReport({ days }),
        dataSyncService.getSearchTermReport({ days }),
        dataSyncService.getPortfolioData()
      ]);

      // 生成各类建议
      const suggestions = {
        bidAdjustments: this.analyzeBidAdjustments(shortReport, longReport),
        budgetOptimizations: this.analyzeBudgetNeeds(shortReport, longReport),
        statusChanges: this.analyzeStatusChanges(shortReport),
        keywordSuggestions: this.analyzeKeywords(searchTerms, shortReport)
      };

      // 汇总并排序
      const allSuggestions = this.prioritizeAndMerge(suggestions);

      // 生成摘要
      const summary = this.generateSummary(allSuggestions, shortReport);

      return {
        suggestions: allSuggestions,
        summary,
        dateRange: { days },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('账户分析失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 分析出价调整建议
   */
  analyzeBidAdjustments(shortReport, longReport) {
    const suggestions = [];
    const targetAcos = config.automation.defaultTargetAcos;
    const tolerance = config.automation.acosTolerance;

    for (const campaign of shortReport) {
      if (!campaign.sales || campaign.sales === 0) continue;
      
      const acos = calculateAcos(campaign.spend, campaign.sales);
      if (acos === null) continue;

      // ACOS 过高 - 建议降低出价
      if (acos > targetAcos + tolerance) {
        const dailySpend = campaign.spend / 7;
        
        // 只对花费足够的活动提建议
        if (dailySpend >= 20) {
          const adjustment = Math.min(
            config.automation.maxBidAdjustment,
            (acos - targetAcos) / acos * 0.5
          );
          const newBid = campaign.bid ? campaign.bid * (1 - adjustment) : null;

          suggestions.push({
            id: this.generateId(),
            type: this.SUGGESTION_TYPE.BID_DECREASE,
            priority: this.calculatePriority(acos, targetAcos, dailySpend),
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            currentValue: campaign.bid,
            suggestedValue: newBid ? parseFloat(newBid.toFixed(2)) : null,
            reason: `ACOS ${formatPercent(acos)} 超出目标 ${targetAcos}%`,
            conclusion: this.generateBidDecreaseConclusion(campaign, acos, targetAcos, newBid),
            estimatedImpact: this.estimateBidChangeImpact(campaign, newBid, 'decrease')
          });
        }
      }
      
      // ACOS 过低且花费较低 - 建议提高出价以获取更多流量
      if (acos < targetAcos - tolerance && acos > 0) {
        const dailySpend = campaign.spend / 7;
        
        // 只对有潜力但花费不高的活动提建议
        if (dailySpend >= 10 && dailySpend <= 100) {
          const adjustment = Math.min(
            config.automation.maxBidAdjustment,
            (targetAcos - acos) / targetAcos * 0.3
          );
          const newBid = campaign.bid ? campaign.bid * (1 + adjustment) : null;

          suggestions.push({
            id: this.generateId(),
            type: this.SUGGESTION_TYPE.BID_INCREASE,
            priority: this.PRIORITY.LOW,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            currentValue: campaign.bid,
            suggestedValue: newBid ? parseFloat(newBid.toFixed(2)) : null,
            reason: `ACOS ${formatPercent(acos)} 低于目标 ${targetAcos}%，有提价空间`,
            conclusion: this.generateBidIncreaseConclusion(campaign, acos, targetAcos),
            estimatedImpact: this.estimateBidChangeImpact(campaign, newBid, 'increase')
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 分析预算优化建议
   */
  analyzeBudgetNeeds(shortReport, longReport) {
    const suggestions = [];
    const groupedCampaigns = groupBy(shortReport, 'portfolioId');

    for (const [portfolioId, campaigns] of Object.entries(groupedCampaigns)) {
      if (portfolioId === 'undefined') continue;

      const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
      const totalSales = campaigns.reduce((sum, c) => sum + (c.sales || 0), 0);
      const dailySpend = totalSpend / 7;
      
      // 花费接近预算的情况
      const campaignsNearBudget = campaigns.filter(c => c.budget && c.spend > c.budget * 0.9);
      
      if (campaignsNearBudget.length > 0) {
        const avgDailySpend = dailySpend / campaigns.length;
        
        suggestions.push({
          id: this.generateId(),
          type: this.SUGGESTION_TYPE.BUDGET_INCREASE,
          priority: this.PRIORITY.MEDIUM,
          portfolioId,
          campaigns: campaignsNearBudget.map(c => ({
            campaignId: c.campaignId,
            campaignName: c.campaignName,
            currentBudget: c.budget,
            suggestedBudget: Math.ceil(c.budget * 1.2 * 100) / 100
          })),
          reason: `${campaignsNearBudget.length} 个广告活动花费接近预算限制`,
          conclusion: `增加预算可以避免流量限制，预计每日可增加 ${(avgDailySpend * 0.3).toFixed(2)} 花费`
        });
      }

      // 有潜力但花费受限
      const highPerformingCampaigns = campaigns.filter(c => {
        if (!c.sales) return false;
        const acos = calculateAcos(c.spend, c.sales);
        return acos && acos < config.automation.defaultTargetAcos && c.spend > 500;
      });

      if (highPerformingCampaigns.length > 0 && dailySpend < 200) {
        suggestions.push({
          id: this.generateId(),
          type: this.SUGGESTION_TYPE.BUDGET_INCREASE,
          priority: this.PRIORITY.HIGH,
          portfolioId,
          campaigns: highPerformingCampaigns.map(c => ({
            campaignId: c.campaignId,
            campaignName: c.campaignName,
            currentSpend: c.spend
          })),
          reason: '高表现广告活动花费不足，可能存在增长空间',
          conclusion: `${highPerformingCampaigns.length} 个广告活动 ACOS 低于目标，建议增加预算以扩大规模`
        });
      }
    }

    return suggestions;
  }

  /**
   * 分析状态变更建议
   */
  analyzeStatusChanges(shortReport) {
    const suggestions = [];

    // 表现极差的广告活动 - 建议暂停
    for (const campaign of shortReport) {
      // 花费大但无转化的
      if (campaign.spend > 100 && (!campaign.purchases || campaign.purchases === 0)) {
        suggestions.push({
          id: this.generateId(),
          type: this.SUGGESTION_TYPE.PAUSE_CAMPAIGN,
          priority: this.PRIORITY.HIGH,
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          reason: `花费 ${campaign.spend.toFixed(2)} 但无任何转化`,
          conclusion: '立即暂停以避免无效花费',
          action: 'pause'
        });
        continue;
      }

      // ACOS 极高
      if (campaign.sales > 0) {
        const acos = calculateAcos(campaign.spend, campaign.sales);
        if (acos > 50) {
          suggestions.push({
            id: this.generateId(),
            type: this.SUGGESTION_TYPE.PAUSE_CAMPAIGN,
            priority: this.PRIORITY.HIGH,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            currentAcos: acos,
            reason: `ACOS ${formatPercent(acos)} 极高，严重超出目标`,
            conclusion: '建议暂停并进行深度诊断后再决定是否重启',
            action: 'pause'
          });
        }
      }
    }

    // 表现好但被暂停的
    // 这需要额外的状态数据，暂时注释
    // const pausedCampaigns = shortReport.filter(c => c.state === 'paused' && c.sales > 100);
    // for (const campaign of pausedCampaigns) {
    //   suggestions.push({
    //     type: this.SUGGESTION_TYPE.ENABLE_CAMPAIGN,
    //     ...
    //   });
    // }

    return suggestions;
  }

  /**
   * 分析关键词建议
   */
  analyzeKeywords(searchTerms, shortReport) {
    const suggestions = [];

    // 1. 筛选需要添加的关键词
    const campaignKeywords = groupBy(searchTerms, 'campaignId');
    
    for (const [campaignId, terms] of Object.entries(campaignKeywords)) {
      // 找出表现好的搜索词 -> 建议添加为精确匹配关键词
      const topPerformingTerms = terms
        .filter(t => t.sales > 50 && t.purchases >= 2 && t.clicks >= 10)
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5);

      if (topPerformingTerms.length > 0) {
        const campaign = shortReport.find(c => c.campaignId === campaignId);
        
        suggestions.push({
          id: this.generateId(),
          type: this.SUGGESTION_TYPE.ADD_KEYWORDS,
          priority: this.PRIORITY.MEDIUM,
          campaignId,
          campaignName: campaign?.campaignName || campaignId,
          keywords: topPerformingTerms.map(t => ({
            keyword: t.keyword,
            matchType: 'exact',
            suggestedBid: Math.max(0.5, t.spend / t.clicks * 0.8)
          })),
          reason: `${topPerformingTerms.length} 个搜索词表现优秀，建议添加为精确匹配`,
          conclusion: '精确匹配可以提高精准流量，减少无效花费'
        });
      }
    }

    // 2. 筛选需要排除的关键词
    const negativeKeywordSuggestions = this.findNegativeKeywords(searchTerms);
    suggestions.push(...negativeKeywordSuggestions);

    return suggestions;
  }

  /**
   * 筛选否定关键词
   */
  findNegativeKeywords(searchTerms) {
    const suggestions = [];
    const minClicks = 10;
    const maxCvr = 0.5;

    // 按campaign分组
    const grouped = groupBy(searchTerms, 'campaignId');
    
    for (const [campaignId, terms] of Object.entries(grouped)) {
      const negativeKeywords = [];

      for (const term of terms) {
        // 无转化关键词
        if (!term.purchases && term.purchases !== 0 && term.clicks >= minClicks) {
          negativeKeywords.push({
            keyword: term.keyword,
            matchType: term.matchType,
            clicks: term.clicks,
            spend: term.spend,
            reason: '无转化'
          });
        } else if (term.clicks > 0) {
          const cvr = (term.purchases / term.clicks) * 100;
          if (cvr < maxCvr && term.clicks >= minClicks) {
            negativeKeywords.push({
              keyword: term.keyword,
              matchType: term.matchType,
              clicks: term.clicks,
              spend: term.spend,
              cvr: cvr.toFixed(2),
              reason: `转化率 ${cvr.toFixed(2)}% 过低`
            });
          }
        }
      }

      if (negativeKeywords.length > 0) {
        const campaign = shortReport?.find(c => c.campaignId === campaignId);
        
        suggestions.push({
          id: this.generateId(),
          type: this.SUGGESTION_TYPE.NEGATIVE_KEYWORDS,
          priority: this.PRIORITY.MEDIUM,
          campaignId,
          campaignName: campaign?.campaignName || campaignId,
          keywords: negativeKeywords.sort((a, b) => b.spend - a.spend).slice(0, 20),
          totalSpend: negativeKeywords.reduce((sum, k) => sum + k.spend, 0),
          reason: `${negativeKeywords.length} 个关键词花费高但效果差`,
          conclusion: `添加否定关键词后预计每日可节省 ${(negativeKeywords.reduce((sum, k) => sum + k.spend, 0) / 14).toFixed(2)} 花费`
        });
      }
    }

    return suggestions;
  }

  /**
   * 合并并排序所有建议
   */
  prioritizeAndMerge(suggestions) {
    const all = [
      ...suggestions.bidAdjustments,
      ...suggestions.budgetOptimizations,
      ...suggestions.statusChanges,
      ...suggestions.keywordSuggestions
    ];

    // 按优先级排序
    return all.sort((a, b) => {
      const priorityOrder = { [this.PRIORITY.HIGH]: 0, [this.PRIORITY.MEDIUM]: 1, [this.PRIORITY.LOW]: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 生成分析摘要
   */
  generateSummary(suggestions, report) {
    const totalSpend = report.reduce((sum, c) => sum + (c.spend || 0), 0);
    const totalSales = report.reduce((sum, c) => sum + (c.sales || 0), 0);

    return {
      totalSuggestions: suggestions.length,
      highPriority: suggestions.filter(s => s.priority === this.PRIORITY.HIGH).length,
      mediumPriority: suggestions.filter(s => s.priority === this.PRIORITY.MEDIUM).length,
      lowPriority: suggestions.filter(s => s.priority === this.PRIORITY.LOW).length,
      byType: {
        bidAdjustment: suggestions.filter(s => s.type.includes('bid')).length,
        budgetOptimization: suggestions.filter(s => s.type.includes('budget')).length,
        statusChange: suggestions.filter(s => s.type.includes('pause') || s.type.includes('enable')).length,
        keywordSuggestion: suggestions.filter(s => s.type.includes('keyword')).length
      },
      overallAcos: calculateAcos(totalSpend, totalSales),
      potentialSavings: suggestions
        .filter(s => s.type === this.SUGGESTION_TYPE.PAUSE_CAMPAIGN)
        .reduce((sum, s) => sum + (s.campaign?.currentSpend || 0), 0) * 0.3 // 估算节省 30%
    };
  }

  /**
   * 计算优先级
   */
  calculatePriority(acos, targetAcos, dailySpend) {
    const acosDiff = acos - targetAcos;
    
    if (acosDiff > 20 || dailySpend > 200) {
      return this.PRIORITY.HIGH;
    } else if (acosDiff > 10 || dailySpend > 100) {
      return this.PRIORITY.MEDIUM;
    }
    return this.PRIORITY.LOW;
  }

  /**
   * 生成降低出价结论
   */
  generateBidDecreaseConclusion(campaign, acos, targetAcos, newBid) {
    const estimatedAcosImprovement = Math.min(
      ((acos - targetAcos) / acos) * 0.7 * 100,
      30
    );
    
    let conclusion = `建议将出价从 ${campaign.bid?.toFixed(2)} 降低`;
    if (newBid) {
      conclusion += ` 至 ${newBid.toFixed(2)}`;
    }
    conclusion += `，预计可将 ACOS 从 ${acos.toFixed(1)}% 改善至 ${Math.max(targetAcos, acos - estimatedAcosImprovement).toFixed(1)}% 附近`;
    
    return conclusion;
  }

  /**
   * 生成提高出价结论
   */
  generateBidIncreaseConclusion(campaign, acos, targetAcos) {
    return `ACOS 处于较低水平，当前出价可能限制了流量获取。建议适度提高出价以扩大曝光，预计可在保持 ACOS < ${targetAcos}% 的同时增加 ${(campaign.sales * 0.2).toFixed(0)} 销售额`;
  }

  /**
   * 估算出价变化影响
   */
  estimateBidChangeImpact(campaign, newBid, direction) {
    if (!newBid || !campaign.bid) return null;
    
    const changeRatio = newBid / campaign.bid;
    const estimatedSpendChange = direction === 'decrease' 
      ? campaign.spend * (1 - changeRatio)
      : campaign.spend * (changeRatio - 1) * 0.5;

    return {
      spendImpact: estimatedSpendChange.toFixed(2),
      direction: direction === 'decrease' ? 'reduce' : 'potential_increase',
      note: direction === 'decrease' 
        ? `预计每日减少 ${estimatedSpendChange.toFixed(2)} 花费`
        : '实际效果取决于市场竞争情况'
    };
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return `sug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取建议执行预览
   */
  async previewAction(suggestionId, suggestions) {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      return { error: '未找到指定建议' };
    }

    const previews = {
      [this.SUGGESTION_TYPE.BID_DECREASE]: {
        action: '修改出价',
        current: suggestion.currentValue,
        change: suggestion.suggestedValue ? `-${((1 - suggestion.suggestedValue / suggestion.currentValue) * 100).toFixed(0)}%` : 'N/A',
        after: suggestion.suggestedValue
      },
      [this.SUGGESTION_TYPE.BID_INCREASE]: {
        action: '修改出价',
        current: suggestion.currentValue,
        change: suggestion.suggestedValue ? `+${((suggestion.suggestedValue / suggestion.currentValue - 1) * 100).toFixed(0)}%` : 'N/A',
        after: suggestion.suggestedValue
      },
      [this.SUGGESTION_TYPE.PAUSE_CAMPAIGN]: {
        action: '暂停广告活动',
        impact: '立即停止花费，但不会删除数据'
      },
      [this.SUGGESTION_TYPE.ADD_KEYWORDS]: {
        action: '添加关键词',
        count: suggestion.keywords?.length || 0,
        keywords: suggestion.keywords?.map(k => k.keyword).slice(0, 5)
      },
      [this.SUGGESTION_TYPE.NEGATIVE_KEYWORDS]: {
        action: '添加否定关键词',
        count: suggestion.keywords?.length || 0,
        potentialSavings: suggestion.totalSpend
      }
    };

    return {
      suggestionId,
      ...previews[suggestion.type]
    };
  }
}

// 单例导出
export default new AnalysisEngine();
