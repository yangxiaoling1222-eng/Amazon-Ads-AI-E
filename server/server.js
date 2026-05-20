/**
 * 亚马逊广告AI专家平台 - 后端服务
 * 支持领星ERP API 和 Amazon Ads API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

// 导入数据库
const db = require('./config/database');
const syncScheduler = require('./services/sync-scheduler');

// 导入路由
const apiRoutes = require('./routes/api');
const lingxingRoutes = require('./routes/lingxing');
const amazonRoutes = require('./routes/amazon');
const configRoutes = require('./routes/config');
const agentRoutes  = require('./routes/agent');
const schedulerRoutes = require('./routes/scheduler');
const keywordRoutes = require('./routes/keywords');

const app = express();
const PORT = process.env.PORT || 3000;

// 访问密码配置（默认空，即不启用）
const SYSTEM_PASSWORD = process.env.SYSTEM_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'workbuddy-secret-' + Date.now();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 简单的会话管理（持久化到 JSON 文件，避免重启丢失）
const fs = require('fs');
const sessionsPath = path.join(__dirname, 'data', 'sessions.json');

function loadSessions() {
  try {
    if (fs.existsSync(sessionsPath)) {
      const raw = fs.readFileSync(sessionsPath, 'utf8');
      const entries = JSON.parse(raw);
      const now = Date.now();
      // 过滤掉过期的
      return new Map(entries.filter(([, s]) => s.expiry > now));
    }
  } catch (e) {
    console.error('加载会话失败:', e.message);
  }
  return new Map();
}

function saveSessions() {
  try {
    const dir = path.dirname(sessionsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionsPath, JSON.stringify([...sessions.entries()], null, 2), 'utf8');
  } catch (e) {
    console.error('保存会话失败:', e.message);
  }
}

const sessions = loadSessions();

// 密码验证中间件
function authMiddleware(req, res, next) {
  // 如果没有设置密码，直接通过
  if (!SYSTEM_PASSWORD) {
    return next();
  }

  // 检查 session token
  const token = req.headers['x-session-token'];
  console.log('[authMiddleware]', req.method, req.path,
    '收到token:', token ? token.slice(0,8)+'...' : '无',
    'sessions中有:', sessions.has(token),
    'sessions总数:', sessions.size,
    '所有keys:', [...sessions.keys()].map(k=>k.slice(0,6)));
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    if (session.expiry > Date.now()) {
      return next();
    }
    sessions.delete(token);
    saveSessions();
  }

  // 返回未授权（加缓存禁止头，防止浏览器缓存401）
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.status(401).json({ error: '需要登录', message: '需要登录', needLogin: true });
}

// 登录接口
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (!SYSTEM_PASSWORD) {
    return res.json({ success: true, message: '未设置密码保护' });
  }
  
  if (password === SYSTEM_PASSWORD) {
    // 生成 session token
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      expiry: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天过期
      createdAt: Date.now()
    });
    saveSessions();

    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: '密码错误' });
  }
});

// 登出接口
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) {
    sessions.delete(token);
    saveSessions();
  }
  res.json({ success: true });
});

// 检查登录状态
app.get('/api/auth/status', (req, res) => {
  if (!SYSTEM_PASSWORD) {
    return res.json({ loggedIn: true, hasPassword: false });
  }
  
  const token = req.headers['x-session-token'];
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    if (session.expiry > Date.now()) {
      return res.json({ loggedIn: true, hasPassword: true });
    }
    sessions.delete(token);
    saveSessions();
  }

  res.json({ loggedIn: false, hasPassword: true });
});

// 根路径重定向到首页
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// 静态文件服务（带登录检查）
app.use(express.static(path.join(__dirname, '../public'), {
  index: false // 禁用默认index
}));

// HTML页面访问时检查登录状态
app.get('/:page.html', (req, res, next) => {
  // 登录页和静态资源不需要验证
  if (req.params.page === 'login' || req.params.page === 'service-worker') {
    return next();
  }
  
  // 如果没有设置密码，直接通过
  if (!SYSTEM_PASSWORD) {
    return next();
  }
  
  // 检查 session token
  const token = req.headers['x-session-token'] || 
                req.query.token ||
                req.headers.cookie?.split(';').find(c => c.trim().startsWith('session_token='))?.split('=')[1];
  
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    if (session.expiry > Date.now()) {
      return next();
    }
    sessions.delete(token);
    saveSessions();
  }

  // 未登录，跳转到登录页
  res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
});

// 任务路由
const taskRoutes = require('./routes/tasks');
app.use('/api/tasks', taskRoutes);

// AI 对话历史兼容路由（前端直接调用 /api/history）
app.get('/api/history', (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const conversations = db.query(`
      SELECT * FROM ai_conversations
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [Number(limit), Number(offset)]);

    const totalResult = db.query('SELECT COUNT(*) as count FROM ai_conversations');
    const total = totalResult?.[0]?.count || 0;

    res.json({ success: true, conversations, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取单条对话详情
app.get('/api/history/:id', (req, res) => {
  try {
    const conv = db.get('SELECT * FROM ai_conversations WHERE id = ?', [req.params.id]);
    if (!conv) return res.status(404).json({ success: false, message: '对话不存在' });
    res.json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API路由（添加密码验证）
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/lingxing', authMiddleware, lingxingRoutes);
app.use('/api/amazon', authMiddleware, amazonRoutes);
app.use('/api/agent', authMiddleware, agentRoutes);
app.use('/api/scheduler', authMiddleware, schedulerRoutes);
app.use('/api/keywords', authMiddleware, keywordRoutes);
app.use('/api', authMiddleware, apiRoutes);

// 调试：回显收到的请求头
app.get('/api/debug/headers', (req, res) => {
  res.json({
    headers: req.headers,
    token: req.headers['x-session-token'],
    sessionsSize: sessions.size,
    hasToken: sessions.has(req.headers['x-session-token'])
  });
});

// 健康检查
app.get('/health', (req, res) => {
  const dbReady = db.getDb() !== null;
  res.json({ 
    status: dbReady ? 'ok' : 'initializing', 
    timestamp: new Date().toISOString() 
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || '服务器内部错误' 
  });
});

// 启动服务器（等待数据库就绪）
async function startServer() {
  try {
    // 等待数据库初始化
    await db.ready();
    console.log('✅ 数据库就绪');

    // 初始化自动数据同步调度器
    syncScheduler.init();
    console.log('✅ 同步调度器初始化完成');
    
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║         亚马逊广告AI专家平台 - 后端服务                    ║
╠═══════════════════════════════════════════════════════════╣
║  服务地址: http://localhost:${PORT}                         
║  API文档:  http://localhost:${PORT}/api                   
║  健康检查: http://localhost:${PORT}/health                 
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ 服务启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
