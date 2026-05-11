/**
 * AI自动优化 API 路由
 */
import express from 'express';
import fullAutoPilot from '../automation/fullAutoPilot.js';
import dataSyncService from '../services/sync.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * 获取所有优化目标
 */
router.get('/targets', async (req, res) => {
  try {
    const { storeId, portfolioId, status } = req.query;
    
    let targets = fullAutoPilot.getAllTargets();
    
    // 店铺筛选
    if (storeId) {
      targets = targets.filter(t => t.storeId === storeId);
    }
    
    if (portfolioId) {
      targets = targets.filter(t => t.portfolioId === portfolioId);
    }
    
    if (status) {
      targets = targets.filter(t => t.status === status);
    }
    
    // 补充当前ACOS数据
    const targetsWithData = await Promise.all(
      targets.map(async (t) => {
        try {
          const report = await dataSyncService.getAdReport({ days: 7, storeId: t.storeId });
          const portfolioData = report.filter(c => c.portfolioId === t.portfolioId);
          
          const totalSpend = portfolioData.reduce((sum, c) => sum + (c.spend || 0), 0);
          const totalSales = portfolioData.reduce((sum, c) => sum + (c.sales || 0), 0);
          const currentAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : null;

          return {
            ...t,
            currentAcos,
            weeklySpend: totalSpend,
            weeklySales: totalSales
          };
        } catch {
          return { ...t, currentAcos: null };
        }
      })
    );

    res.json({ success: true, data: targetsWithData });
  } catch (error) {
    logger.error('获取优化目标失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取店铺列表
 */
router.get('/stores', async (req, res) => {
  try {
    const stores = config.stores.filter(s => s.enabled);
    res.json({
      success: true,
      data: stores
    });
  } catch (error) {
    logger.error('获取店铺列表失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个优化目标详情
 */
router.get('/targets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.query;
    
    const targetWithData = await fullAutoPilot.getTargetWithData(id, parseInt(days));
    res.json({ success: true, data: targetWithData });
  } catch (error) {
    logger.error('获取目标详情失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建优化目标
 */
router.post('/targets', async (req, res) => {
  try {
    const target = fullAutoPilot.createTarget(req.body);
    res.json({ success: true, data: target });
  } catch (error) {
    logger.error('创建优化目标失败', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 更新优化目标
 */
router.put('/targets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const target = fullAutoPilot.updateTarget(id, req.body);
    res.json({ success: true, data: target });
  } catch (error) {
    logger.error('更新优化目标失败', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 删除优化目标
 */
router.delete('/targets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    fullAutoPilot.deleteTarget(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('删除优化目标失败', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 手动触发优化执行
 */
router.post('/targets/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await fullAutoPilot.executeFullOptimization(id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('执行优化失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取执行历史
 */
router.get('/history', async (req, res) => {
  try {
    const { targetId, limit = 10 } = req.query;
    const history = fullAutoPilot.getHistory(targetId, parseInt(limit));
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('获取执行历史失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取广告组合列表
 */
router.get('/portfolios', async (req, res) => {
  try {
    const portfolios = await dataSyncService.getPortfolioData();
    res.json({ success: true, data: portfolios });
  } catch (error) {
    logger.error('获取广告组合失败', { error: error.message });
    // 返回模拟数据
    res.json({
      success: true,
      data: [
        { portfolioId: 'P001', name: '电子类产品组合', status: 'active' },
        { portfolioId: 'P002', name: '家居类产品组合', status: 'active' },
        { portfolioId: 'P003', name: '服装类产品组合', status: 'active' }
      ]
    });
  }
});

/**
 * 获取组合内广告活动详情
 */
router.get('/portfolios/:portfolioId/campaigns', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { days = 7 } = req.query;
    
    const report = await dataSyncService.getAdReport({ days: parseInt(days) });
    const campaigns = report.filter(c => c.portfolioId === portfolioId);
    
    res.json({ success: true, data: campaigns });
  } catch (error) {
    logger.error('获取广告活动失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 启动/停止调度器
 */
router.post('/scheduler', async (req, res) => {
  try {
    const { action } = req.body;
    
    if (action === 'start') {
      fullAutoPilot.startScheduler();
    } else if (action === 'stop') {
      fullAutoPilot.stopScheduler();
    } else {
      return res.status(400).json({ success: false, error: '无效的操作' });
    }
    
    res.json({ success: true, action });
  } catch (error) {
    logger.error('调度器操作失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取调度器状态
 */
router.get('/scheduler/status', async (req, res) => {
  try {
    const targets = fullAutoPilot.getAllTargets();
    res.json({
      success: true,
      data: {
        schedulerActive: targets.some(t => t.status === 'active'),
        totalTargets: targets.length,
        activeTargets: targets.filter(t => t.status === 'active').length
      }
    });
  } catch (error) {
    logger.error('获取调度状态失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量操作：暂停/启用目标
 */
router.post('/targets/batch', async (req, res) => {
  try {
    const { ids, action } = req.body;
    
    if (!ids || !action) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const results = [];
    for (const id of ids) {
      try {
        fullAutoPilot.updateTarget(id, { status: action === 'pause' ? 'paused' : 'active' });
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('批量操作失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
