/**
 * AI任务管理API路由
 * 提供任务列表、子任务、对话历史等接口
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============ 任务列表接口 ============

// 获取所有任务
router.get('/', (req, res) => {
  try {
    const { status, storeId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT t.*, 
        (SELECT COUNT(*) FROM ai_task_items WHERE task_id = t.id) as total_items,
        (SELECT COUNT(*) FROM ai_task_items WHERE task_id = t.id AND status = 'completed') as completed_items
      FROM ai_tasks t
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    if (storeId) {
      sql += ' AND t.store_id = ?';
      params.push(storeId);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tasks = db.query(sql, params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as count FROM ai_tasks WHERE 1=1';
    const countParams = [];
    if (status && status !== 'all') {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (storeId) {
      countSql += ' AND store_id = ?';
      countParams.push(storeId);
    }
    const totalResult = db.query(countSql, countParams);
    const total = totalResult?.[0]?.count || 0;

    res.json({
      success: true,
      data: tasks,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取任务统计
router.get('/stats', (req, res) => {
  try {
    const stats = {
      pending: db.query("SELECT COUNT(*) as count FROM ai_tasks WHERE status = 'pending'")?.[0]?.count || 0,
      in_progress: db.query("SELECT COUNT(*) as count FROM ai_tasks WHERE status = 'in_progress'")?.[0]?.count || 0,
      completed: db.query("SELECT COUNT(*) as count FROM ai_tasks WHERE status = 'completed'")?.[0]?.count || 0,
      cancelled: db.query("SELECT COUNT(*) as count FROM ai_tasks WHERE status = 'cancelled'")?.[0]?.count || 0,
      total: db.query("SELECT COUNT(*) as count FROM ai_tasks")?.[0]?.count || 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 单个任务操作 ============

// 创建任务
router.post('/', (req, res) => {
  try {
    const {
      id, name, description, source, source_id,
      priority, storeId, storeName, creatorId, creatorName,
      items
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // 插入任务
    db.run(`
      INSERT INTO ai_tasks (id, name, description, source, source_id, priority, store_id, store_name, creator_id, creator_name, total_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      name,
      description || '',
      source || 'ai_command',
      source_id || '',
      priority || 'medium',
      storeId || '',
      storeName || '',
      creatorId || '',
      creatorName || '',
      items?.length || 0
    ]);

    // 插入子任务
    if (items && items.length > 0) {
      items.forEach(item => {
        db.run(`
          INSERT INTO ai_task_items (task_id, title, description, action_type, target_type, target_id, target_name, action_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          item.title || '',
          item.description || '',
          item.actionType || '',
          item.targetType || '',
          item.targetId || '',
          item.targetName || '',
          item.actionValue || ''
        ]);
      });
    }

    res.json({ success: true, message: '任务创建成功', data: { id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取任务详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const task = db.get('SELECT * FROM ai_tasks WHERE id = ?', [id]);

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const items = db.query('SELECT * FROM ai_task_items WHERE task_id = ? ORDER BY created_at ASC', [id]);

    res.json({
      success: true,
      data: {
        ...task,
        items
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新任务
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, priority, status } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'completed') {
        updates.push("completed_at = datetime('now')");
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.run(`UPDATE ai_tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    res.json({ success: true, message: '任务更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 取消任务
router.put('/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;

    // 更新任务状态
    db.run(`
      UPDATE ai_tasks 
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `, [id]);

    // 同时取消所有未完成的子任务
    db.run(`
      UPDATE ai_task_items 
      SET status = 'cancelled', completed_at = datetime('now')
      WHERE task_id = ? AND status = 'pending'
    `, [id]);

    res.json({ success: true, message: '任务已取消' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除任务
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 先删除子任务
    db.run('DELETE FROM ai_task_items WHERE task_id = ?', [id]);
    // 再删除任务
    db.run('DELETE FROM ai_tasks WHERE id = ?', [id]);

    res.json({ success: true, message: '任务删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 子任务操作 ============

// 更新子任务状态
router.put('/items/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    const { status, result, executorId, executorName } = req.body;

    const updates = [];
    const values = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);

      if (status === 'in_progress') {
        updates.push("started_at = datetime('now')");
      } else if (status === 'completed' || status === 'failed') {
        updates.push("completed_at = datetime('now')");
      }
    }

    if (result !== undefined) {
      updates.push('result = ?');
      values.push(result);
    }

    if (executorId !== undefined) {
      updates.push('executor_id = ?');
      values.push(executorId);
    }

    if (executorName !== undefined) {
      updates.push('executor_name = ?');
      values.push(executorName);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }

    values.push(itemId);

    db.run(`UPDATE ai_task_items SET ${updates.join(', ')} WHERE id = ?`, values);

    // 更新父任务的完成进度
    updateTaskProgress(itemId);

    res.json({ success: true, message: '子任务更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新任务进度
function updateTaskProgress(itemId) {
  try {
    const item = db.get('SELECT task_id FROM ai_task_items WHERE id = ?', [itemId]);
    if (!item) return;

    const stats = db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM ai_task_items WHERE task_id = ?
    `, [item.task_id]);

    if (stats && stats.length > 0) {
      const { total, completed } = stats[0];
      const taskStatus = completed >= total ? 'completed' : 'in_progress';
      const completedAt = completed >= total ? "datetime('now')" : 'NULL';

      db.run(`
        UPDATE ai_tasks 
        SET completed_items = ?, total_items = ?, status = ?, completed_at = ${completedAt}, updated_at = datetime('now')
        WHERE id = ?
      `, [completed, total, taskStatus, item.task_id]);
    }
  } catch (error) {
    console.error('更新任务进度失败:', error);
  }
}

// 添加子任务
router.post('/:id/items', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, actionType, targetType, targetId, targetName, actionValue } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: '缺少子任务标题' });
    }

    const result = db.run(`
      INSERT INTO ai_task_items (task_id, title, description, action_type, target_type, target_id, target_name, action_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, description || '', actionType || '', targetType || '', targetId || '', targetName || '', actionValue || '']);

    // 更新任务总数
    db.run(`
      UPDATE ai_tasks SET total_items = total_items + 1, updated_at = datetime('now') WHERE id = ?
    `, [id]);

    res.json({ success: true, message: '子任务添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ AI对话历史 ============

// 获取对话历史
router.get('/conversations/history', (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const conversations = db.query(`
      SELECT * FROM ai_conversations
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);

    const totalResult = db.query('SELECT COUNT(*) as count FROM ai_conversations');
    const total = totalResult?.[0]?.count || 0;

    res.json({
      success: true,
      data: conversations,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存对话
router.post('/conversations', (req, res) => {
  try {
    const { id, userQuery, aiResponse, model, storeId } = req.body;

    if (!id || !userQuery) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    db.run(`
      INSERT INTO ai_conversations (id, user_query, ai_response, model, store_id, status)
      VALUES (?, ?, ?, ?, ?, 'completed')
    `, [id, userQuery, aiResponse || '', model || '', storeId || '']);

    res.json({ success: true, message: '对话保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
