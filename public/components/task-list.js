/**
 * AI任务列表组件
 * 提供任务列表、任务详情、历史记录等功能
 */

const API_BASE = '/api/tasks';

// ============ 任务列表模块 ============

class TaskListComponent {
  constructor() {
    this.tasks = [];
    this.currentTask = null;
    this.stats = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    };
  }

  // 加载任务统计
  async loadStats() {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      if (data.success) {
        this.stats = data.data;
        this.updateStatsBadge();
      }
    } catch (error) {
      console.error('加载任务统计失败:', error);
    }
  }

  // 更新任务数量徽章
  updateStatsBadge() {
    const pendingBadge = document.getElementById('taskPendingBadge');
    if (pendingBadge) {
      const pendingCount = this.stats.pending + this.stats.in_progress;
      pendingBadge.textContent = pendingCount > 0 ? pendingCount : '';
      pendingBadge.style.display = pendingCount > 0 ? 'flex' : 'none';
    }
  }

  // 加载任务列表
  async loadTasks(status = 'all', storeId = '') {
    try {
      let url = `${API_BASE}?status=${status}`;
      if (storeId) url += `&storeId=${storeId}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        this.tasks = data.data;
        return data;
      }
      return { success: false, data: [] };
    } catch (error) {
      console.error('加载任务列表失败:', error);
      return { success: false, data: [] };
    }
  }

  // 加载任务详情
  async loadTaskDetail(taskId) {
    try {
      const res = await fetch(`${API_BASE}/${taskId}`);
      const data = await res.json();
      if (data.success) {
        this.currentTask = data.data;
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('加载任务详情失败:', error);
      return null;
    }
  }

  // 创建任务
  async createTask(taskData) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('创建任务失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 取消任务
  async cancelTask(taskId) {
    try {
      const res = await fetch(`${API_BASE}/${taskId}/cancel`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        await this.loadStats();
      }
      return data;
    } catch (error) {
      console.error('取消任务失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 删除任务
  async deleteTask(taskId) {
    try {
      const res = await fetch(`${API_BASE}/${taskId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadStats();
      }
      return data;
    } catch (error) {
      console.error('删除任务失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 更新子任务状态
  async updateItemStatus(itemId, status, result, executorName) {
    result = result || '';
    executorName = executorName || '';
    try {
      const res = await fetch(`${API_BASE}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, result, executorName })
      });
      const data = await res.json();
      if (data.success) {
        await this.loadStats();
      }
      return data;
    } catch (error) {
      console.error('更新子任务状态失败:', error);
      return { success: false, message: error.message };
    }
  }

  // 生成唯一ID
  generateId() {
    return 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
  }
}

// ============ 任务列表渲染 ============

function renderTaskList(tasks, containerId, options) {
  options = options || {};
  const container = document.getElementById(containerId);
  if (!container) return;

  const showActions = options.showActions !== false;
  const onView = options.onView;
  const onCancel = options.onCancel;

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="task-empty">
        <div class="task-empty-icon">📋</div>
        <p>暂无任务</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tasks.map(task => `
    <div class="task-card ${task.status}" data-task-id="${task.id}">
      <div class="task-card-left">
        <div class="task-card-header">
          <div class="task-priority priority-${task.priority}"></div>
          <div class="task-info">
            <h4 class="task-name">${escapeHtml(task.name)}</h4>
            <p class="task-desc">${escapeHtml(task.description || '无描述')}</p>
          </div>
          ${getStatusBadge(task.status)}
        </div>
        <div class="task-card-meta">
          <span class="task-progress">
            <span class="progress-text">${task.completed_items || 0}/${task.total_items || 0}</span>
            <span class="progress-label">子任务</span>
          </span>
          <span class="task-time">${formatTime(task.created_at)}</span>
        </div>
        ${task.status !== 'completed' && task.status !== 'cancelled' ? `
          <div class="task-progress-bar">
            <div class="progress-fill" style="width: ${task.total_items > 0 ? ((task.completed_items / task.total_items) * 100) : 0}%"></div>
          </div>
        ` : ''}
      </div>
      <div class="task-card-actions">
        <button class="task-btn view-btn" onclick="${onView ? onView + "('" + task.id + "')" : "viewTaskDetail('" + task.id + "')"}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          查看详情
        </button>
        ${task.status === 'pending' || task.status === 'in_progress' ? `
          <button class="task-btn cancel-btn" onclick="${onCancel ? onCancel + "('" + task.id + "')" : "cancelTaskConfirm('" + task.id + "')"}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            取消任务
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderTaskDetail(task, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !task) return;

  container.innerHTML = `
    <div class="task-detail-header">
      <div class="detail-title">
        <h3>${escapeHtml(task.name)}</h3>
        ${getStatusBadge(task.status)}
      </div>
      <p class="detail-desc">${escapeHtml(task.description || '无描述')}</p>
      <div class="detail-meta">
        <span>创建时间: ${formatTime(task.created_at)}</span>
        <span>创建人: ${task.creator_name || '系统'}</span>
        ${task.completed_at ? '<span>完成时间: ' + formatTime(task.completed_at) + '</span>' : ''}
      </div>
    </div>
    <div class="task-items-section">
      <h4>子任务列表 (${task.items?.length || 0})</h4>
      ${renderTaskItems(task.items || [])}
    </div>
  `;
}

function renderTaskItems(items) {
  if (!items || items.length === 0) {
    return '<p class="no-items">暂无子任务</p>';
  }

  return `
    <div class="task-items-list">
      ${items.map(item => `
        <div class="task-item ${item.status}" data-item-id="${item.id}">
          <div class="item-checkbox">
            <input type="checkbox" id="item-${item.id}"
              ${item.status === 'completed' ? 'checked' : ''}
              ${item.status === 'cancelled' ? 'disabled' : ''}
              onchange="toggleItemStatus(${item.id}, this.checked)">
          </div>
          <div class="item-content">
            <div class="item-header">
              <span class="item-title">${escapeHtml(item.title)}</span>
              ${getStatusBadge(item.status, true)}
            </div>
            <p class="item-desc">${escapeHtml(item.description || '')}</p>
            ${item.target_name ? '<p class="item-target">目标: ' + escapeHtml(item.target_name) + '</p>' : ''}
            <div class="item-meta">
              ${item.started_at ? '<span>开始: ' + formatTime(item.started_at) + '</span>' : ''}
              ${item.completed_at ? '<span>完成: ' + formatTime(item.completed_at) + '</span>' : ''}
              ${item.result ? '<span class="item-result">结果: ' + escapeHtml(item.result) + '</span>' : ''}
            </div>
          </div>
          <div class="item-actions">
            ${item.status === 'pending' ? '<button class="item-btn start-btn" onclick="startItem(' + item.id + ')">开始</button>' : ''}
            ${item.status === 'in_progress' ? '<button class="item-btn complete-btn" onclick="completeItem(' + item.id + ')">完成</button><button class="item-btn fail-btn" onclick="failItem(' + item.id + ')">失败</button>' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============ 任务详情弹窗 ============

function openTaskDetailModal(taskId) {
  const modal = document.getElementById('taskDetailModal');
  const content = document.getElementById('taskDetailContent');

  if (!modal || !content) return;

  modal.classList.add('show');

  content.innerHTML = '<div class="loading">加载中...</div>';

  taskList.loadTaskDetail(taskId).then(task => {
    if (task) {
      renderTaskDetail(task, 'taskDetailContent');
    } else {
      content.innerHTML = '<p class="error">加载失败</p>';
    }
  });
}

function closeTaskDetailModal() {
  const modal = document.getElementById('taskDetailModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// ============ 任务操作函数 ============

async function toggleItemStatus(itemId, isCompleted) {
  const status = isCompleted ? 'completed' : 'pending';
  await taskList.updateItemStatus(itemId, status);

  if (taskList.currentTask) {
    const updated = await taskList.loadTaskDetail(taskList.currentTask.id);
    if (updated) {
      taskList.currentTask = updated;
      renderTaskDetail(updated, 'taskDetailContent');
    }
  }
}

async function startItem(itemId) {
  await taskList.updateItemStatus(itemId, 'in_progress', '', '当前用户');

  if (taskList.currentTask) {
    const updated = await taskList.loadTaskDetail(taskList.currentTask.id);
    if (updated) {
      taskList.currentTask = updated;
      renderTaskDetail(updated, 'taskDetailContent');
    }
  }
}

async function completeItem(itemId) {
  await taskList.updateItemStatus(itemId, 'completed', '人工确认完成', '当前用户');

  if (taskList.currentTask) {
    const updated = await taskList.loadTaskDetail(taskList.currentTask.id);
    if (updated) {
      taskList.currentTask = updated;
      renderTaskDetail(updated, 'taskDetailContent');
    }
  }
}

async function failItem(itemId) {
  await taskList.updateItemStatus(itemId, 'failed', '执行失败', '当前用户');

  if (taskList.currentTask) {
    const updated = await taskList.loadTaskDetail(taskList.currentTask.id);
    if (updated) {
      taskList.currentTask = updated;
      renderTaskDetail(updated, 'taskDetailContent');
    }
  }
}

async function cancelTaskConfirm(taskId) {
  if (confirm('确定要取消这个任务吗？')) {
    const result = await taskList.cancelTask(taskId);
    if (result.success) {
      showToast('任务已取消', 'success');
      if (typeof refreshTaskList === 'function') {
        refreshTaskList();
      }
    } else {
      showToast(result.message || '取消失败', 'error');
    }
  }
}

function viewTaskDetail(taskId) {
  openTaskDetailModal(taskId);
}

// ============ 辅助函数 ============

function getStatusBadge(status, isItem) {
  isItem = isItem || false;
  const badges = {
    pending: '<span class="status-badge pending">' + (isItem ? '待处理' : '待执行') + '</span>',
    in_progress: '<span class="status-badge in-progress">' + (isItem ? '进行中' : '执行中') + '</span>',
    completed: '<span class="status-badge completed">' + (isItem ? '已完成' : '已完成') + '</span>',
    cancelled: '<span class="status-badge cancelled">已取消</span>',
    failed: '<span class="status-badge failed">' + (isItem ? '失败' : '失败') + '</span>'
  };
  return badges[status] || badges.pending;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timeStr) {
  if (!timeStr) return '-';
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ============ 历史记录模块 ============

class ConversationHistory {
  constructor() {
    this.conversations = [];
  }

  async loadHistory(limit) {
    limit = limit || 20;
    try {
      const res = await fetch('/api/tasks/conversations/history?limit=' + limit);
      const data = await res.json();
      if (data.success) {
        this.conversations = data.data;
        return data.data;
      }
      return [];
    } catch (error) {
      console.error('加载历史记录失败:', error);
      return [];
    }
  }

  async saveConversation(conversation) {
    try {
      const id = 'C' + Date.now().toString(36).toUpperCase();
      const res = await fetch('/api/tasks/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, conversation, { id: id }))
      });
      return await res.json();
    } catch (error) {
      console.error('保存对话失败:', error);
      return { success: false };
    }
  }

  renderHistoryList(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (this.conversations.length === 0) {
      container.innerHTML = '<p class="no-history">暂无历史记录</p>';
      return;
    }

    const clickHandler = onSelect ? onSelect : 'loadConversation';
    container.innerHTML = this.conversations.map(conv => `
      <div class="history-item" onclick="${clickHandler}('${conv.id}')">
        <div class="history-query">${escapeHtml(conv.user_query.substring(0, 60))}${conv.user_query.length > 60 ? '...' : ''}</div>
        <div class="history-meta">
          <span class="history-model">${conv.model || 'AI'}</span>
          <span class="history-time">${formatTime(conv.created_at)}</span>
        </div>
      </div>
    `).join('');
  }
}

async function loadConversation(convId) {
  const conv = conversationHistory.conversations.find(function(c) { return c.id === convId; });
  if (conv) {
    document.getElementById('messageInput').value = conv.user_query;
    showToast('已加载历史查询', 'info');
  }
}

// ============ 任务列表抽屉 ============

function openTaskDrawer() {
  const drawer = document.getElementById('taskDrawer');
  if (drawer) {
    drawer.classList.add('open');
    refreshTaskList();
  }
}

function closeTaskDrawer() {
  const drawer = document.getElementById('taskDrawer');
  if (drawer) {
    drawer.classList.remove('open');
  }
}

async function refreshTaskList() {
  const statusFilter = document.getElementById('taskStatusFilter');
  const status = statusFilter ? statusFilter.value : 'all';
  const result = await taskList.loadTasks(status);
  if (result.success) {
    renderTaskList(result.data, 'taskListContent', {
      onView: 'viewTaskDetail',
      onCancel: 'cancelTaskConfirm'
    });
  }
}

// ============ 添加任务弹窗 ============

function openAddTaskModal() {
  const modal = document.getElementById('addTaskModal');
  if (modal) {
    modal.classList.add('show');
  }
}

function closeAddTaskModal() {
  const modal = document.getElementById('addTaskModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

async function submitNewTask() {
  const nameInput = document.getElementById('taskNameInput');
  const descInput = document.getElementById('taskDescInput');
  const prioritySelect = document.getElementById('taskPrioritySelect');

  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const priority = prioritySelect ? prioritySelect.value : 'medium';

  if (!name) {
    showToast('请输入任务名称', 'error');
    return;
  }

  const taskData = {
    id: taskList.generateId(),
    name: name,
    description: description,
    priority: priority,
    source: 'ai_command',
    creatorName: '当前用户'
  };

  const result = await taskList.createTask(taskData);

  if (result.success) {
    showToast('任务创建成功，正在调用AI分析...', 'success');

    // 清空表单
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';

    // 调用AI分析生成子任务
    try {
      showToast('AI正在分析任务，请稍候...', 'info');
      const analyzeRes = await fetch('/api/ai/analyze-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: taskData.id,
          taskName: name,
          taskDescription: description
        })
      });
      const analyzeData = await analyzeRes.json();

      if (analyzeData.success) {
        showToast(analyzeData.message, 'success');
        // 刷新任务列表显示子任务
        refreshTaskList();
        taskList.loadStats();
        // 显示任务详情
        viewTaskDetail(taskData.id);
      } else {
        showToast(analyzeData.error || 'AI分析失败，但任务已创建', 'warning');
      }
    } catch (e) {
      showToast('AI分析请求失败，但任务已创建', 'warning');
      refreshTaskList();
      taskList.loadStats();
    }
  } else {
    showToast(result.message || '创建失败', 'error');
  }
}

// ============ Toast 提示 ============

function showToast(message, type) {
  type = type || 'info';
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

// ============ 导出 ============

const taskList = new TaskListComponent();
const conversationHistory = new ConversationHistory();

window.taskList = taskList;
window.conversationHistory = conversationHistory;
window.openTaskDetailModal = openTaskDetailModal;
window.closeTaskDetailModal = closeTaskDetailModal;
window.cancelTaskConfirm = cancelTaskConfirm;
window.viewTaskDetail = viewTaskDetail;
window.toggleItemStatus = toggleItemStatus;
window.startItem = startItem;
window.completeItem = completeItem;
window.failItem = failItem;
window.openTaskDrawer = openTaskDrawer;
window.closeTaskDrawer = closeTaskDrawer;
window.refreshTaskList = refreshTaskList;
window.openAddTaskModal = openAddTaskModal;
window.closeAddTaskModal = closeAddTaskModal;
window.submitNewTask = submitNewTask;
window.loadConversation = loadConversation;
window.renderTaskList = renderTaskList;
window.renderTaskDetail = renderTaskDetail;
window.showToast = showToast;
window.loadStats = function() { taskList.loadStats(); };
