const BetterSQLite3 = require('better-sqlite3');
const db = new BetterSQLite3('c:/Users/93178/WorkBuddy/20260429095857/server/data/ads_platform.db', {readonly:true});
const rows = db.prepare("SELECT config_key, config_value FROM api_config WHERE config_key IN ('openrouter','aiProvider')").all();
rows.forEach(r => {
  console.log(r.config_key + ': ' + r.config_value.substring(0, 200));
});
db.close();
