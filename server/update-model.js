const BetterSQLite3 = require('better-sqlite3');
const db = new BetterSQLite3('c:/Users/93178/WorkBuddy/20260429095857/server/data/ads_platform.db');

// 读取当前 openrouter 配置
const row = db.prepare("SELECT config_value FROM api_config WHERE config_key = 'openrouter'").get();
if (row) {
  const cfg = JSON.parse(row.config_value);
  console.log('当前模型:', cfg.model);
  // 改成 gpt-4o-mini
  cfg.model = 'openai/gpt-4o-mini';
  db.prepare("UPDATE api_config SET config_value = ? WHERE config_key = 'openrouter'")
    .run(JSON.stringify(cfg));
  console.log('已更新为:', cfg.model);
} else {
  console.log('未找到 openrouter 配置');
}
db.close();
