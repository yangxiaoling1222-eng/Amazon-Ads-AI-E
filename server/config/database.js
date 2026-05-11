/**
 * 数据库配置和初始化
 * 使用 sql.js - 纯 JavaScript 实现的 SQLite，无需编译
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/ads_platform.db');

// 确保数据目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

/**
 * 初始化 SQL.js 数据库
 */
async function initDatabase() {
  console.log('📦 初始化数据库连接...');
  
  const SQL = await initSqlJs();
  
  // 如果数据库文件存在，则加载它
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✅ 数据库加载成功');
  } else {
    db = new SQL.Database();
    console.log('✅ 新数据库创建成功');
  }

  // 创建表结构
  createTables();
  
  // 如果表为空，插入初始数据
  insertInitialData();
  
  // 保存到磁盘
  saveDatabase();
  
  return db;
}

/**
 * 创建数据库表
 */
function createTables() {
  console.log('📦 创建数据库表...');
  
  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      stores TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 广告组合表
  db.run(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      store_id TEXT NOT NULL,
      store_name TEXT,
      owner_id TEXT,
      target_acos REAL DEFAULT 20,
      current_acos REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  // 预算规则表
  db.run(`
    CREATE TABLE IF NOT EXISTS budget_rules (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      rule_config TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    )
  `);

  // 操作日志表（扩展reason字段）
  db.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      target_name TEXT,
      details TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 添加缺失的列（如果表已存在）
  try {
    db.run("ALTER TABLE operation_logs ADD COLUMN reason TEXT");
  } catch (e) {}

  // API配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS api_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步记录表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      result TEXT,
      error_message TEXT
    )
  `);

  // 同步店铺表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT UNIQUE,
      store_name TEXT,
      marketplace TEXT,
      region TEXT,
      status TEXT,
      last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步产品表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT UNIQUE,
      sku TEXT,
      asin TEXT,
      name TEXT,
      img TEXT,
      status TEXT,
      store_id TEXT,
      last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步广告活动表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT UNIQUE,
      campaign_name TEXT,
      type TEXT,
      status TEXT,
      budget REAL,
      store_id TEXT,
      last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步报告表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      campaign_id TEXT,
      impressions INTEGER,
      clicks INTEGER,
      cost REAL,
      sales REAL,
      orders INTEGER,
      ctr REAL,
      cpc REAL,
      acos REAL,
      roas REAL,
      last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 同步日志表
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT,
      status TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 自动化目标表
  db.run(`
    CREATE TABLE IF NOT EXISTS automation_targets (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT,
      portfolio_name TEXT,
      store_id TEXT,
      store_name TEXT,
      owner_id TEXT,
      owner_name TEXT,
      target_acos REAL DEFAULT 20,
      tolerance REAL DEFAULT 5,
      daily_budget REAL,
      max_bid_change REAL DEFAULT 0.2,
      min_bid REAL DEFAULT 0.2,
      auto_actions TEXT,
      current_acos REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // AI任务表
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT DEFAULT 'ai_command',
      source_id TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      total_items INTEGER DEFAULT 0,
      completed_items INTEGER DEFAULT 0,
      store_id TEXT,
      store_name TEXT,
      creator_id TEXT,
      creator_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // 添加缺失的列（如果表已存在）
  try {
    db.run("ALTER TABLE ai_tasks ADD COLUMN store_id TEXT");
  } catch (e) {}
  try {
    db.run("ALTER TABLE ai_tasks ADD COLUMN store_name TEXT");
  } catch (e) {}

  // AI任务子项表
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_task_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      action_type TEXT,
      target_type TEXT,
      target_id TEXT,
      target_name TEXT,
      action_value TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      executor_id TEXT,
      executor_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES ai_tasks(id)
    )
  `);

  // AI对话历史表
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_query TEXT NOT NULL,
      ai_response TEXT,
      model TEXT,
      store_id TEXT,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 关键词标签表
  db.run(`
    CREATE TABLE IF NOT EXISTS keyword_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#667eea',
      type TEXT DEFAULT 'custom',
      priority INTEGER DEFAULT 0,
      description TEXT,
      store_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 关键词与标签关联表
  db.run(`
    CREATE TABLE IF NOT EXISTS keyword_tag_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id TEXT NOT NULL,
      keyword_text TEXT,
      campaign_id TEXT,
      tag_id TEXT NOT NULL,
      store_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 关键词管理表（支持标签和保护）
  db.run(`
    CREATE TABLE IF NOT EXISTS keywords (
      keyword_id TEXT PRIMARY KEY,
      keyword_text TEXT NOT NULL,
      campaign_id TEXT,
      campaign_name TEXT,
      ad_group_id TEXT,
      match_type TEXT DEFAULT 'EXACT',
      bid REAL DEFAULT 0.50,
      acos REAL DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      sales REAL DEFAULT 0,
      orders INTEGER DEFAULT 0,
      status TEXT DEFAULT 'enabled',
      store_id TEXT,
      tags TEXT,
      is_protected INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 关键词保护规则表
  db.run(`
    CREATE TABLE IF NOT EXISTS keyword_protection_rules (
      id TEXT PRIMARY KEY,
      tag_id TEXT NOT NULL,
      store_id TEXT,
      min_bid REAL DEFAULT 0.30,
      max_consecutive_decrease INTEGER DEFAULT 3,
      min_impression_daily INTEGER DEFAULT 100,
      evaluation_period_days INTEGER DEFAULT 28,
      acos_tolerance_pct REAL DEFAULT 1.5,
      protect_on_trend BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 关键词调价历史（用于追踪连续降价）
  db.run(`
    CREATE TABLE IF NOT EXISTS keyword_bid_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id TEXT NOT NULL,
      keyword_text TEXT,
      campaign_id TEXT,
      store_id TEXT,
      bid_before REAL,
      bid_after REAL,
      action TEXT,
      acos REAL,
      impressions INTEGER,
      clicks INTEGER,
      orders INTEGER,
      is_protected INTEGER DEFAULT 0,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('✅ 数据库表创建完成');
}

/**
 * 插入初始数据（如果表为空）
 */
function insertInitialData() {
  // 检查用户表是否为空
  const userCount = query('SELECT COUNT(*) as c FROM users');
  
  if (!userCount || userCount.length === 0 || userCount[0].c === 0) {
    console.log('📦 插入初始用户数据...');
    
    // 插入管理员用户
    run(`INSERT INTO users (id, name, email, password, role, status, stores) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['U001', '系统管理员', 'admin@example.com', '123456', 'admin', 'active', 'store_us,store_uk,store_de,store_jp']);
    run(`INSERT INTO users (id, name, email, password, role, status, stores) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['U002', '李华', 'lihua@example.com', '123456', 'manager', 'active', 'store_us,store_uk']);
    run(`INSERT INTO users (id, name, email, password, role, status, stores) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['U003', '王芳', 'wangfang@example.com', '123456', 'manager', 'active', 'store_de,store_jp']);
    run(`INSERT INTO users (id, name, email, password, role, status, stores) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['U004', '赵伟', 'zhaowei@example.com', '123456', 'user', 'active', 'store_us']);
    run(`INSERT INTO users (id, name, email, password, role, status, stores) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['U005', '钱敏', 'qianmin@example.com', '123456', 'user', 'inactive', 'store_uk']);
    
    console.log('✅ 用户数据插入完成');
  }
  
  // 检查广告组合表是否为空
  const portfolioCount = query('SELECT COUNT(*) as c FROM portfolios');
  
  if (!portfolioCount || portfolioCount.length === 0 || portfolioCount[0].c === 0) {
    console.log('📦 插入初始广告组合数据...');
    
    run(`INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['P001', '默认广告组合', 'store_us', '美国站', 'U002', 15, 12.3, 'active']);
    run(`INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['P002', '新品推广组合', 'store_us', '美国站', 'U002', 20, 18.5, 'active']);
    run(`INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['P003', '爆款产品组合', 'store_uk', '英国站', 'U003', 18, 16.2, 'active']);
    run(`INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['P004', '长尾产品组合', 'store_de', '德国站', null, 22, 19.8, 'active']);
    run(`INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['P005', '品牌推广组合', 'store_jp', '日本站', 'U003', 16, 14.2, 'active']);
    
    console.log('✅ 广告组合数据插入完成');
  }

  // 检查关键词标签表是否为空
  const tagCount = query('SELECT COUNT(*) as c FROM keyword_tags');
  if (!tagCount || tagCount.length === 0 || tagCount[0].c === 0) {
    console.log('📦 插入初始关键词标签...');
    run(`INSERT INTO keyword_tags (id, name, color, type, priority, description) VALUES (?, ?, ?, ?, ?, ?)`,
      ['TAG001', '🌟 战略词', '#ef4444', 'strategic', 100, '核心投放词，需重点保护，长周期评估']);
    run(`INSERT INTO keyword_tags (id, name, color, type, priority, description) VALUES (?, ?, ?, ?, ?, ?)`,
      ['TAG002', '💎 利润词', '#10b981', 'profitable', 80, '高ROAS关键词，稳定投放']);
    run(`INSERT INTO keyword_tags (id, name, color, type, priority, description) VALUES (?, ?, ?, ?, ?, ?)`,
      ['TAG003', '📈 成长词', '#f59e0b', 'growth', 60, '有潜力，需持续观察']);
    run(`INSERT INTO keyword_tags (id, name, color, type, priority, description) VALUES (?, ?, ?, ?, ?, ?)`,
      ['TAG004', '⚡ 测试词', '#6366f1', 'testing', 40, '新测试关键词，效果待验证']);
    run(`INSERT INTO keyword_tags (id, name, color, type, priority, description) VALUES (?, ?, ?, ?, ?, ?)`,
      ['TAG005', '🔴 待优化', '#64748b', 'optimize', 20, '效果较差，需要调整或否词']);

    // 战略词默认保护规则
    run(`INSERT INTO keyword_protection_rules (id, tag_id, min_bid, max_consecutive_decrease, min_impression_daily, evaluation_period_days, acos_tolerance_pct, protect_on_trend) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['RULE001', 'TAG001', 0.50, 2, 200, 28, 2.0, 1]);

    // 利润词保护规则
    run(`INSERT INTO keyword_protection_rules (id, tag_id, min_bid, max_consecutive_decrease, min_impression_daily, evaluation_period_days, acos_tolerance_pct, protect_on_trend) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['RULE002', 'TAG002', 0.30, 3, 150, 21, 1.5, 1]);

    console.log('✅ 关键词标签和默认保护规则插入完成');
  }
}

/**
 * 保存数据库到磁盘
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * 查询方法 - 返回所有行
 */
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * 执行方法 - 用于 INSERT/UPDATE/DELETE
 */
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { lastID: 0, changes: db.getRowsModified() };
}

/**
 * 获取单行
 */
function get(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

// 初始化数据库
let dbPromise = initDatabase();

// 导出同步包装器
module.exports = {
  query: (sql, params) => query(sql, params),
  run: (sql, params) => run(sql, params),
  get: (sql, params) => get(sql, params),
  getDb: () => db,
  saveDb: () => saveDatabase(),
  ready: () => dbPromise
};
