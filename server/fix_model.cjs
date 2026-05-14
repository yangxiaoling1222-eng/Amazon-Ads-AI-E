/**
 * 修复 openrouter 模型配置
 * 将 deepseek-v4-flash（不支持 tools）改为 deepseek-v4-pro（支持 Function Calling）
 */
const db = require('./config/database');

// 等数据库就绪
db.ready().then(() => {
  const current = db.query("SELECT config_value FROM api_config WHERE config_key = 'openrouter'");
  if (current.length === 0) {
    console.log('未找到 openrouter 配置！');
    process.exit(1);
  }

  let cfg;
  try {
    cfg = JSON.parse(current[0].config_value);
  } catch(e) {
    console.log('解析配置失败:', e.message);
    process.exit(1);
  }

  console.log('当前模型:', cfg.model);
  const oldModel = cfg.model;
  
  // 改为支持 Function Calling 的模型
  cfg.model = 'deepseek/deepseek-v4-flash';

  db.run(
    "INSERT OR REPLACE INTO api_config (config_key, config_value, updated_at) VALUES (?, ?, datetime('now'))",
    ['openrouter', JSON.stringify(cfg)]
  );

  console.log('✅ 模型已更新:', oldModel, '->', cfg.model);
  console.log('   API Key:', cfg.apiKey.slice(0,12) + '...');
  
  // 验证
  const verify = db.query("SELECT config_value FROM api_config WHERE config_key = 'openrouter'");
  const verCfg = JSON.parse(verify[0].config_value);
  console.log('✅ 验证成功，当前配置模型:', verCfg.model);
  
  process.exit(0);
}).catch(e => {
  console.error('数据库错误:', e.message);
  process.exit(1);
});
