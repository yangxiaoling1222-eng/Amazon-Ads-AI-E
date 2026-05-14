const BetterSQLite3 = require('better-sqlite3');
const db = new BetterSQLite3('./data/ads_platform.db', { readonly: true });
const rows = db.prepare("SELECT config_key, config_value FROM api_config WHERE config_key IN ('aiProvider','siliconflow','openrouter')").all();
rows.forEach(r => console.log(r.config_key + ':', r.config_value));
db.close();
