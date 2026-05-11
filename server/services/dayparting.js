/**
 * Dayparting 分时出价服务
 *
 * 核心逻辑：
 *   - 将一天划分为多个时段（如 6 个 4 小时段）
 *   - 每个时段设置独立的出价乘数（multiplier）
 *   - 在低转化时段降低出价，在黄金时段顶格出价
 *   - 兼顾美西时间（Amazon 的报表时区）
 *
 * 时段定义（美西时间 PST/PDT）：
 *   凌晨 00:00-06:00  低峰 → multiplier 0.5
 *   上午 06:00-12:00  一般 → multiplier 0.8
 *   下午 12:00-18:00  正常 → multiplier 1.0
 *   晚间 18:00-21:00  黄金 → multiplier 1.3
 *   深夜 21:00-24:00  次黄金 → multiplier 1.0
 */

const adsService = require('./amazon-ads');

// ── 时段定义（美西时间）──────────────────────────────────────────

const DEFAULT_SLOTS = [
  { id: 'midnight',  label: '🌙 凌晨（0-6点）',  start: 0,  end: 6,  multiplier: 0.50, description: '美西深夜，转化率低，大幅降价' },
  { id: 'morning',   label: '🌤️ 上午（6-12点）', start: 6,  end: 12, multiplier: 0.80, description: '美西早上，竞争一般，适度降价' },
  { id: 'afternoon', label: '☀️ 下午（12-18点）', start: 12, end: 18, multiplier: 1.00, description: '美西下午，正常出价' },
  { id: 'prime',     label: '⭐ 黄金（18-21点）', start: 18, end: 21, multiplier: 1.30, description: '美西晚高峰，转化率最高，顶格出价' },
  { id: 'lateNight', label: '🌃 深夜（21-24点）', start: 21, end: 24, multiplier: 0.95, description: '美西晚间，略有回落' }
];

// in-memory 配置
let slots = JSON.parse(JSON.stringify(DEFAULT_SLOTS));
let daypartingEnabled = false;
let targetCampaignIds = []; // 空数组表示全部活动

// ── 工具函数 ───────────────────────────────────────────────────

/**
 * 将美西时间（UTC-8）转换为当前"时段"
 * Amazon 广告数据默认使用广告账户时区（通常是美西时间）
 */
function getCurrentSlot() {
  const now = new Date();
  // 粗略计算美西时间（实际应考虑夏令时，但这里简化处理）
  const utcHour = now.getUTCHours();
  const pstHour = (utcHour - 8 + 24) % 24; // PST

  for (const slot of slots) {
    if (pstHour >= slot.start && pstHour < slot.end) {
      return { ...slot, pstHour };
    }
  }
  return slots[2]; // 默认下午
}

/**
 * 获取当前时段标签
 */
function getCurrentSlotInfo() {
  const slot = getCurrentSlot();
  return {
    currentSlot: slot,
    pstTime: getPSTTime(),
    nextSlot: getNextSlot(slot)
  };
}

function getPSTTime() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const pstHour = (utcHour - 8 + 24) % 24;
  const pstMinute = now.getUTCMinutes();
  return `${String(pstHour).padStart(2, '0')}:${String(pstMinute).padStart(2, '0')} PST`;
}

function getNextSlot(current) {
  const idx = slots.findIndex(s => s.id === current.id);
  return slots[(idx + 1) % slots.length];
}

// ── 核心算法 ───────────────────────────────────────────────────

/**
 * 计算单个关键词在当前时段的目标出价
 * @param {number} baseBid  基础出价（当前出价）
 * @param {number} multiplier 乘数
 */
function calcAdjustedBid(baseBid, multiplier) {
  const newBid = baseBid * multiplier;
  return parseFloat(Math.max(0.02, Math.min(10, newBid)).toFixed(3)); // 限制范围 [$0.02, $10]
}

/**
 * 生成调价建议
 * @param {Array} keywords  [{ keywordId, bid, campaignId, campaignName, ... }]
 * @param {number} multiplier 乘数（默认当前时段）
 */
function generateBidAdjustments(keywords, multiplier) {
  if (!multiplier) {
    const slot = getCurrentSlot();
    multiplier = slot.multiplier;
  }

  const slot = slots.find(s => Math.abs(s.multiplier - multiplier) < 0.001) || getCurrentSlot();

  return keywords.map(kw => {
    const baseBid = Number(kw.bid) || 0.50;
    const newBid  = calcAdjustedBid(baseBid, multiplier);
    const change  = ((multiplier - 1) * 100).toFixed(0);

    return {
      keywordId:   kw.keywordId,
      campaignId:  kw.campaignId,
      adGroupId:   kw.adGroupId,
      campaignName: kw.campaignName,
      keywordText: kw.keywordText,
      matchType:   kw.matchType,
      currentBid:  baseBid,
      multiplier:  multiplier,
      adjustedBid: newBid,
      changePct:  parseFloat(change),
      action:      multiplier > 1 ? 'INCREASE' : multiplier < 1 ? 'DECREASE' : 'KEEP',
      reason:      change > 0 ? `分时出价：${slot.label} +${change}%` : change < 0 ? `分时出价：${slot.label} ${change}%` : '分时出价：维持'
    };
  });
}

