/**
 * 通用API路由
 * 提供广告组合、用户、日志等数据接口
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const aiService = require('../services/ai');

// ============ 统一日志记录函数 ============
/**
 * 记录操作日志
 * @param {string} operator - 操作人
 * @param {string} operationType - 操作类型
 * @param {string} targetName - 操作对象名称
 * @param {string} reason - 操作理由/目的
 * @param {string} details - 详细信息（JSON字符串或文本）
 */
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

// ============ 广告组合接口 ============

// 获取所有广告组合
router.get('/portfolios', (req, res) => {
  try {
    // 确保数据库已初始化
    if (!db.getDb()) {
      return res.status(503).json({ success: false, message: '数据库正在初始化，请稍后重试' });
    }
    
    const portfolios = db.query(`
      SELECT p.*, u.name as owner_name 
      FROM portfolios p 
      LEFT JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: portfolios });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建广告组合
router.post('/portfolios', (req, res) => {
  try {
    const { id, name, store_id, store_name, owner_id, target_acos } = req.body;
    
    if (!id || !name || !store_id) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    db.run(`
      INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, name, store_id, store_name || '', owner_id, target_acos || 20]);
    
    res.json({ success: true, message: '广告组合创建成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新广告组合
router.put('/portfolios/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { owner_id, target_acos, status } = req.body;

    const updates = [];
    const values = [];

    if (owner_id !== undefined) {
      updates.push('owner_id = ?');
      values.push(owner_id);
    }
    if (target_acos !== undefined) {
      updates.push('target_acos = ?');
      values.push(target_acos);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.run(`UPDATE portfolios SET ${updates.join(', ')} WHERE id = ?`, values);
    
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量分配负责人
router.post('/portfolios/batch-assign', (req, res) => {
  try {
    const { ids, owner_id } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要分配的广告组合' });
    }
    if (!owner_id) {
      return res.status(400).json({ success: false, message: '请选择负责人' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.run(`
      UPDATE portfolios SET owner_id = ?, updated_at = datetime('now')
      WHERE id IN (${placeholders})
    `, [owner_id, ...ids]);
    
    res.json({ success: true, message: `成功分配 ${ids.length} 个广告组合` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 用户接口 ============

// 获取所有用户
router.get('/users', (req, res) => {
  try {
    const users = db.query('SELECT * FROM users ORDER BY created_at DESC');
    // 移除密码字段
    users.forEach(u => delete u.password);
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建用户
router.post('/users', (req, res) => {
  try {
    const { id, name, email, password, role, stores } = req.body;
    
    if (!id || !name || !email) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    db.run(`
      INSERT INTO users (id, name, email, password, role, stores)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, name, email, password || '', role || 'user', stores || '']);
    
    res.json({ success: true, message: '用户创建成功' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ success: false, message: '邮箱已存在' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新用户
router.put('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status, stores } = req.body;

    const updates = ["updated_at = datetime('now')"];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (stores !== undefined) {
      updates.push('stores = ?');
      values.push(stores);
    }

    values.push(id);

    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    
    res.json({ success: true, message: '用户更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除用户
router.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: '用户删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 操作日志接口 ============

// 获取操作日志
router.get('/logs', (req, res) => {
  try {
    const { limit = 50, page = 1, operation_type, operator } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    // 支持按操作类型筛选
    if (operation_type) {
      whereClause += ' WHERE operation_type = ?';
      params.push(operation_type);
    }

    // 支持按操作人筛选
    if (operator) {
      if (whereClause) {
        whereClause += ' AND operator = ?';
      } else {
        whereClause += ' WHERE operator = ?';
      }
      params.push(operator);
    }

    const logs = db.query(`
      SELECT * FROM operation_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    const totalResult = db.query(`SELECT COUNT(*) as count FROM operation_logs ${whereClause}`, params);
    const total = totalResult?.[0]?.count || 0;

    res.json({
      success: true,
      data: logs,
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

// 记录操作日志
router.post('/logs', (req, res) => {
  try {
    const { operator, operation_type, target_name, reason, details } = req.body;

    if (!operator || !operation_type) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    db.run(`
      INSERT INTO operation_logs (operator, operation_type, target_name, reason, details)
      VALUES (?, ?, ?, ?, ?)
    `, [operator, operation_type, target_name || '', reason || '', details || '']);

    res.json({ success: true, message: '日志记录成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取日志统计
router.get('/logs/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const stats = {
      todayCount: db.query(`SELECT COUNT(*) as count FROM operation_logs WHERE date(created_at) = ?`, [today])?.[0]?.count || 0,
      weekCount: db.query(`SELECT COUNT(*) as count FROM operation_logs WHERE created_at > datetime('now', '-7 days')`)?.[0]?.count || 0,
      monthCount: db.query(`SELECT COUNT(*) as count FROM operation_logs WHERE created_at > datetime('now', '-30 days')`)?.[0]?.count || 0,
      totalCount: db.query(`SELECT COUNT(*) as count FROM operation_logs`)?.[0]?.count || 0,
    };

    // 按操作类型分组统计
    const byType = db.query(`
      SELECT operation_type, COUNT(*) as count
      FROM operation_logs
      WHERE created_at > datetime('now', '-30 days')
      GROUP BY operation_type
      ORDER BY count DESC
    `);

    res.json({ success: true, data: { ...stats, byType } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 统计接口 ============

// 获取统计数据
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.query('SELECT COUNT(*) as count FROM users')?.[0]?.count || 0;
    const totalPortfolios = db.query('SELECT COUNT(*) as count FROM portfolios')?.[0]?.count || 0;
    const assignedPortfolios = db.query('SELECT COUNT(*) as count FROM portfolios WHERE owner_id IS NOT NULL')?.[0]?.count || 0;
    const recentLogs = db.query("SELECT COUNT(*) as count FROM operation_logs WHERE created_at > datetime('now', '-7 days')")?.[0]?.count || 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        totalPortfolios,
        assignedPortfolios,
        unassignedPortfolios: totalPortfolios - assignedPortfolios,
        recentLogs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 优化建议接口 ============

// 获取优化建议（Mock数据）
router.get('/suggestions', (req, res) => {
  try {
    const suggestions = [
      { id: 'S001', type: 'BID_DECREASE', priority: 'high', campaignId: 'C001', campaignName: 'Auto - Broad 电子产品', reason: 'ACOS 25.3% 超出目标 15%，建议降低出价 15%，预计可节省 $45/天' },
      { id: 'S002', type: 'PAUSE_CAMPAIGN', priority: 'high', campaignId: 'C002', campaignName: '手动 - 精准匹配 测试词A', reason: '花费 $156 无任何转化，建议立即暂停' },
      { id: 'S003', type: 'ADD_NEGATIVE', priority: 'medium', campaignId: 'C003', campaignName: 'Auto - Exact 配件类', reason: '发现 8 个高花费低转化关键词，建议添加为否定词' },
      { id: 'S004', type: 'BID_INCREASE', priority: 'low', campaignId: 'C004', campaignName: '手动 - 词组匹配 爆款产品', reason: 'ACOS 8.2% 远低于目标，有提价空间，建议提高出价 10%' },
      { id: 'S005', type: 'BID_DECREASE', priority: 'medium', campaignId: 'C005', campaignName: 'Auto - 热门产品', reason: 'ACOS 22.1% 略高于目标 20%，建议降低出价 5%' },
      { id: 'S006', type: 'BUDGET_INCREASE', priority: 'low', campaignId: 'C006', campaignName: '手动 - 精准 高利润产品', reason: 'ROAS 达到 5.2，有增加预算空间，建议增加 20%' }
    ];
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取自动驾驶状态
router.get('/automation/status', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        schedulerActive: false,
        totalTargets: 0,
        activeTargets: 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ 自动化目标 CRUD ============

// 获取所有自动化目标
router.get('/automation/targets', (req, res) => {
  try {
    const { storeId } = req.query;
    
    let sql = 'SELECT * FROM automation_targets ORDER BY created_at DESC';
    let params = [];
    
    if (storeId) {
      sql = 'SELECT * FROM automation_targets WHERE store_id = ? ORDER BY created_at DESC';
      params = [storeId];
    }
    
    const targets = db.query(sql, params);
    
    // 解析 auto_actions JSON
    targets.forEach(t => {
      if (t.auto_actions) {
        try {
          t.autoActions = JSON.parse(t.auto_actions);
        } catch (e) {
          t.autoActions = [];
        }
      } else {
        t.autoActions = [];
      }
    });
    
    res.json({ success: true, data: targets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建自动化目标
router.post('/automation/targets', (req, res) => {
  try {
    const { 
      id, portfolioId, portfolioName, storeId, storeName,
      ownerId, ownerName, targetAcos, tolerance, dailyBudget,
      maxBidChange, minBid, autoActions, status
    } = req.body;
    
    if (!id || !portfolioId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    db.run(`
      INSERT INTO automation_targets 
      (id, portfolio_id, portfolio_name, store_id, store_name, owner_id, owner_name,
       target_acos, tolerance, daily_budget, max_bid_change, min_bid, auto_actions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      portfolioId,
      portfolioName || '',
      storeId || '',
      storeName || '',
      ownerId || null,
      ownerName || '',
      targetAcos || 20,
      tolerance || 5,
      dailyBudget || null,
      maxBidChange || 0.2,
      minBid || 0.2,
      JSON.stringify(autoActions || []),
      status || 'active'
    ]);
    
    res.json({ success: true, message: '目标创建成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新自动化目标
router.put('/automation/targets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { 
      portfolioId, portfolioName, targetAcos, tolerance, dailyBudget,
      maxBidChange, minBid, autoActions, status
    } = req.body;
    
    const updates = [];
    const values = [];
    
    if (portfolioId !== undefined) { updates.push('portfolio_id = ?'); values.push(portfolioId); }
    if (portfolioName !== undefined) { updates.push('portfolio_name = ?'); values.push(portfolioName); }
    if (targetAcos !== undefined) { updates.push('target_acos = ?'); values.push(targetAcos); }
    if (tolerance !== undefined) { updates.push('tolerance = ?'); values.push(tolerance); }
    if (dailyBudget !== undefined) { updates.push('daily_budget = ?'); values.push(dailyBudget); }
    if (maxBidChange !== undefined) { updates.push('max_bid_change = ?'); values.push(maxBidChange); }
    if (minBid !== undefined) { updates.push('min_bid = ?'); values.push(minBid); }
    if (autoActions !== undefined) { updates.push('auto_actions = ?'); values.push(JSON.stringify(autoActions)); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }
    
    updates.push("updated_at = datetime('now')");
    values.push(id);
    
    db.run(`UPDATE automation_targets SET ${updates.join(', ')} WHERE id = ?`, values);
    
    res.json({ success: true, message: '目标更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新目标状态
router.put('/automation/targets/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: '缺少状态参数' });
    }
    
    db.run(`UPDATE automation_targets SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id]);
    
    res.json({ success: true, message: '状态更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除自动化目标
router.delete('/automation/targets/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM automation_targets WHERE id = ?', [id]);
    res.json({ success: true, message: '目标删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 调整竞价
router.post('/automation/bid-adjust', (req, res) => {
  try {
    const { campaignId, adjustment } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ success: false, message: '缺少活动ID' });
    }
    
    // 记录操作日志
    addOperationLog(
      '系统管理员',
      '调整竞价',
      campaignId,
      `根据ACOS目标优化策略调整竞价，目标: ${req.body.targetAcos || '未设置'}%`,
      JSON.stringify({ adjustment: adjustment, adjustmentPct: `${adjustment > 0 ? '+' : ''}${(adjustment * 100).toFixed(0)}%` })
    );
    
    res.json({ 
      success: true, 
      message: `竞价已调整 ${adjustment > 0 ? '+' : ''}${(adjustment * 100).toFixed(0)}%`,
      data: { campaignId, adjustment }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 活动控制（暂停/启动）
router.post('/automation/campaign-control', (req, res) => {
  try {
    const { campaignId, action } = req.body;
    
    if (!campaignId || !action) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 记录操作日志
    addOperationLog(
      '系统管理员',
      action === 'pause' ? '暂停活动' : '启动活动',
      campaignId,
      action === 'pause' ? '手动暂停活动，原因：效果不佳或测试需要' : '手动启动已暂停的活动',
      JSON.stringify({ action, timestamp: new Date().toISOString() })
    );
    
    res.json({ 
      success: true, 
      message: `活动已${action === 'pause' ? '暂停' : '启动'}`,
      data: { campaignId, action }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 添加否定词
router.post('/automation/add-negative', (req, res) => {
  try {
    const { campaignId, keywords } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ success: false, message: '缺少活动ID' });
    }
    
    // 记录操作日志
    addOperationLog(
      '系统管理员',
      '添加否定词',
      campaignId,
      `优化ACOS，移除低效流量。ACOS目标: ${req.body.targetAcos || '未设置'}%`,
      JSON.stringify({ keywords: keywords || [], addedAt: new Date().toISOString() })
    );
    
    res.json({ 
      success: true, 
      message: '否定词已添加',
      data: { campaignId, keywords: keywords || [] }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ API 测试接口 ============

// 测试 API 连接
router.post('/config/test', async (req, res) => {
  try {
    const { type, config } = req.body;

    if (!config || !config.apiKey) {
      return res.status(400).json({ success: false, error: '缺少 API Key' });
    }

    let result;
    switch (type) {
      case 'openai':
        result = await aiService.testOpenAI(config.apiKey, config.model || 'gpt-4o-mini');
        break;
      case 'openrouter':
        result = await aiService.testOpenRouter(
          config.apiKey,
          config.baseUrl || 'https://openrouter.ai/api/v1',
          config.model || 'openai/gpt-4o-mini'
        );
        break;
      default:
        return res.status(400).json({ success: false, error: '不支持的 API 类型' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 系统配置接口 ============

// GET /api/config  — 返回已保存的配置（不含密钥内容）
router.get('/config', (req, res) => {
  try {
    const rows = db.query('SELECT config_key, config_value FROM api_config');
    const data = {};
    rows.forEach(r => {
      try {
        const parsed = JSON.parse(r.config_value);
        // 隐藏敏感信息（不返回 apiKey, apiSecret, clientSecret, refreshToken 等）
        const safe = { ...parsed };
        if (safe.apiKey)      safe.apiKey = safe.apiKey ? '***' + safe.apiKey.slice(-4) : '';
        if (safe.apiSecret)    safe.apiSecret    = safe.apiSecret    ? '***' : '';
        if (safe.clientSecret) safe.clientSecret = safe.clientSecret ? '***' : '';
        if (safe.refreshToken) safe.refreshToken = safe.refreshToken ? '***' : '';
        data[r.config_key] = safe;
      } catch(e) {
        data[r.config_key] = r.config_value;
      }
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/config/status  — 返回各服务的连接状态
router.get('/config/status', async (req, res) => {
  try {
    const rows = db.query("SELECT config_key, config_value FROM api_config WHERE config_key IN ('openrouter','openai','lingxing','amazon')");
    const cfg = {};
    rows.forEach(r => {
      try { cfg[r.config_key] = JSON.parse(r.config_value); } catch(e) {}
    });

    const openrouter = cfg.openrouter;
    const openai     = cfg.openai;
    const lingxing  = cfg.lingxing;
    const amazon    = cfg.amazon;

    // OpenRouter: 检查 API Key 是否已配置（不实际调用，节省额度）
    const openrouterConfigured = !!(openrouter?.apiKey);

    // OpenAI: 检查 API Key 是否已配置
    const openaiConfigured = !!(openai?.apiKey);

    // Lingxing: 检查凭证是否已配置
    const lingxingConfigured = !!(lingxing?.apiKey && lingxing?.apiSecret);

    // Amazon: 检查凭证是否已配置
    const amazonConfigured = !!(amazon?.clientId && amazon?.clientSecret && amazon?.refreshToken);

    res.json({
      openrouter:  { configured: openrouterConfigured },
      openai:      { configured: openaiConfigured     },
      lingxing:    { configured: lingxingConfigured   },
      amazon:      { configured: amazonConfigured    }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ AI 对话接口 ============

// AI 分析任务生成子任务
router.post('/ai/analyze-task', async (req, res) => {
  try {
    const { taskId, taskName, taskDescription, storeId } = req.body;

    if (!taskName) {
      return res.status(400).json({ success: false, error: '缺少任务名称' });
    }

    console.log('\n========== AI 任务分析开始 ==========');
    console.log('任务ID:', taskId);
    console.log('任务名称:', taskName);
    console.log('任务描述:', taskDescription);

    // 构建分析提示词
    const analysisPrompt = `你是一个亚马逊广告优化专家。请根据以下任务信息，生成具体的执行子任务列表。

任务名称：${taskName}
任务描述：${taskDescription || '无'}

请生成3-8个具体的子任务，每个子任务包含：
1. 标题（简短的动词短语，如"调整CPC出价"）
2. 描述（具体操作说明）
3. 操作类型（adjust_bid调整出价, adjust_budget调整预算, add_negative添加否定词, pause暂停, resume恢复, optimize_keyword优化关键词, generate_report生成报告）

请以JSON数组格式返回，格式如下：
[
  {
    "title": "任务标题",
    "description": "具体操作描述",
    "actionType": "操作类型"
  }
]

只返回JSON数组，不要包含其他文字。`;

    // 从数据库获取 AI 配置
    const configs = db.query('SELECT config_key, config_value FROM api_config WHERE config_key IN (?, ?, ?, ?)',
      ['openai', 'openrouter', 'lingxing', 'amazon']);

    let aiConfig = {};
    configs.forEach(c => {
      try {
        aiConfig[c.config_key] = JSON.parse(c.config_value);
      } catch (e) {}
    });

    // 确定使用哪个 AI 配置
    let apiKey, baseUrl, selectedModel;

    if (aiConfig.openrouter && aiConfig.openrouter.apiKey) {
      apiKey = aiConfig.openrouter.apiKey;
      baseUrl = aiConfig.openrouter.baseUrl || 'https://openrouter.ai/api/v1';
      selectedModel = aiConfig.openrouter.model || 'openrouter/free';
    } else if (aiConfig.openai && aiConfig.openai.apiKey) {
      apiKey = aiConfig.openai.apiKey;
      baseUrl = 'https://api.openai.com/v1';
      selectedModel = aiConfig.openai.model || 'gpt-4o-mini';
    } else {
      apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      selectedModel = process.env.OPENROUTER_DEFAULT_MODEL || 'openrouter/free';
    }

    if (!apiKey) {
      return res.json({
        success: false,
        error: '未配置 AI API Key，请先在系统设置中配置'
      });
    }

    // 调用 AI（新签名：对象参数）
    const aiResult = await aiService.chat({
      apiKey,
      baseUrl,
      model: selectedModel,
      userMessage: analysisPrompt
    });

    if (!aiResult.success) {
      return res.json({ success: false, error: aiResult.error });
    }

    // 解析 AI 返回的 JSON
    let items = [];
    try {
      const response = aiResult.response.trim();
      // 尝试提取 JSON 数组
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log('解析 AI 返回失败:', e.message);
      return res.json({
        success: false,
        error: 'AI返回格式解析失败，请重试'
      });
    }

    // 保存子任务到数据库
    const taskItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      db.run(`
        INSERT INTO ai_task_items (task_id, title, description, action_type, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, [taskId, item.title, item.description, item.actionType || 'general']);
      taskItems.push({
        title: item.title,
        description: item.description,
        actionType: item.actionType || 'general',
        status: 'pending'
      });
    }

    // 更新任务的总子任务数
    db.run('UPDATE ai_tasks SET total_items = ? WHERE id = ?', [items.length, taskId]);

    console.log('AI 分析完成，生成了', items.length, '个子任务');

    res.json({
      success: true,
      items: taskItems,
      message: `AI分析完成，已生成${items.length}个子任务`
    });

  } catch (error) {
    console.log('AI 任务分析错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI 自然语言查询
router.post('/ai/query', async (req, res) => {
  try {
    const { query, storeId, model } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: '缺少查询内容' });
    }

    console.log('\n========== AI 查询开始 ==========');
    console.log('查询:', query);
    console.log('店铺:', storeId);
    console.log('模型:', model);

    // 从数据库获取 AI 配置
    const configs = db.query('SELECT config_key, config_value FROM api_config WHERE config_key IN (?, ?, ?, ?)', 
      ['openai', 'openrouter', 'lingxing', 'amazon']);
    
    let aiConfig = {};
    configs.forEach(c => {
      try {
        aiConfig[c.config_key] = JSON.parse(c.config_value);
      } catch (e) {}
    });

    // 确定使用哪个 AI 配置
    let apiKey, baseUrl, selectedModel;
    
    if (aiConfig.openrouter && aiConfig.openrouter.apiKey) {
      apiKey = aiConfig.openrouter.apiKey;
      baseUrl = aiConfig.openrouter.baseUrl || 'https://openrouter.ai/api/v1';
      selectedModel = model || aiConfig.openrouter.model || 'openrouter/free';
    } else if (aiConfig.openai && aiConfig.openai.apiKey) {
      apiKey = aiConfig.openai.apiKey;
      baseUrl = 'https://api.openai.com/v1';
      selectedModel = model || aiConfig.openai.model || 'gpt-4o-mini';
    } else {
      // 使用默认配置（如果有环境变量）
      apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      selectedModel = model || process.env.OPENROUTER_DEFAULT_MODEL || 'openrouter/free';
    }

    if (!apiKey) {
      return res.json({
        success: false,
        error: '未配置 AI API Key，请先在系统设置中配置'
      });
    }

    // 读取亚马逊广告知识库
    let systemPrompt = `你是一个专业的亚马逊广告运营专家助手，专门帮助用户分析广告数据、提供优化建议。请基于以下知识库回答用户问题：

重要：你还可以根据用户需求自动创建任务。如果用户请求：
- 分析广告表现
- 优化广告活动
- 生成报告
- 执行一系列操作
- 任何需要多个步骤完成的工作

你可以在回复末尾添加一行特殊标记来自动创建任务：
【创建任务:任务名称|任务描述】

例如：
"根据以上分析，我建议执行以下优化操作..."
【创建任务:优化低ACOS广告活动|降低出价、优化关键词】`;

    try {
      const fs = require('fs');
      const path = require('path');
      const knowledgePath = path.join(__dirname, '../knowledge/amazon-ppc-knowledge.md');
      if (fs.existsSync(knowledgePath)) {
        const knowledge = fs.readFileSync(knowledgePath, 'utf-8');
        systemPrompt += '\n\n' + knowledge;
      }
    } catch (e) {
      console.log('读取知识库失败:', e.message);
    }

    // 调用 AI（使用用户的实际查询，加上系统提示）
    console.log('准备调用 AI，模型:', selectedModel);
    const aiResult = await aiService.chat({
      apiKey,
      baseUrl,
      model: selectedModel,
      userMessage: query,
      systemPrompt
    });
    
    if (!aiResult.success) {
      console.log('AI 调用失败，错误信息:', aiResult.error);
      return res.json({ success: false, error: aiResult.error });
    }

    // 检查是否需要创建任务
    let taskId = null;
    let cleanResponse = aiResult.response;
    
    // 检测任务创建标记
    const taskMatch = aiResult.response.match(/【创建任务:([^|]+)\|([^\]】]+)】/);
    if (taskMatch) {
      const taskName = taskMatch[1].trim();
      const taskDescription = taskMatch[2].trim();
      
      console.log('检测到需要创建任务:', taskName);
      
      // 生成任务ID
      taskId = 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
      
      try {
        // 创建任务
        db.run(`
          INSERT INTO ai_tasks (id, name, description, priority, status, source, creator_name, total_items, completed_items, created_at)
          VALUES (?, ?, ?, 'medium', 'pending', 'ai_command', 'AI助手', 0, 0, datetime('now'))
        `, [taskId, taskName, taskDescription]);
        
        // 清理响应中的任务标记
        cleanResponse = aiResult.response.replace(/【创建任务:[^|]+\|[^\]】]+】/g, '').trim();
        
        console.log('任务创建成功，ID:', taskId);
      } catch (e) {
        console.log('创建任务失败:', e.message);
        taskId = null;
      }
    }

    // 记录操作日志
    addOperationLog(
      'AI助手',
      'AI查询',
      selectedModel,
      `用户发起AI查询，使用模型: ${selectedModel}`,
      JSON.stringify({ query: query.substring(0, 100), taskCreated: !!taskId })
    );

    const responseData = {
      success: true,
      response: cleanResponse
    };
    
    if (taskId) {
      responseData.taskId = taskId;
    }

    res.json(responseData);

  } catch (error) {
    console.log('AI 查询错误:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 认证接口 ============

// 用户登录
router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: '请输入邮箱和密码' });
    }
    
    // 从数据库查询用户
    const users = db.query('SELECT * FROM users WHERE email = ? AND status = ?', [email, 'active']);
    
    if (users.length === 0) {
      return res.status(401).json({ success: false, error: '用户不存在或已被禁用' });
    }
    
    const user = users[0];
    
    // 验证密码（这里使用明文对比，生产环境应该加密）
    if (user.password !== password) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }
    
    // 移除密码字段
    delete user.password;
    
    // 记录登录日志
    db.run(`INSERT INTO operation_logs (operator, operation_type, target_name, details) VALUES (?, ?, ?, ?)`,
      [user.name, '登录系统', user.email, '用户登录成功']);
    
    res.json({
      success: true,
      user: user,
      message: '登录成功'
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前用户信息
router.get('/auth/me', (req, res) => {
  try {
    // 从请求头获取用户ID（这里简化处理）
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    
    const userId = authHeader.replace('Bearer ', '');
    const users = db.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const user = users[0];
    delete user.password;
    
    res.json({
      success: true,
      user: user
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ OpenRouter 模型列表 ============

// GET /api/models
// 返回 ai-command.html 期望的格式：{ success, data: { models, default } }
// 参数：?apiKey=sk-or-v1-... （可选，不传则用存储的配置）
router.get('/models', async (req, res) => {
  const apiKey = req.query.apiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: '缺少 apiKey 参数，请在 URL 中传入 ?apiKey=xxx'
    });
  }

  try {
    const axios = require('axios');
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Amazon Ads AI Platform'
      },
      timeout: 15000
    });

    const rawModels = response.data.data || response.data;

    // 转换格式：{ models: [{ id, name, provider, context_length }], default: "xxx" }
    const models = (Array.isArray(rawModels) ? rawModels : []).map(m => ({
      id:             m.id,
      name:           m.name || m.id,
      provider:       (m.id.split('/')[0] || 'unknown'),
      context_length: m.context_length || 0,
      pricing:        m.pricing || {}
    }));

    // 默认选第一个（免费/低价模型优先）
    const freeModels = models.filter(m => m.pricing && parseFloat(m.pricing.prompt) === 0);
    const defaultModel = freeModels[0]?.id || models[0]?.id || '';

    res.json({
      success: true,
      data: { models, default: defaultModel }
    });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || '拉取模型列表失败';
    res.status(err.response?.status || 500).json({ success: false, error: msg });
  }
});

module.exports = router;
