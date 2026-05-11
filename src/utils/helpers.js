/**
 * 工具函数库
 */

/**
 * 延迟执行
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 格式化日期
 */
export const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

/**
 * 计算日期范围
 */
export const getDateRange = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: formatDate(start, 'YYYY-MM-DD'),
    endDate: formatDate(end, 'YYYY-MM-DD')
  };
};

/**
 * 生成随机 ID
 */
export const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 安全的 JSON 解析
 */
export const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

/**
 * 计算 ACOS
 */
export const calculateAcos = (spend, sales) => {
  if (sales === 0) return null;
  return (spend / sales) * 100;
};

/**
 * 计算 ROAS
 */
export const calculateRoas = (sales, spend) => {
  if (spend === 0) return null;
  return sales / spend;
};

/**
 * 出价调整计算
 */
export const calculateBidAdjustment = (currentBid, targetAcos, currentAcos, maxAdjustment = 0.2) => {
  if (!currentAcos || currentAcos === 0) return currentBid;
  
  const acosRatio = targetAcos / currentAcos;
  
  // 如果 ACOS 偏高（花费太多），降低出价
  if (acosRatio < 1) {
    const adjustment = Math.min(1 - acosRatio, maxAdjustment);
    return currentBid * (1 - adjustment);
  }
  
  // 如果 ACOS 偏低（还有空间），可以适当提价
  if (acosRatio > 1.2) {
    const adjustment = Math.min(acosRatio - 1, maxAdjustment);
    return currentBid * (1 + adjustment);
  }
  
  return currentBid;
};

/**
 * 分页处理
 */
export const paginate = (data, page = 1, pageSize = 20) => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    data: data.slice(start, end),
    pagination: {
      page,
      pageSize,
      total: data.length,
      totalPages: Math.ceil(data.length / pageSize)
    }
  };
};

/**
 * 金额格式化
 */
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

/**
 * 百分比格式化
 */
export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
};

/**
 * 数组分组
 */
export const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
};

/**
 * 深拷贝
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};
