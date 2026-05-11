/**
 * 亚马逊广告 AI 智能专家 - 主入口文件
 */
import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import logger from './utils/logger.js';
import apiRoutes from './api/routes.js';
import optimizerRoutes from './api/optimizerRoutes.js';
import autoPilot from './automation/autoPilot.js';
import fullAutoPilot from './automation/fullAutoPilot.js';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.body
  });
  next();
});

// API 路由
app.use('/api', apiRoutes);
app.use('/api/optimizer', optimizerRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 错误处理
app.use((err, req, res, next) => {
  logger.error('未处理的错误', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: '服务器内部错误'
  });
});

// 启动服务器
const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     亚马逊广告 AI 智能专家 - 服务已启动                      ║
║                                                            ║
║     端口: ${PORT}                                              ║
║     环境: ${config.server.nodeEnv}                              ║
║                                                            ║
║     API 文档: http://localhost:${PORT}/api                   ║
║     健康检查: http://localhost:${PORT}/health                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // 启动 AI 自动优化调度器
  fullAutoPilot.startScheduler();
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭...');
  autoPilot.stopScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭...');
  autoPilot.stopScheduler();
  process.exit(0);
});

export default app;
