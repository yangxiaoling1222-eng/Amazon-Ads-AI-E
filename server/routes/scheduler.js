/**
 * 任务调度器路由
 *
 * POST   /scheduler/tasks         注册任务
 * GET    /scheduler/tasks         列出所有任务
 * POST   /scheduler/tasks/:id/pause   暂停
 * POST   /scheduler/tasks/:id/resume  恢复
 * POST   /scheduler/tasks/:id/trigger 手动触发
 * DELETE /scheduler/tasks/:id     删除任务
 * GET    /scheduler/history       执行历史
 * GET    /scheduler/rules         调价规则（周期性调价）
 * PUT    /scheduler/rules        更新调价规则
 * POST   /scheduler/run-cycle    立即执行调价周期
 */

const express = require('express');
const router  = express.Router();
const scheduler = require('../services/scheduler');
const bidding  = require('../services/periodic-bidding');
const dayparting = require('../services/dayparting');
const db = require('../config/database');

function fail(res, err, code = 500) {
  return res.status(code).json({ success: false, message: err?.message || String(err) });
}

// ============ 统一日志记录函数 ============
function addOperationLog(operator, operationType, targetName, reason, details = '') {
  try {
    db.run(`
      INSERT INTO operation_logs (operator, operation_type, target_name, reason, details)
      VALUES (?, ?, ?, ?, ?)
    `, [operator, operationType, targetName || '', reason || '', details || '']);
  } catch (e) {
    console.error('日志记录失败:', e.message);
  }
}

// ── 任务管理 ───────────────────────────────────────────────────

/** GET /scheduler/tasks */
router.get('/tasks', (req, res) => {
  try {
    const tasks = scheduler.getAllTasks();
    res.json({ success: true, total: tasks.length, tasks });
  } catch (err) { fail(res, err); }
});

/** POST /scheduler/tasks  注册任务 */
router.post('/tasks', (req, res) => {
  try {
    const { id, name, type, intervalMs, cronExpr, enabled, handlerId, metadata = {}, operator = '系统管理员', reason } = req.body;
    if (!id || !name) return res.status(400).json({ success: false, message: 'id 和 name 必填' });

    // 内置 handlerId：periodic-bidding
    let handler;
    if (handlerId === 'periodic-bidding') {
      handler = async () => {
        const profileId = metadata.profileId || 'mock-profile';
        return await bidding.runBiddingCycle(profileId, { dryRun: true });
      };
    } else if (handlerId === 'inventory-link') {
      handler = async () => {
        const inv = require('../services/inventory');
        return { message: '库存联动检查完成' };
      };
    } else {
      return res.status(400).json({ success: false, message: '未知的 handlerId' });
    }

    const task = scheduler.scheduleTask({
      id, name, handler, type: type || 'interval',
      intervalMs: intervalMs || (60 * 60 * 1000), // 默认1小时
      cronExpr, enabled: enabled !== false,
      metadata
    });

    // 记录操作日志
    addOperationLog(
      operator,
      '创建调度任务',
      name,
      reason || `创建定时任务以自动化广告优化流程，执行间隔: ${Math.round((intervalMs || 3600000) / 60000)}分钟`,
      JSON.stringify({ taskId: id, type, intervalMs, handlerId, metadata })
    );

    res.json({ success: true, task: { id: task.id, name: task.name, enabled: task.enabled, type: task.type } });
  } catch (err) { fail(res, err); }
});

/** POST /scheduler/tasks/:id/pause */
router.post('/tasks/:id/pause', (req, res) => {
  try {
    const task = scheduler.pauseTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '暂停调度任务',
      task.name,
      req.body.reason || '手动暂停任务调度，避免在不希望的时间执行优化操作',
      JSON.stringify({ taskId: req.params.id, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, task: { id: task.id, status: task.status } });
  } catch (err) { fail(res, err); }
});

/** POST /scheduler/tasks/:id/resume */
router.post('/tasks/:id/resume', (req, res) => {
  try {
    const task = scheduler.resumeTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '恢复调度任务',
      task.name,
      req.body.reason || '重新启用定时任务，恢复自动化广告优化',
      JSON.stringify({ taskId: req.params.id, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, task: { id: task.id, status: task.status } });
  } catch (err) { fail(res, err); }
});

/** POST /scheduler/tasks/:id/trigger */
router.post('/tasks/:id/trigger', async (req, res) => {
  try {
    const result = await scheduler.triggerTask(req.params.id);

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '手动触发任务',
      req.params.id,
      req.body.reason || '手动执行一次调度任务，验证任务配置是否正确',
      JSON.stringify({ taskId: req.params.id, result: result?.message || '执行完成', timestamp: new Date().toISOString() })
    );

    res.json({ success: true, result });
  } catch (err) { fail(res, err); }
});

