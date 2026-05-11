/**
 * 配置管理路由
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

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

module.exports = router;
