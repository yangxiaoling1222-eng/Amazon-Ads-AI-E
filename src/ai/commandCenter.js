/**
 * AI 指令中心
 * 基于大语言模型的自然语言交互界面
 */
import OpenAI from 'openai';
import config from '../config/index.js';
import dataSyncService from '../services/sync.js';
import logger from '../utils/logger.js';
import { formatDate, formatCurrency, formatPercent, calculateAcos, groupBy } from '../utils/helpers.js';

class AICommandCenter {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.ai.openaiApiKey
    });
    
    // 系统提示词
    this.systemPrompt = `你是亚马逊广告 AI 智能专家，专门帮助卖家分析和管理亚马逊广告。

你有以下能力：
1. 分析广告数据，识别表现好的和表现差的广告
2. 提供出价调整、预算优化的建议
3. 生成广告报表和搜索词报告
4. 诊断 ACOS 异常并提供解决方案
5. 筛选需要排除的低效关键词

请用简洁专业的语言回复，对于数据问题，请给出具体的数字和建议。`;

    // 意图识别函数
    this.intentHandlers = {
      'analyze_top_performers': this.analyzeTopPerformers.bind(this),
      'find_acos_issues': this.findAcosIssues.bind(this),
      'suggest_bid_adjustments': this.suggestBidAdjustments.bind(this),
      'generate_report': this.generateReport.bind(this),
      'diagnose_campaign': this.diagnoseCampaign.bind(this),
      'find_negative_keywords': this.findNegativeKeywords.bind(this),
      'general_query': this.handleGeneralQuery.bind(this)
    };

    // OpenRouter 配置
    this.openrouterConfig = {
      enabled: config.openrouter.enabled,
      apiKey: config.openrouter.apiKey,
      baseUrl: config.openrouter.baseUrl,
      defaultModel: config.openrouter.defaultModel
    };
  }

  /**
   * 获取客户端实例（根据模型决定使用哪个API）
   */
  getClient(model) {
    if (model && model.includes('/')) {
      // 使用 OpenRouter
      if (!this.openrouterConfig.enabled) {
        this.openrouterConfig.enabled = true;
        this.client = new OpenAI({
          apiKey: this.openrouterConfig.apiKey,
          baseURL: this.openrouterConfig.baseUrl,
          dangerouslyAllowBrowser: true
        });
      }
      return { client: this.client, isOpenRouter: true };
    }
    // 使用原生 OpenAI
    return { client: this.client, isOpenRouter: false };
  }

  /**
   * 解析用户意图
   */
  async identifyIntent(userQuery, options = {}) {
    const model = options.model || this.openrouterConfig.defaultModel;
    const { client, isOpenRouter } = this.getClient(model);
    
    try {
      const requestOptions = {
        model: model,
        messages: [
          { role: 'system', content: `分析以下用户查询，返回最匹配的意图类型：

意图类型：
- analyze_top_performers: 分析表现最好的广告组合
- find_acos_issues: 查找 ACOS 异常的活动
- suggest_bid_adjustments: 提供出价调整建议
- generate_report: 生成广告报表
- diagnose_campaign: 诊断特定广告活动的问题
- find_negative_keywords: 筛选需要排除的关键词
- general_query: 一般性查询/闲聊

只返回意图类型，不要其他内容。` },
          { role: 'user', content: userQuery }
        ],
        max_tokens: 50,
        temperature: 0.3
      };

      // OpenRouter 需要额外参数
      if (isOpenRouter) {
        requestOptions.extra_body = {
          'provider': { 'order': ['OpenRouter'] }
        };
      }

      const response = await client.chat.completions.create(requestOptions);
      return response.choices[0].message.content.trim().toLowerCase();
    } catch (error) {
      logger.error('意图识别失败', { error: error.message });
      return 'general_query';
    }
  }

  /**
   * 处理用户查询
   */
  async processQuery(userQuery, params = {}, options = {}) {
    const model = options.model || this.openrouterConfig.defaultModel;
    logger.info(`处理 AI 查询: ${userQuery}`, { model });

    try {
      // 1. 识别意图
      const intent = await this.identifyIntent(userQuery, options);
      logger.info(`识别到意图: ${intent}`);

      // 2. 根据意图获取数据
      const handler = this.intentHandlers[intent] || this.intentHandlers['general_query'];
      const contextData = await handler(params);

      // 3. 生成回复
      const response = await this.generateResponse(userQuery, intent, contextData, options);
      
      return {
        success: true,
        intent,
        response,
        data: contextData,
        model: model
      };
    } catch (error) {
      logger.error('处理查询失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 分析表现最好的广告组合
   */
  async analyzeTopPerformers(params = {}) {
    const { days = 7, limit = 10, sortBy = 'sales' } = params;
    
    try {
      const report = await dataSyncService.getAdReport({ days });
      
      // 排序并取前几名
      const sorted = report
        .filter(item => item.sales > 0)
        .sort((a, b) => {
          if (sortBy === 'sales') return b.sales - a.sales;
          if (sortBy === 'acos') return calculateAcos(a.spend, a.sales) - calculateAcos(b.spend, b.sales);
          if (sortBy === 'roas') return (b.sales / b.spend) - (a.sales / a.spend);
          return 0;
        })
        .slice(0, limit);

      return {
        topPerformers: sorted.map(item => ({
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          sales: item.sales,
          spend: item.spend,
          impressions: item.impressions,
          clicks: item.clicks,
          acos: calculateAcos(item.spend, item.sales),
          roas: item.sales / item.spend,
          ctr: (item.clicks / item.impressions * 100).toFixed(2),
          cpc: (item.spend / item.clicks).toFixed(2)
        })),
        dateRange: `${days}天`
      };
    } catch (error) {
      logger.error('分析表现失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 查找 ACOS 异常的活动
   */
  async findAcosIssues(params = {}) {
    const { targetAcos = config.automation.defaultTargetAcos, tolerance = config.automation.acosTolerance } = params;
    
    try {
      const report = await dataSyncService.getAdReport({ days: 7 });
      const issues = [];

      for (const item of report) {
        if (!item.sales || item.sales === 0) continue;
        
        const acos = calculateAcos(item.spend, item.sales);
        
        // ACOS 过高（超出容忍范围）
        if (acos > targetAcos + tolerance) {
          issues.push({
            campaignId: item.campaignId,
            campaignName: item.campaignName,
            type: 'high_ac',
            currentAcos: acos,
            targetAcos,
            spend: item.spend,
            sales: item.sales,
            severity: acos > targetAcos + tolerance * 2 ? 'high' : 'medium',
            recommendation: this.generateAcosRecommendation(acos, targetAcos, item)
          });
        }
        
        // ACOS 过低（可以适当提价获取更多流量）
        if (acos < targetAcos - tolerance && acos > 0) {
          issues.push({
            campaignId: item.campaignId,
            campaignName: item.campaignName,
            type: 'low_ac',
            currentAcos: acos,
            targetAcos,
            spend: item.spend,
            sales: item.sales,
            severity: 'low',
            recommendation: 'ACOS 偏低，可以适当提高出价以获取更多流量'
          });
        }
      }

      return {
        issues: issues.sort((a, b) => {
          const severityMap = { high: 3, medium: 2, low: 1 };
          return severityMap[b.severity] - severityMap[a.severity];
        }),
        summary: {
          total: issues.length,
          highPriority: issues.filter(i => i.severity === 'high').length,
          mediumPriority: issues.filter(i => i.severity === 'medium').length,
          lowPriority: issues.filter(i => i.severity === 'low').length
        },
        targetAcos
      };
    } catch (error) {
      logger.error('查找 ACOS 异常失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成 ACOS 调整建议
   */
  generateAcosRecommendation(currentAcos, targetAcos, item) {
    const diff = currentAcos - targetAcos;
    const bidReduction = Math.min((diff / currentAcos) * 0.5, config.automation.maxBidAdjustment);
    const newBid = item.bid ? item.bid * (1 - bidReduction) : null;

    return `ACOS 高出目标 ${diff.toFixed(1)}%，建议降低出价 ${(bidReduction * 100).toFixed(0)}%` +
      (newBid ? `（${formatCurrency(item.bid)} → ${formatCurrency(newBid)}）` : '');
  }

  /**
   * 提供出价调整建议
   */
  async suggestBidAdjustments(params = {}) {
    const { days = 7 } = params;
    
    try {
      const report = await dataSyncService.getAdReport({ days });
      const suggestions = [];

      for (const item of report) {
        if (!item.sales || item.sales === 0) continue;
        
        const acos = calculateAcos(item.spend, item.sales);
        const targetAcos = config.automation.defaultTargetAcos;
        
        // 每天花费超过 50 美元才考虑调整
        const dailySpend = item.spend / days;
        if (dailySpend < 50) continue;
        
        if (acos > targetAcos + config.automation.acosTolerance) {
          const bidAdjustment = Math.min(
            (acos - targetAcos) / acos * 0.3,
            config.automation.maxBidAdjustment
          );
          
          suggestions.push({
            campaignId: item.campaignId,
            campaignName: item.campaignName,
            action: 'reduce_bid',
            currentBid: item.bid,
            suggestedBid: item.bid ? (item.bid * (1 - bidAdjustment)).toFixed(2) : null,
            adjustment: `-${(bidAdjustment * 100).toFixed(0)}%`,
            reason: `ACOS ${acos.toFixed(1)}% 超出目标 ${targetAcos}%`,
            priority: acos > targetAcos + 10 ? 'high' : 'medium'
          });
        }
      }

      return {
        suggestions: suggestions.sort((a, b) => {
          const priorityMap = { high: 3, medium: 2, low: 1 };
          return priorityMap[b.priority] - priorityMap[a.priority];
        }),
        totalSpend: suggestions.reduce((sum, s) => sum + (s.currentBid || 0), 0)
      };
    } catch (error) {
      logger.error('出价调整建议失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成广告报表
   */
  async generateReport(params = {}) {
    const { reportType = 'campaign', days = 7, format = 'json' } = params;
    
    try {
      const { startDate, endDate } = require('../utils/helpers.js').getDateRange(days);
      const report = await dataSyncService.getAdReport({ days });
      
      // 计算汇总数据
      const summary = {
        totalImpressions: report.reduce((sum, item) => sum + (item.impressions || 0), 0),
        totalClicks: report.reduce((sum, item) => sum + (item.clicks || 0), 0),
        totalSpend: report.reduce((sum, item) => sum + (item.spend || 0), 0),
        totalSales: report.reduce((sum, item) => sum + (item.sales || 0), 0),
        overallAcos: null,
        overallRoas: null
      };

      if (summary.totalSales > 0) {
        summary.overallAcos = (summary.totalSpend / summary.totalSales) * 100;
        summary.overallRoas = summary.totalSales / summary.totalSpend;
      }

      if (summary.totalClicks > 0) {
        summary.overallCtr = (summary.totalClicks / summary.totalImpressions * 100).toFixed(2);
        summary.overallCpc = (summary.totalSpend / summary.totalClicks).toFixed(2);
      }

      return {
        reportType,
        dateRange: { startDate, endDate },
        summary,
        details: report.map(item => ({
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          impressions: item.impressions,
          clicks: item.clicks,
          spend: item.spend,
          sales: item.sales,
          acos: calculateAcos(item.spend, item.sales),
          ctr: ((item.clicks / item.impressions) * 100).toFixed(2),
          cpc: (item.spend / item.clicks).toFixed(2)
        })),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('生成报表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 诊断特定广告活动
   */
  async diagnoseCampaign(params = {}) {
    const { campaignId, campaignName } = params;
    
    try {
      const report = await dataSyncService.getAdReport({ days: 7 });
      const campaign = report.find(item => 
        item.campaignId === campaignId || 
        item.campaignName?.toLowerCase().includes(campaignName?.toLowerCase())
      );

      if (!campaign) {
        return { error: '未找到指定的广告活动' };
      }

      const acos = calculateAcos(campaign.spend, campaign.sales);
      const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions * 100) : 0;
      const cvr = campaign.clicks > 0 ? (campaign.purchases / campaign.clicks * 100) : 0;

      const issues = [];
      const suggestions = [];

      // 诊断问题
      if (acos > 20) {
        issues.push({ type: 'acos_high', message: `ACOS 过高: ${acos.toFixed(1)}%` });
        suggestions.push('考虑降低出价或添加否定关键词过滤无效流量');
      }

      if (ctr < 0.5 && campaign.impressions > 1000) {
        issues.push({ type: 'ctr_low', message: `点击率偏低: ${ctr.toFixed(2)}%` });
        suggestions.push('检查关键词相关性，优化产品主图和标题');
      }

      if (campaign.impressions > 5000 && ctr > 0.5 && campaign.clicks > 50 && cvr < 2) {
        issues.push({ type: 'cvr_low', message: `转化率偏低: ${cvr.toFixed(2)}%` });
        suggestions.push('检查落地页优化，评估产品详情页内容');
      }

      return {
        campaign: {
          id: campaign.campaignId,
          name: campaign.campaignName,
          ...campaign
        },
        metrics: {
          acos: acos?.toFixed(2),
          ctr: ctr.toFixed(2),
          cvr: cvr.toFixed(2),
          roas: (campaign.sales / campaign.spend).toFixed(2)
        },
        issues,
        suggestions,
        diagnosis: issues.length === 0 ? '该广告活动表现正常' : `发现 ${issues.length} 个问题`
      };
    } catch (error) {
      logger.error('诊断广告活动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 筛选需要排除的关键词
   */
  async findNegativeKeywords(params = {}) {
    const { days = 14, minClicks = 10, maxCvrs = 0.5 } = params;
    
    try {
      const searchTerms = await dataSyncService.getSearchTermReport({ days });
      const negativeKeywords = [];

      for (const term of searchTerms) {
        // 没有转化的关键词
        if (term.purchases === 0 && term.clicks >= minClicks) {
          negativeKeywords.push({
            keyword: term.keyword,
            matchType: term.matchType,
            clicks: term.clicks,
            spend: term.spend,
            impressions: term.impressions,
            reason: '无转化',
            priority: term.clicks > minClicks * 5 ? 'high' : 'medium'
          });
        }
        
        // 低转化关键词
        if (term.clicks > 0) {
          const cvr = (term.purchases / term.clicks) * 100;
          if (cvr < maxCvrs && term.clicks >= minClicks) {
            negativeKeywords.push({
              keyword: term.keyword,
              matchType: term.matchType,
              clicks: term.clicks,
              spend: term.spend,
              impressions: term.impressions,
              cvr: cvr.toFixed(2),
              reason: '转化率过低',
              priority: cvr < 0.1 ? 'high' : 'low'
            });
          }
        }
      }

      return {
        negativeKeywords: negativeKeywords
          .sort((a, b) => {
            const priorityMap = { high: 3, medium: 2, low: 1 };
            return priorityMap[b.priority] - priorityMap[a.priority];
          })
          .slice(0, 50), // 限制返回数量
        totalSpend: negativeKeywords.reduce((sum, k) => sum + k.spend, 0),
        potentialSavings: negativeKeywords
          .filter(k => k.priority === 'high')
          .reduce((sum, k) => sum + k.spend, 0)
      };
    } catch (error) {
      logger.error('筛选否定关键词失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 处理一般性查询
   */
  async handleGeneralQuery(params = {}) {
    // 获取一些基本统计信息
    try {
      const report = await dataSyncService.getAdReport({ days: 7 });
      
      const summary = {
        totalCampaigns: report.length,
        totalImpressions: report.reduce((sum, item) => sum + (item.impressions || 0), 0),
        totalClicks: report.reduce((sum, item) => sum + (item.clicks || 0), 0),
        totalSpend: report.reduce((sum, item) => sum + (item.spend || 0), 0),
        totalSales: report.reduce((sum, item) => sum + (item.sales || 0), 0)
      };

      return { summary };
    } catch (error) {
      logger.error('处理一般查询失败', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * 生成最终回复
   */
  async generateResponse(userQuery, intent, contextData, options = {}) {
    const model = options.model || this.openrouterConfig.defaultModel;
    const { client, isOpenRouter } = this.getClient(model);
    
    try {
      const requestOptions = {
        model: model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: `用户查询: ${userQuery}\n\n数据上下文: ${JSON.stringify(contextData, null, 2)}` }
        ],
        max_tokens: config.ai.maxTokens || 2048,
        temperature: config.ai.temperature || 0.7
      };

      // OpenRouter 需要额外参数
      if (isOpenRouter) {
        requestOptions.extra_body = {
          'provider': { 'order': ['OpenRouter'] }
        };
      }

      const response = await client.chat.completions.create(requestOptions);
      return response.choices[0].message.content;
    } catch (error) {
      logger.error('生成回复失败', { error: error.message });
      return '抱歉，生成回复时出现错误。';
    }
  }

  /**
   * 生成 CSV 报表
   */
  async generateCSV(params = {}) {
    const { reportType = 'campaign', days = 7 } = params;
    
    const report = await this.generateReport({ reportType, days, format: 'json' });
    
    // 转换为 CSV 格式
    const headers = ['广告活动ID', '广告活动名称', '展示量', '点击量', '花费', '销售额', 'ACOS', 'CTR', 'CPC'];
    const rows = report.details.map(item => [
      item.campaignId,
      `"${item.campaignName}"`,
      item.impressions,
      item.clicks,
      item.spend.toFixed(2),
      item.sales.toFixed(2),
      item.acos?.toFixed(2) || '-',
      item.ctr,
      item.cpc
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

// 单例导出
export default new AICommandCenter();