/** DELETE /scheduler/tasks/:id */
router.delete('/tasks/:id', (req, res) => {
  try {
    const task = scheduler.getAllTasks().find(t => t.id === req.params.id);
    const taskName = task?.name || req.params.id;

    const ok = scheduler.removeTask(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: '任务不存在' });

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '删除调度任务',
      taskName,
      req.body.reason || '删除不再需要的定时任务，清理系统配置',
      JSON.stringify({ taskId: req.params.id, timestamp: new Date().toISOString() })
    );

    res.json({ success: true });
  } catch (err) { fail(res, err); }
});

/** GET /scheduler/history */
router.get('/history', (req, res) => {
  try {
    const history = scheduler.getHistory(Number(req.query.limit) || 50);
    res.json({ success: true, total: history.length, history });
  } catch (err) { fail(res, err); }
});

// ── 周期调价 API ────────────────────────────────────────────────

/** GET /scheduler/rules */
router.get('/rules', (req, res) => {
  res.json({ success: true, rules: bidding.getRules() });
});

/** PUT /scheduler/rules */
router.put('/rules', (req, res) => {
  try {
    const rules = bidding.updateRules(req.body);

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '更新调价规则',
      '周期性调价规则',
      req.body.reason || '根据最新广告表现数据调整优化规则阈值',
      JSON.stringify({ rules, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, rules });
  } catch (err) { fail(res, err); }
});

/**
 * POST /scheduler/run-cycle
 * 立即执行一次调价周期（dryRun 或正式执行）
 */
router.post('/run-cycle', async (req, res) => {
  try {
    const { profileId, dryRun = true, rules = {}, campaignIds, operator = '系统管理员', reason } = req.body;
    if (!profileId) return res.status(400).json({ success: false, message: '需要 profileId' });

    const result = await bidding.runBiddingCycle(profileId, { dryRun, rules, campaignIds });

    // 记录操作日志
    addOperationLog(
      operator,
      dryRun ? '预览调价结果' : '执行调价周期',
      profileId,
      reason || (dryRun ? '手动触发调价预览，验证规则效果' : '执行周期性调价，根据ACOS规则自动优化关键词出价'),
      JSON.stringify({ profileId, dryRun, campaignIds, result: result?.summary || result?.message || '执行完成' })
    );

    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

/**
 * POST /scheduler/analyze-keywords
 * 仅分析关键词调价建议，不执行
 */
router.post('/analyze-keywords', async (req, res) => {
  try {
    const { keywords, rules = {} } = req.body;
    if (!Array.isArray(keywords)) {
      return res.status(400).json({ success: false, message: 'keywords 必须是数组' });
    }
    const suggestions = bidding.analyzeKeywords(keywords, rules);
    const summary = bidding.summarize(suggestions);
    res.json({ success: true, total: suggestions.length, summary, suggestions });
  } catch (err) { fail(res, err); }
});

// ── Dayparting 分时出价 API ────────────────────────────────────

/** GET /scheduler/dayparting/slots */
router.get('/dayparting/slots', (req, res) => {
  res.json({ success: true, slots: dayparting.getSlots(), enabled: dayparting.getEnabled() });
});

/** PUT /scheduler/dayparting/slots */
router.put('/dayparting/slots', (req, res) => {
  try {
    const { slots, enabled, operator = '系统管理员', reason } = req.body;
    if (Array.isArray(slots)) dayparting.updateSlots(slots);
    if (typeof enabled === 'boolean') dayparting.setEnabled(enabled);

    // 记录操作日志
    addOperationLog(
      operator,
      '更新分时出价配置',
      '分时出价规则',
      reason || '根据广告投放时段效果调整不同时段的出价系数，优化广告效率',
      JSON.stringify({ slots: dayparting.getSlots(), enabled, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, slots: dayparting.getSlots(), enabled: dayparting.getEnabled() });
  } catch (err) { fail(res, err); }
});

/** GET /scheduler/dayparting/status */
router.get('/dayparting/status', (req, res) => {
  const info = dayparting.getCurrentSlotInfo();
  res.json({
    success: true,
    enabled: dayparting.getEnabled(),
    ...info,
    executionLog: dayparting.getExecutionLog(10)
  });
});

/**
 * POST /scheduler/dayparting/apply
 * 立即执行分时调价
 * body: { profileId, campaignIds?, dryRun }
 */
router.post('/dayparting/apply', async (req, res) => {
  try {
    const { profileId, campaignIds, dryRun = true } = req.body;
    if (!profileId) return res.status(400).json({ success: false, message: '需要 profileId' });

    const result = await dayparting.prepareDaypartingAdjustment(profileId, { campaignIds, dryRun });

    if (!dryRun && result.success) {
      dayparting.logExecution(result.currentSlot, result);
    }

    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

module.exports = router;
