const Database = require('better-sqlite3');
const db = new Database('./data/ads_platform.db');
const rows = db.prepare("SELECT config_key, config_value FROM api_config WHERE config_key IN ('aiProvider','siliconflow','openrouter','openai','custom')").all();
rows.forEach(r => {
  console.log('--- ' + r.config_key + ' ---');
  try {
    const v = JSON.parse(r.config_value);
    console.log(JSON.stringify(v, null, 2));
  } catch(e) {
    console.log('  raw:', r.config_value.substring(0,200));
  }
});
db.close();
