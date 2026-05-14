/**
 * 配置管理路由
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const aiService = require('../services/ai');

// 获取所有配置
router.get('/', (req, res) => {
  try {
    const configs = db.query('SELECT * FROM api_config');
    const configObj = {};
    configs.forEach(c => {
      configObj[c.config_key] = c.config_value;
    });
    res.json({ success: true, data: configObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存配置
router.post('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: '缺少配置键名' });
    }

    // 使用 REPLACE INTO 替代 INSERT ON CONFLICT
    db.run(`
      INSERT OR REPLACE INTO api_config (config_key, config_value, updated_at)
      VALUES (?, ?, datetime('now'))
    `, [key, value]);
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量保存配置
router.post('/batch', (req, res) => {
  try {
    const { configs } = req.body;
    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ success: false, message: '配置格式错误' });
    }

    for (const item of configs) {
      db.run(`
        INSERT OR REPLACE INTO api_config (config_key, config_value, updated_at)
        VALUES (?, ?, datetime('now'))
      `, [item.key, item.value]);
    }
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API 连接状态检查（快速返回，不实际请求外部API）
router.get('/status', (req, res) => {
  try {
    const configs = db.query('SELECT config_key, config_value FROM api_config');
    const configMap = {};
    configs.forEach(c => { configMap[c.config_key] = c.config_value; });

    const lingxing = configMap.lingxing ? JSON.parse(configMap.lingxing) : {};
    const amazon   = configMap.amazon   ? JSON.parse(configMap.amazon)   : {};
    const openai   = configMap.openai   ? JSON.parse(configMap.openai)   : {};
    const openrouter  = configMap.openrouter  ? JSON.parse(configMap.openrouter)  : {};
    const siliconflow = configMap.siliconflow ? JSON.parse(configMap.siliconflow) : {};

    res.json({
      success: true,
      data: {
        lingxing:    { connected: !!(lingxing.apiKey), configured: !!(lingxing.apiKey) },
        amazon:      { connected: !!(amazon.clientId), configured: !!(amazon.clientId) },
        openai:      { connected: !!(openai.apiKey),   configured: !!(openai.apiKey) },
        openrouter:  { connected: !!(openrouter.apiKey),  configured: !!(openrouter.apiKey) },
        siliconflow: { connected: !!(siliconflow.apiKey), configured: !!(siliconflow.apiKey) },
      }
    });
  } catch (error) {
    res.json({ success: true, data: { lingxing: {}, amazon: {}, openai: {}, openrouter: {}, siliconflow: {} } });
  }
});

// 测试连接（实际发送请求验证模型可用性）
router.post('/test', async (req, res) => {
  const { type, config } = req.body;
  if (!type || !config) return res.json({ success: false, error: '缺少参数' });

  // AI 提供商：实际发送请求验证
  if (['openai', 'openrouter', 'siliconflow', 'custom'].includes(type)) {
    if (!config.apiKey) {
      return res.json({ success: false, error: '缺少 API Key' });
    }

    try {
      let result;
      switch (type) {
        case 'openai':
          result = await aiService.testOpenAI(config.apiKey, config.model || 'gpt-4o-mini');
          break;
        case 'openrouter':
          result = await aiService.testOpenRouter(
            config.apiKey,
            config.baseUrl || 'https://openrouter.ai/api/v1',
            config.model || 'openai/gpt-4o-mini'
          );
          break;
        case 'siliconflow':
          result = await aiService.testSiliconFlow(
            config.apiKey,
            config.model || 'Qwen/Qwen3-8B'
          );
          break;
        case 'custom':
          result = await aiService.testCustom(
            config.apiKey,
            config.baseUrl || 'https://api.openai.com/v1',
            config.model || 'gpt-4o-mini'
          );
          break;
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 非 AI 提供商：只做本地校验
  let ok = false;
  switch (type) {
    case 'lingxing':   ok = !!(config.apiKey && config.apiSecret); break;
    case 'amazon':     ok = !!(config.clientId && config.clientSecret && config.refreshToken); break;
    default:           ok = false;
  }
  if (ok) {
    res.json({ success: true, message: '配置格式校验通过' });
  } else {
    res.json({ success: false, error: '配置不完整，请检查必填字段' });
  }
});

module.exports = router;

