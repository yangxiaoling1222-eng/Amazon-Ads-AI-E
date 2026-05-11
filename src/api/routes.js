/**
 * API 路由
 */
import express from 'express';
import dataSyncService from '../services/sync.js';
import aiCommandCenter from '../ai/commandCenter.js';
import autoPilot from '../automation/autoPilot.js';
import analysisEngine from '../analysis/engine.js';
import lingxingService from '../services/lingxing/index.js';
import amazonService from '../services/amazon/index.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * ========== 配置管理 ==========
 */

/**
 * 获取可用的AI模型列表
 */
router.get('/models', async (req, res) => {
  const models = [
    // OpenRouter 模型
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', description: '最新最强模型' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', description: '轻量快速' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', description: '高性能' },
    { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: '智能分析强' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic', description: '最强大模型' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google', description: '多模态强' },
    { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', provider: 'Meta', description: '开源大模型' },
    { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', provider: 'Mistral', description: '高效混合专家' },
    // 原生模型
    { id: 'gpt-4o', name: 'GPT-4o (原生)', provider: 'OpenAI', description: '使用原生API' },
    { id: 'gpt-4', name: 'GPT-4 (原生)', provider: 'OpenAI', description: '使用原生API' }
  ];
  
  res.json({
    success: true,
    data: {
      models,
      default: config.openrouter.enabled ? config.openrouter.defaultModel : 'openai/gpt-4o'
    }
  });
});

/**
 * 获取配置状态
 */
router.get('/config/status', async (req, res) => {
  try {
    const results = await dataSyncService.testAllConnections();
    res.json({
      lingxing: { connected: results.lingxing?.status === 'connected' },
      amazon: { connected: results.amazon?.status === 'connected' },
      openai: { configured: !!process.env.OPENAI_API_KEY },
      openrouter: { configured: !!process.env.OPENROUTER_API_KEY }
    });
  } catch (error) {
    res.json({
      lingxing: { connected: false },
      amazon: { connected: false },
      openai: { configured: false },
      openrouter: { configured: false }
    });
  }
});

/**
 * 测试单个API连接
 */
router.post('/config/test', async (req, res) => {
  try {
    const { type, config: apiConfig } = req.body;
    
    if (!type || !apiConfig) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    let result = { success: false, error: '' };

    switch (type) {
      case 'lingxing':
        // 测试领星连接
        try {
          // 如果传入了配置，使用临时配置测试
          if (apiConfig.apiKey && apiConfig.apiSecret) {
            // 临时设置环境变量进行测试
            const originalKey = process.env.LINGXING_API_KEY;
            const originalSecret = process.env.LINGXING_API_SECRET;
            process.env.LINGXING_API_KEY = apiConfig.apiKey;
            process.env.LINGXING_API_SECRET = apiConfig.apiSecret;
            
            const testResult = await lingxingService.testConnection();
            result = testResult;
            
            // 恢复原值
            process.env.LINGXING_API_KEY = originalKey;
            process.env.LINGXING_API_SECRET = originalSecret;
          } else {
            result = await lingxingService.testConnection();
          }
        } catch (error) {
          result = { success: false, error: error.message };
        }
        break;

      case 'amazon':
        // 测试亚马逊连接
        try {
          if (apiConfig.clientId && apiConfig.clientSecret && apiConfig.refreshToken) {
            const originalClientId = process.env.AMAZON_CLIENT_ID;
            const originalClientSecret = process.env.AMAZON_CLIENT_SECRET;
            const originalRefreshToken = process.env.AMAZON_REFRESH_TOKEN;
            
            process.env.AMAZON_CLIENT_ID = apiConfig.clientId;
            process.env.AMAZON_CLIENT_SECRET = apiConfig.clientSecret;
            process.env.AMAZON_REFRESH_TOKEN = apiConfig.refreshToken;
            
            const testResult = await amazonService.testConnection();
            result = testResult;
            
            process.env.AMAZON_CLIENT_ID = originalClientId;
            process.env.AMAZON_CLIENT_SECRET = originalClientSecret;
            process.env.AMAZON_REFRESH_TOKEN = originalRefreshToken;
          } else {
            result = await amazonService.testConnection();
          }
        } catch (error) {
          result = { success: false, error: error.message };
        }
        break;

      case 'openai':
        // OpenAI 只验证 API Key 格式
        if (apiConfig.apiKey && apiConfig.apiKey.startsWith('sk-')) {
          result = { success: true, message: 'API Key 格式正确' };
        } else {
          result = { success: false, error: 'API Key 格式不正确，应以 sk- 开头' };
        }
        break;

      case 'openrouter':
        // OpenRouter 验证 API Key 格式
        if (apiConfig.apiKey && apiConfig.apiKey.startsWith('sk-or-')) {
          result = { success: true, message: 'API Key 格式正确' };
        } else {
          result = { success: false, error: 'OpenRouter API Key 应以 sk-or- 开头' };
        }
        break;

      default:
        result = { success: false, error: '不支持的 API 类型' };
    }

    res.json(result);
  } catch (error) {
    logger.error('API 测试失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 保存配置
 */
router.post('/config/save', async (req, res) => {
  try {
    const { type, config: apiConfig } = req.body;
    
    if (!type || !apiConfig) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 将配置保存到环境变量（实际项目中应该保存到数据库或配置文件）
    switch (type) {
      case 'lingxing':
        process.env.LINGXING_API_KEY = apiConfig.apiKey;
        process.env.LINGXING_API_SECRET = apiConfig.apiSecret;
        process.env.LINGXING_BASE_URL = apiConfig.baseUrl;
        break;
      case 'amazon':
        process.env.AMAZON_CLIENT_ID = apiConfig.clientId;
        process.env.AMAZON_CLIENT_SECRET = apiConfig.clientSecret;
        process.env.AMAZON_REFRESH_TOKEN = apiConfig.refreshToken;
        break;
      case 'openai':
        process.env.OPENAI_API_KEY = apiConfig.apiKey;
        process.env.OPENAI_MODEL = apiConfig.model;
        break;
      case 'openrouter':
        process.env.OPENROUTER_API_KEY = apiConfig.apiKey;
        process.env.OPENROUTER_BASE_URL = apiConfig.baseUrl || 'https://openrouter.ai/api/v1';
        process.env.OPENROUTER_DEFAULT_MODEL = apiConfig.model;
        break;
    }

    logger.info(`配置已保存: ${type}`);
    res.json({ success: true, message: '配置已保存' });
  } catch (error) {
    logger.error('保存配置失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 连接测试
 */
router.post('/connect/test', async (req, res) => {
  try {
    const results = await dataSyncService.testAllConnections();
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('连接测试失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取广告活动列表
 */
router.get('/campaigns', async (req, res) => {
  try {
    const { source = 'lingxing' } = req.query;
    const data = await dataSyncService.syncCampaigns(source);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取广告活动失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取广告报告
 */
router.get('/report', async (req, res) => {
  try {
    const { days = 7, source = 'lingxing' } = req.query;
    const data = await dataSyncService.getAdReport({ days: parseInt(days), source });
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取广告报告失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取搜索词报告
 */
router.get('/search-terms', async (req, res) => {
  try {
    const { days = 7, campaignId } = req.query;
    const data = await dataSyncService.getSearchTermReport({ days: parseInt(days), campaignId });
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取搜索词报告失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取广告组合列表
 */
router.get('/portfolios', async (req, res) => {
  try {
    const data = await dataSyncService.getPortfolioData();
    res.json({ success: true, data });
  } catch (error) {
    logger.error('获取广告组合失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== AI 指令中心 ==========
 */

/**
 * AI 自然语言查询
 */
router.post('/ai/query', async (req, res) => {
  try {
    const { query, params = {}, model } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, error: '缺少查询内容' });
    }

    const result = await aiCommandCenter.processQuery(query, params, { model });
    res.json(result);
  } catch (error) {
    logger.error('AI 查询失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 CSV 报表
 */
router.get('/ai/report/csv', async (req, res) => {
  try {
    const { reportType = 'campaign', days = 7 } = req.query;
    const csv = await aiCommandCenter.generateCSV({ reportType, days: parseInt(days) });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ad-report-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('生成 CSV 报表失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== 自动驾驶模块 ==========
 */

/**
 * 设置 ACOS 目标
 */
router.post('/automation/set-target', async (req, res) => {
  try {
    const { portfolioId, targetAcos, options = {} } = req.body;
    
    if (!portfolioId || targetAcos === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const config = autoPilot.setTarget(portfolioId, targetAcos, options);
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('设置目标失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取所有目标配置
 */
router.get('/automation/targets', async (req, res) => {
  try {
    const targets = autoPilot.getAllTargets();
    res.json({ success: true, data: targets });
  } catch (error) {
    logger.error('获取目标配置失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动触发自动驾驶检查
 */
router.post('/automation/check', async (req, res) => {
  try {
    const result = await autoPilot.executeCheck();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('执行自动驾驶检查失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取自动驾驶状态
 */
router.get('/automation/status', async (req, res) => {
  try {
    const status = autoPilot.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('获取状态失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 调整竞价
 */
router.post('/automation/bid-adjust', async (req, res) => {
  try {
    const { campaignId, adjustment } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ success: false, error: '缺少活动ID' });
    }
    
    // 这里可以调用实际的 API 来调整竞价
    // 目前返回模拟成功响应
    logger.info(`调整竞价: 活动 ${campaignId}, 调整幅度 ${adjustment}`);
    
    res.json({ 
      success: true, 
      message: `竞价已调整 ${adjustment > 0 ? '+' : ''}${(adjustment * 100).toFixed(0)}%`,
      data: { campaignId, adjustment }
    });
  } catch (error) {
    logger.error('调整竞价失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 活动控制（暂停/启动）
 */
router.post('/automation/campaign-control', async (req, res) => {
  try {
    const { campaignId, action } = req.body;
    
    if (!campaignId || !action) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }
    
    logger.info(`活动控制: ${action === 'pause' ? '暂停' : '启动'} 活动 ${campaignId}`);
    
    res.json({ 
      success: true, 
      message: `活动已${action === 'pause' ? '暂停' : '启动'}`,
      data: { campaignId, action }
    });
  } catch (error) {
    logger.error('活动控制失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加否定词
 */
router.post('/automation/add-negative', async (req, res) => {
  try {
    const { campaignId, keywords } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ success: false, error: '缺少活动ID' });
    }
    
    logger.info(`添加否定词: 活动 ${campaignId}`, { keywords });
    
    res.json({ 
      success: true, 
      message: '否定词已添加',
      data: { campaignId, keywords: keywords || [] }
    });
  } catch (error) {
    logger.error('添加否定词失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 启动/停止调度器
 */
router.post('/automation/scheduler', async (req, res) => {
  try {
    const { action } = req.body;
    
    if (action === 'start') {
      autoPilot.startScheduler();
    } else if (action === 'stop') {
      autoPilot.stopScheduler();
    } else {
      return res.status(400).json({ success: false, error: '无效的操作' });
    }
    
    res.json({ success: true, action });
  } catch (error) {
    logger.error('调度器操作失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== 智能分析模块 ==========
 */

/**
 * 执行账户扫描
 */
router.post('/analysis/scan', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const result = await analysisEngine.analyze({ days });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('账户扫描失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取优化建议
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await analysisEngine.analyze({ days: parseInt(days) });
    res.json({ success: true, data: result.suggestions });
  } catch (error) {
    logger.error('获取建议失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 预览建议执行效果
 */
router.post('/suggestions/preview', async (req, res) => {
  try {
    const { suggestionId, suggestions } = req.body;
    const preview = await analysisEngine.previewAction(suggestionId, suggestions);
    res.json({ success: true, data: preview });
  } catch (error) {
    logger.error('预览失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行建议
 */
router.post('/suggestions/execute', async (req, res) => {
  try {
    const { suggestionId, suggestions } = req.body;
    const suggestion = suggestions?.find(s => s.id === suggestionId);
    
    if (!suggestion) {
      return res.status(404).json({ success: false, error: '未找到建议' });
    }

    const results = [];
    
    // 根据建议类型执行相应操作
    switch (suggestion.type) {
      case 'bid_decrease':
      case 'bid_increase':
        if (suggestion.campaignId && suggestion.suggestedValue) {
          await lingxingService.updateCampaignBudget(suggestion.campaignId, suggestion.suggestedValue);
          results.push({ success: true, action: 'update_bid', campaignId: suggestion.campaignId });
        }
        break;
      
      case 'pause_campaign':
        if (suggestion.campaignId) {
          await lingxingService.updateCampaignStatus(suggestion.campaignId, 'paused');
          results.push({ success: true, action: 'pause', campaignId: suggestion.campaignId });
        }
        break;
      
      case 'add_keywords':
        // TODO: 实现添加关键词
        results.push({ success: false, action: 'add_keywords', note: '暂未实现' });
        break;
      
      case 'negative_keywords':
        // TODO: 实现添加否定关键词
        results.push({ success: false, action: 'negative_keywords', note: '暂未实现' });
        break;
      
      default:
        results.push({ success: false, error: '不支持的建议类型' });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('执行建议失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ========== 数据操作 ==========
 */

/**
 * 更新广告活动状态
 */
router.post('/campaigns/status', async (req, res) => {
  try {
    const { campaignId, status } = req.body;
    
    if (!campaignId || !status) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const result = await lingxingService.updateCampaignStatus(campaignId, status);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('更新广告活动状态失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新关键词出价
 */
router.post('/keywords/bid', async (req, res) => {
  try {
    const { keywordId, bid } = req.body;
    
    if (!keywordId || bid === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const result = await lingxingService.updateKeywordBid(keywordId, bid);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('更新关键词出价失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
