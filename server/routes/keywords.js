/**
 * 关键词管理路由
 * 提供关键词的创建、查询、收割和管理功能
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const adsService = require('../services/amazon-ads');
const keywordProtection = require('../services/keyword-protection');

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

// ============ 关键词查询 ============

// 获取关键词列表
router.get('/', async (req, res) => {
  try {
    const { campaignId, adGroupId, status, matchType, limit = 100 } = req.query;

    let sql = 'SELECT * FROM keywords WHERE 1=1';
    const params = [];

    if (campaignId) {
      sql += ' AND campaign_id = ?';
      params.push(campaignId);
    }
    if (adGroupId) {
      sql += ' AND ad_group_id = ?';
      params.push(adGroupId);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (matchType) {
      sql += ' AND match_type = ?';
      params.push(matchType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const keywords = db ? db.query(sql, params) : [];
    res.json({ success: true, data: keywords });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 搜索词报告 ============

// 获取搜索词报告（用于关键词收割）
router.get('/search-terms/report', async (req, res) => {
  try {
    const { campaignId, portfolioId, profileId, startDate, endDate, limit = 500 } = req.query;

    // 调用广告服务获取搜索词报告
    if (profileId) {
      const report = await adsService.getSearchTermReport(profileId, {
        campaignId,
        portfolioId,
        startDate,
        endDate,
        limit: parseInt(limit)
      });
      return res.json({ success: true, data: report });
    }

    // 返回 Mock 数据
    const mockReport = [
      { keyword: 'bluetooth earbuds', matchType: 'EXACT', impressions: 15420, clicks: 892, spend: 156.80, sales: 3240.50, orders: 42, acos: 4.84 },
      { keyword: 'wireless earbuds pro', matchType: 'PHRASE', impressions: 8930, clicks: 456, spend: 78.90, sales: 1890.20, orders: 28, acos: 4.17 },
      { keyword: 'earbuds case', matchType: 'BROAD', impressions: 22100, clicks: 678, spend: 45.60, sales: 890.30, orders: 15, acos: 5.12 },
      { keyword: 'headphone adapter', matchType: 'EXACT', impressions: 5600, clicks: 234, spend: 89.40, sales: 456.80, orders: 8, acos: 19.57 },
      { keyword: 'cheap earbuds bulk', matchType: 'BROAD', impressions: 12000, clicks: 345, spend: 123.50, sales: 234.60, orders: 5, acos: 52.64 },
      { keyword: 'bluetooth speaker', matchType: 'PHRASE', impressions: 4500, clicks: 189, spend: 67.80, sales: 1234.90, orders: 22, acos: 5.49 },
      { keyword: 'wireless charger', matchType: 'EXACT', impressions: 7800, clicks: 423, spend: 234.50, sales: 4567.80, orders: 67, acos: 5.13 },
      { keyword: 'usb c cable', matchType: 'BROAD', impressions: 15600, clicks: 567, spend: 89.30, sales: 345.60, orders: 9, acos: 25.84 },
      { keyword: 'gaming headset', matchType: 'EXACT', impressions: 8900, clicks: 678, spend: 345.60, sales: 5678.90, orders: 45, acos: 6.09 },
      { keyword: 'noise cancelling headphones', matchType: 'PHRASE', impressions: 12300, clicks: 890, spend: 456.70, sales: 6789.00, orders: 56, acos: 6.73 }
    ];

    res.json({ success: true, data: mockReport });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 关键词收割规则 ============

// 获取收割规则
router.get('/harvest/rules', (req, res) => {
  try {
    const rules = db.query('SELECT * FROM harvest_rules ORDER BY priority DESC');
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建/更新收割规则
router.post('/harvest/rules', (req, res) => {
  try {
    const { id, name, minOrders, maxAcos, minAcos, minImpressions, action, enabled, priority } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const existing = db.query('SELECT id FROM harvest_rules WHERE id = ?', [id]);

    if (existing.length > 0) {
      db.run(`
        UPDATE harvest_rules SET
          name = ?, min_orders = ?, max_acos = ?, min_acos = ?,
          min_impressions = ?, action = ?, enabled = ?, priority = ?
        WHERE id = ?
      `, [name, minOrders, maxAcos, minAcos, minImpressions, action, enabled !== false ? 1 : 0, priority || 0, id]);
    } else {
      db.run(`
        INSERT INTO harvest_rules (id, name, min_orders, max_acos, min_acos, min_impressions, action, enabled, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, name, minOrders || 5, maxAcos || 30, minAcos || 0, minImpressions || 1000, action || 'add', enabled !== false ? 1 : 0, priority || 0]);
    }

    res.json({ success: true, message: '规则保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除收割规则
router.delete('/harvest/rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM harvest_rules WHERE id = ?', [id]);
    res.json({ success: true, message: '规则已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 关键词收割执行 ============

// 执行关键词收割
router.post('/harvest/execute', async (req, res) => {
  try {
    const { profileId, campaignId, portfolioId, rules, dryRun = true } = req.body;

    // 获取搜索词报告
    let report;
    try {
      report = await adsService.getSearchTermReport(profileId, { campaignId, portfolioId });
    } catch (e) {
      // 使用 Mock 数据
      report = [
        { keyword: 'test earbuds', matchType: 'EXACT', impressions: 5000, clicks: 250, spend: 50, sales: 500, orders: 10, acos: 10 },
        { keyword: 'cheap earbuds', matchType: 'BROAD', impressions: 8000, clicks: 200, spend: 80, sales: 100, orders: 2, acos: 80 }
      ];
    }

    // 使用规则引擎分析
    const harvestRules = rules || [];
    const results = {
      toAdd: [],
      toNegate: [],
      skipped: 0
    };

    for (const item of report) {
      let matched = false;

      for (const rule of harvestRules) {
        if (rule.action === 'add' &&
            item.orders >= (rule.minOrders || 5) &&
            item.acos <= (rule.maxAcos || 30) &&
            item.impressions >= (rule.minImpressions || 1000)) {
          results.toAdd.push({
            keyword: item.keyword,
            matchType: item.matchType,
            bid: item.spend / item.clicks * 1.1, // 基于CPC上浮10%
            reason: `订单${item.orders}，ACOS${item.acos.toFixed(1)}%`
          });
          matched = true;
          break;
        } else if (rule.action === 'negate' &&
                   item.orders >= (rule.minOrders || 3) &&
                   item.acos > (rule.maxAcos || 50)) {
          results.toNegate.push({
            keyword: item.keyword,
            matchType: item.matchType,
            reason: `ACOS${item.acos.toFixed(1)}% 过高`
          });
          matched = true;
          break;
        }
      }

      if (!matched) results.skipped++;
    }

    // 如果不是 dryRun，实际执行
    if (!dryRun && profileId) {
      try {
        if (results.toAdd.length > 0) {
          await adsService.createKeywords(profileId, results.toAdd);
        }
        if (results.toNegate.length > 0) {
          await adsService.createNegativeKeywords(profileId, results.toNegate);
        }
      } catch (e) {
        console.error('执行收割失败:', e.message);
      }
    }

    res.json({
      success: true,
      dryRun,
      summary: {
        total: report.length,
        toAdd: results.toAdd.length,
        toNegate: results.toNegate.length,
        skipped: results.skipped
      },
      data: results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 关键词保护 ============

// 获取受保护的关键词列表
router.get('/protected/list', (req, res) => {
  try {
    const keywords = keywordProtection.getProtectedKeywords();
    res.json({ success: true, data: keywords });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加保护关键词
router.post('/protected/add', (req, res) => {
  try {
    const { keyword, reason, addedBy } = req.body;

    if (!keyword) {
      return res.status(400).json({ success: false, error: '关键词不能为空' });
    }

    keywordProtection.addProtectedKeyword(keyword, { reason, addedBy });

    // 记录操作日志
    addOperationLog(
      addedBy || '系统管理员',
      '添加关键词保护',
      keyword,
      reason || '手动添加关键词保护，防止竞价调整被错误优化',
      JSON.stringify({ keyword, reason, addedBy, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, message: '关键词已添加保护' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 移除保护关键词
router.post('/protected/remove', (req, res) => {
  try {
    const { keyword, reason, removedBy } = req.body;
    keywordProtection.removeProtectedKeyword(keyword);

    // 记录操作日志
    addOperationLog(
      removedBy || '系统管理员',
      '移除关键词保护',
      keyword,
      reason || '手动移除关键词保护，允许该关键词参与竞价优化',
      JSON.stringify({ keyword, reason, removedBy, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, message: '关键词保护已移除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 检查关键词是否受保护
router.get('/protected/check', (req, res) => {
  try {
    const { keyword } = req.query;
    const isProtected = keywordProtection.isProtected(keyword);
    res.json({ success: true, isProtected });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 标签管理（前端关键词管理页面使用） ============

// 获取所有标签
router.get('/tags', (req, res) => {
  try {
    const tags = db.query('SELECT * FROM keyword_tags ORDER BY created_at DESC');
    res.json({ success: true, data: tags });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取关键词列表（前端关键词管理页面使用）
router.get('/list', (req, res) => {
  try {
    const { store_id, tag_id, search } = req.query;

    let sql = 'SELECT * FROM keywords WHERE 1=1';
    const params = [];

    if (store_id) {
      sql += ' AND store_id = ?';
      params.push(store_id);
    }
    if (search) {
      sql += ' AND (keyword_text LIKE ? OR campaign_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    let keywords = db.query(sql, params);

    // 如果有 tag_id 过滤
    if (tag_id) {
      keywords = keywords.filter(kw => {
        if (kw.tags) {
          try {
            const tags = JSON.parse(kw.tags);
            return tags.some(t => t.id === tag_id);
          } catch (e) {}
        }
        return false;
      });
    }

    // 如果没有数据，返回 Mock 数据
    if (keywords.length === 0) {
      keywords = [
        { keyword_id: 'KW001', keyword_text: 'wireless bluetooth earbuds', bid: 0.85, acos: 12.5, clicks: 234, store_id: 'store_us', tags: [{ id: 'TAG001', name: '战略词', color: '#f59e0b' }], is_protected: true },
        { keyword_id: 'KW002', keyword_text: 'noise cancelling headphones', bid: 1.20, acos: 18.3, clicks: 156, store_id: 'store_us', tags: [{ id: 'TAG002', name: '利润词', color: '#10b981' }], is_protected: false },
        { keyword_id: 'KW003', keyword_text: 'gaming headset with mic', bid: 0.95, acos: 8.7, clicks: 89, store_id: 'store_us', tags: [{ id: 'TAG003', name: '成长词', color: '#3b82f6' }], is_protected: true },
        { keyword_id: 'KW004', keyword_text: 'cheap earbuds bulk', bid: 0.45, acos: 45.2, clicks: 321, store_id: 'store_us', tags: [{ id: 'TAG005', name: '待优化', color: '#ef4444' }], is_protected: false },
        { keyword_id: 'KW005', keyword_text: 'wireless charger fast', bid: 0.65, acos: 22.1, clicks: 178, store_id: 'store_uk', tags: [{ id: 'TAG004', name: '测试词', color: '#8b5cf6' }], is_protected: false }
      ];
    }

    res.json({ success: true, keywords });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加标签
router.post('/tag', (req, res) => {
  try {
    const { keyword_id, tag_id, tag_name, tag_color } = req.body;

    if (!keyword_id || !tag_id) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 确保标签存在
    const existingTags = db.query('SELECT * FROM keyword_tags WHERE id = ?', [tag_id]);
    if (existingTags.length === 0) {
      db.run('INSERT INTO keyword_tags (id, name, color) VALUES (?, ?, ?)', 
        [tag_id, tag_name || '新标签', tag_color || '#6b7280']);
    }

    // 更新关键词的标签
    const keyword = db.query('SELECT tags FROM keywords WHERE keyword_id = ?', [keyword_id]);
    let tags = [];
    if (keyword.length > 0 && keyword[0].tags) {
      try {
        tags = JSON.parse(keyword[0].tags);
      } catch (e) {}
    }

    const newTag = { id: tag_id, name: tag_name || '新标签', color: tag_color || '#6b7280' };
    const existingIndex = tags.findIndex(t => t.id === tag_id);
    if (existingIndex >= 0) {
      tags[existingIndex] = newTag;
    } else {
      tags.push(newTag);
    }

    db.run('UPDATE keywords SET tags = ? WHERE keyword_id = ?', [JSON.stringify(tags), keyword_id]);

    res.json({ success: true, message: '标签添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量添加标签
router.post('/tag/batch', (req, res) => {
  try {
    const { keyword_ids, tag_id, tag_name, tag_color, reason } = req.body;

    if (!keyword_ids || !Array.isArray(keyword_ids) || keyword_ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择关键词' });
    }

    // 确保标签存在
    const existingTags = db.query('SELECT * FROM keyword_tags WHERE id = ?', [tag_id]);
    if (existingTags.length === 0) {
      db.run('INSERT INTO keyword_tags (id, name, color) VALUES (?, ?, ?)',
        [tag_id, tag_name || '新标签', tag_color || '#6b7280']);
    }

    const newTag = { id: tag_id, name: tag_name || '新标签', color: tag_color || '#6b7280' };

    for (const keyword_id of keyword_ids) {
      const keyword = db.query('SELECT tags FROM keywords WHERE keyword_id = ?', [keyword_id]);
      let tags = [];
      if (keyword.length > 0 && keyword[0].tags) {
        try {
          tags = JSON.parse(keyword[0].tags);
        } catch (e) {}
      }

      const existingIndex = tags.findIndex(t => t.id === tag_id);
      if (existingIndex >= 0) {
        tags[existingIndex] = newTag;
      } else {
        tags.push(newTag);
      }

      db.run('UPDATE keywords SET tags = ? WHERE keyword_id = ?', [JSON.stringify(tags), keyword_id]);
    }

    // 记录操作日志
    addOperationLog(
      req.body.operator || '系统管理员',
      '批量添加标签',
      `${tag_name || '新标签'} (${keyword_ids.length}个关键词)`,
      reason || `批量为 ${keyword_ids.length} 个关键词添加分类标签，便于后续分析和优化`,
      JSON.stringify({ keyword_ids, tag_id, tag_name, count: keyword_ids.length, timestamp: new Date().toISOString() })
    );

    res.json({ success: true, message: `已为 ${keyword_ids.length} 个关键词添加标签` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 关键词保护
router.post('/protection', (req, res) => {
  try {
    const { keyword_id } = req.body;

    if (!keyword_id) {
      return res.status(400).json({ success: false, error: '缺少关键词ID' });
    }

    db.run('UPDATE keywords SET is_protected = 1 WHERE keyword_id = ?', [keyword_id]);

    res.json({ success: true, message: '关键词保护已开启' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 移除关键词保护
router.delete('/protection/:keyword_id', (req, res) => {
  try {
    const { keyword_id } = req.params;
    db.run('UPDATE keywords SET is_protected = 0 WHERE keyword_id = ?', [keyword_id]);
    res.json({ success: true, message: '关键词保护已移除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取关键词详情（必须放在所有具体路由之后，避免拦截 /tags /list 等）
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const keyword = db.query('SELECT * FROM keywords WHERE keyword_id = ?', [id]);

    if (keyword.length === 0) {
      return res.status(404).json({ success: false, error: '关键词不存在' });
    }

    res.json({ success: true, data: keyword[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
