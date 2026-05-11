/**
 * 亚马逊广告AI专家平台 - 后端服务
 * 支持领星ERP API 和 Amazon Ads API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入数据库
const db = require('./config/database');

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

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（如果需要）
app.use(express.static(path.join(__dirname, '../public')));

// 任务路由
const taskRoutes = require('./routes/tasks');
app.use('/api/tasks', taskRoutes);

// API路由
app.use('/api/config', configRoutes);
app.use('/api/lingxing', lingxingRoutes);
app.use('/api/amazon', amazonRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api', apiRoutes);

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
