/**
 * 关键词保护服务
 * 防止核心关键词被错误地添加到否定词或被删除
 */

const db = require('../config/database');

// 受保护的关键词列表（内存缓存 + 数据库持久化）
let protectedKeywords = new Map();

// 默认保护规则
const DEFAULT_PROTECTED = [
  { keyword: '品牌名', reason: '品牌词保护', level: 'high' },
  { keyword: '核心产品词', reason: '核心流量词', level: 'high' },
  { keyword: '产品型号', reason: '型号词保护', level: 'medium' }
];

/**
 * 初始化加载数据库中的受保护关键词
 */
function init() {
  try {
    if (!db) return;

    const rows = db.query('SELECT * FROM protected_keywords WHERE status = 1');
    rows.forEach(row => {
      protectedKeywords.set(row.keyword.toLowerCase(), {
        keyword: row.keyword,
        reason: row.reason,
        level: row.level || 'medium',
        addedBy: row.added_by,
        addedAt: row.created_at
      });
    });

    console.log(`已加载 ${protectedKeywords.size} 个受保护关键词`);
  } catch (e) {
    console.log('初始化受保护关键词失败:', e.message);
  }
}

/**
 * 添加保护关键词
 * @param {string} keyword - 关键词
 * @param {object} opts - { reason, level, addedBy }
 */
function addProtectedKeyword(keyword, opts = {}) {
  const key = keyword.toLowerCase().trim();
  const { reason = '', level = 'medium', addedBy = 'system' } = opts;

  protectedKeywords.set(key, {
    keyword: keyword.trim(),
    reason,
    level,
    addedBy,
    addedAt: new Date().toISOString()
  });

  // 持久化到数据库
  try {
    if (db) {
      const existing = db.query('SELECT id FROM protected_keywords WHERE keyword = ?', [keyword]);
      if (existing.length === 0) {
        db.run(`
          INSERT INTO protected_keywords (keyword, reason, level, added_by, status)
          VALUES (?, ?, ?, ?, 1)
        `, [keyword, reason, level, addedBy]);
      } else {
        db.run('UPDATE protected_keywords SET status = 1, reason = ? WHERE keyword = ?', [reason, keyword]);
      }
    }
  } catch (e) {
    console.log('保存保护关键词失败:', e.message);
  }

  return true;
}

/**
 * 移除保护关键词
 * @param {string} keyword - 关键词
 */
function removeProtectedKeyword(keyword) {
  const key = keyword.toLowerCase().trim();
  protectedKeywords.delete(key);

  // 从数据库删除
  try {
    if (db) {
      db.run('UPDATE protected_keywords SET status = 0 WHERE keyword = ?', [keyword]);
    }
  } catch (e) {
    console.log('移除保护关键词失败:', e.message);
  }

  return true;
}

/**
 * 检查关键词是否受保护
 * @param {string} keyword - 关键词
 * @returns {boolean}
 */
function isProtected(keyword) {
  if (!keyword) return false;
  const key = keyword.toLowerCase().trim();
  return protectedKeywords.has(key);
}

/**
 * 获取受保护关键词详情
 * @param {string} keyword - 关键词
 * @returns {object|null}
 */
function getProtectionInfo(keyword) {
  if (!keyword) return null;
  const key = keyword.toLowerCase().trim();
  return protectedKeywords.get(key) || null;
}

/**
 * 获取所有受保护关键词
 * @returns {Array}
 */
function getProtectedKeywords() {
  return Array.from(protectedKeywords.values());
}

/**
 * 批量检查关键词保护状态
 * @param {Array<string>} keywords - 关键词列表
 * @returns {Map<string, boolean>} - 关键词 -> 是否受保护
 */
function batchCheck(keywords) {
  const result = new Map();
  keywords.forEach(kw => {
    result.set(kw, isProtected(kw));
  });
  return result;
}

/**
 * 过滤掉受保护的关键词
 * @param {Array} keywords - [{ keyword: string, ... }, ...]
 * @returns {object} - { filtered: [], protected: [] }
 */
function filterProtected(keywords) {
  const filtered = [];
  const protectedList = [];

  keywords.forEach(item => {
    const keyword = typeof item === 'string' ? item : item.keyword;
    if (isProtected(keyword)) {
      protectedList.push({
        keyword,
        info: getProtectionInfo(keyword)
      });
    } else {
      filtered.push(item);
    }
  });

  return { filtered, protected: protectedList };
}

/**
 * 获取保护统计
 */
function getStats() {
  const list = getProtectedKeywords();
  const byLevel = { high: 0, medium: 0, low: 0 };

  list.forEach(item => {
    const level = item.level || 'medium';
    byLevel[level]++;
  });

  return {
    total: list.length,
    byLevel,
    lastUpdated: new Date().toISOString()
  };
}

// 初始化
init();

module.exports = {
  addProtectedKeyword,
  removeProtectedKeyword,
  isProtected,
  getProtectionInfo,
  getProtectedKeywords,
  batchCheck,
  filterProtected,
  getStats
};
