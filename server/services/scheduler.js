/**
 * 任务调度器（内存版，无外部依赖）
 * 支持：
 *   - 按间隔执行（每 N 分钟/小时）
 *   - 按 Cron 表达式执行（简化版：只支持 HOURS/MINUTES）
 *   - 暂停/恢复/删除任务
 *   - 执行历史记录
 */

const tasks = new Map();
const history = [];
let nextId = 1;

/**
 * 注册一个调度任务
 * @param {object} opts
 * @param {string}   opts.id           任务 ID（唯一）
 * @param {string}   opts.name         任务名称（中文）
 * @param {Function} opts.handler       async 函数，执行任务逻辑
 * @param {string}   opts.type         'interval' | 'cron'
 * @param {number}   [opts.intervalMs]  间隔毫秒数（type=interval 时）
 * @param {string}   [opts.cronExpr]    简化 Cron：'0 3 * * *' 每天凌晨3点
 * @param {boolean}  [opts.enabled]    默认启用
 * @param {object}   [opts.metadata]    额外元数据
 */
function scheduleTask(opts) {
  const { id, name, handler, type, intervalMs, cronExpr, enabled = true, metadata = {} } = opts;
  if (!id || !handler) throw new Error('id 和 handler 是必需的');
  if (tasks.has(id)) throw new Error(`任务 ${id} 已存在`);

  const task = {
    id, name, handler, type, metadata,
    enabled,
    intervalMs,
    cronExpr,
    intervalRef: null,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    errorCount: 0,
    lastError: null,
    status: 'pending' // pending | running | idle | stopped | error
  };

  if (enabled) _startTask(task);
  tasks.set(id, task);
  return task;
}

function _startTask(task) {
  if (task.type === 'interval') {
    task.intervalRef = setInterval(async () => {
      await _runTask(task);
    }, task.intervalMs);
    task.nextRun = new Date(Date.now() + task.intervalMs);
  } else if (task.type === 'cron') {
    // 简化 Cron：每天某时刻执行
    // 格式支持: "0 H * * *" = 每天某小时:0分执行
    const parts = (task.cronExpr || '0 3 * * *').split(' ');
    const minute = parseInt(parts[0]) || 0;
    const hour = parseInt(parts[1]) || 3;
    task._cronMinute = minute;
    task._cronHour = hour;
    task.intervalRef = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === task._cronHour && now.getMinutes() === task._cronMinute) {
        await _runTask(task);
      }
    }, 60 * 1000); // 每分钟检查一次
    _calcNextCronRun(task);
  }
  task.status = 'idle';
}

async function _runTask(task) {
  if (task.status === 'running') return; // 防止重叠
  task.status = 'running';
  task.lastRun = new Date();
  task.runCount++;

  const logEntry = {
    taskId: task.id,
    taskName: task.name,
    startedAt: task.lastRun.toISOString(),
    success: false,
    durationMs: 0,
    result: null,
    error: null
  };

  const start = Date.now();
  try {
    const result = await task.handler();
    logEntry.success = true;
    logEntry.result = result;
    task.lastError = null;
    task.status = 'idle';
  } catch (e) {
    logEntry.error = e.message;
    task.lastError = e.message;
    task.errorCount++;
    task.status = 'error';
  }
  logEntry.durationMs = Date.now() - start;

  history.unshift(logEntry);
  if (history.length > 200) history.splice(200);

  if (task.type === 'cron') _calcNextCronRun(task);
  else task.nextRun = new Date(Date.now() + (task.intervalMs || 0));

  return logEntry;
}

function _calcNextCronRun(task) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(task._cronHour, task._cronMinute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  task.nextRun = target;
}

// ── 管理 API ─────────────────────────────────────────────────────

/** 暂停任务 */
function pauseTask(id) {
  const task = tasks.get(id);
  if (!task) return null;
  if (task.intervalRef) {
    clearInterval(task.intervalRef);
    task.intervalRef = null;
  }
  task.enabled = false;
  task.status = 'stopped';
  return task;
}

/** 恢复任务 */
function resumeTask(id) {
  const task = tasks.get(id);
  if (!task) return null;
  // 先清理旧定时器（防止 resume 两次）
  if (task.intervalRef) {
    clearInterval(task.intervalRef);
    task.intervalRef = null;
  }
  task.enabled = true;
  _startTask(task);
  return task;
}

/** 删除任务 */
function removeTask(id) {
  const task = tasks.get(id);
  if (!task) return false;
  pauseTask(id);
  tasks.delete(id);
  return true;
}

/** 手动触发任务（立即执行） */
async function triggerTask(id) {
  const task = tasks.get(id);
  if (!task) throw new Error(`任务 ${id} 不存在`);
  return await _runTask(task);
}

/** 获取所有任务状态 */
function getAllTasks() {
  return Array.from(tasks.values()).map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    enabled: t.enabled,
    status: t.status,
    intervalMs: t.intervalMs,
    cronExpr: t.cronExpr,
    nextRun: t.nextRun ? t.nextRun.toISOString() : null,
    lastRun: t.lastRun ? t.lastRun.toISOString() : null,
    runCount: t.runCount,
    errorCount: t.errorCount,
    lastError: t.lastError,
    metadata: t.metadata
  }));
}

/** 获取执行历史 */
function getHistory(limit = 50) {
  return history.slice(0, limit);
}

/** 停止所有任务（用于服务关闭） */
function stopAll() {
  for (const task of tasks.values()) {
    if (task.intervalRef) {
      clearInterval(task.intervalRef);
      task.intervalRef = null;
    }
  }
}

module.exports = {
  scheduleTask, pauseTask, resumeTask, removeTask,
  triggerTask, getAllTasks, getHistory, stopAll
};