/**
 * 执行分时调价（仅调整，不实际调用 API）
 * 返回调价建议，可由调用方决定是否执行
 */
async function prepareDaypartingAdjustment(profileId, options = {}) {
  const { campaignIds, dryRun = true } = options;

  // 获取关键词
  let keywords;
  try {
    const filters = {};
    if (campaignIds && campaignIds.length) filters.campaignIdFilter = campaignIds;
    keywords = await adsService.getKeywords(profileId, filters);
  } catch (e) {
    // Mock 数据
    keywords = _mockKeywords();
  }

  const slot = getCurrentSlot();
  const adjustments = generateBidAdjustments(keywords, slot.multiplier);

  // 按变幅分组统计
  const stats = {
    currentSlot: slot,
    pstTime: getPSTTime(),
    total: adjustments.length,
    increased: adjustments.filter(a => a.action === 'INCREASE').length,
    decreased: adjustments.filter(a => a.action === 'DECREASE').length,
    unchanged: adjustments.filter(a => a.action === 'KEEP').length
  };

  if (dryRun) {
    return { success: true, dryRun: true, ...stats, adjustments: adjustments.slice(0, 50) };
  }

  // 实际执行
  const toUpdate = adjustments.filter(a => a.action !== 'KEEP');
  if (toUpdate.length === 0) return { success: true, dryRun: false, message: '无需调整' };

  try {
    const payload = toUpdate.map(a => ({ keywordId: a.keywordId, bid: a.adjustedBid }));
    const result = await adsService.updateKeywords(profileId, payload);
    return { success: true, dryRun: false, updated: payload.length, result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Mock 数据（无真实 API 时）─────────────────────────────────

function _mockKeywords() {
  const bases = [
    { keywordId: 'mock-kw-1', campaignId: 'mock-c1', adGroupId: 'mock-ag1', bid: 0.50, campaignName: '新品推广-SP', keywordText: 'bluetooth earbuds', matchType: 'EXACT' },
    { keywordId: 'mock-kw-2', campaignId: 'mock-c1', adGroupId: 'mock-ag1', bid: 0.35, campaignName: '新品推广-SP', keywordText: 'wireless headphones', matchType: 'PHRASE' },
    { keywordId: 'mock-kw-3', campaignId: 'mock-c2', adGroupId: 'mock-ag2', bid: 1.20, campaignName: '爆款维护-SP', keywordText: 'earbuds case', matchType: 'EXACT' },
    { keywordId: 'mock-kw-4', campaignId: 'mock-c2', adGroupId: 'mock-ag2', bid: 0.80, campaignName: '爆款维护-SP', keywordText: 'headphone stand', matchType: 'BROAD' },
    { keywordId: 'mock-kw-5', campaignId: 'mock-c3', adGroupId: 'mock-ag3', bid: 2.50, campaignName: '利润款-SP', keywordText: 'gaming headset', matchType: 'EXACT' },
  ];
  return bases;
}

// ── 配置 API ───────────────────────────────────────────────────

function getSlots() { return JSON.parse(JSON.stringify(slots)); }

function updateSlots(newSlots) {
  slots = newSlots.map((s, i) => ({
    ...slots[i % slots.length],
    ...s
  }));
  return slots;
}

function setEnabled(enabled) {
  daypartingEnabled = enabled;
  return { enabled };
}

function getEnabled() { return daypartingEnabled; }

function setTargetCampaigns(ids) {
  targetCampaignIds = ids;
  return { targetCampaignIds };
}

function getTargetCampaigns() { return [...targetCampaignIds]; }

// ── 时段历史（记录每次执行）────────────────────────────────────

const executionLog = [];

function logExecution(slot, stats) {
  executionLog.unshift({
    timestamp: new Date().toISOString(),
    slot: slot.id,
    slotLabel: slot.label,
    pstTime: getPSTTime(),
    ...stats
  });
  if (executionLog.length > 100) executionLog.splice(100);
}

function getExecutionLog(limit = 30) {
  return executionLog.slice(0, limit);
}

module.exports = {
  getSlots, updateSlots, setEnabled, getEnabled,
  setTargetCampaigns, getTargetCampaigns,
  getCurrentSlot, getCurrentSlotInfo,
  generateBidAdjustments, prepareDaypartingAdjustment,
  calcAdjustedBid, logExecution, getExecutionLog
};
