/**
 * AI 服务
 * - 支持 OpenAI 兼容接口（OpenRouter / OpenAI / 自部署）
 * - 内置亚马逊广告分析专项能力
 * - 支持多轮会话历史
 */

const axios = require('axios');

// ─────────────────────────────────────────────────────────────────
// 系统提示词模板
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  default: `你是一个专业的亚马逊广告优化助手，帮助卖家分析广告数据、优化广告策略、提高投资回报率。
请使用中文回答，回答要简洁专业，优先给出可执行的建议。`,

  analyst: `你是一个亚马逊广告数据分析专家。你的职责是：
1. 解读 ACoS、ROAS、CTR、CVR、CPC 等核心指标
2. 识别广告活动中的异常和优化机会
3. 提供具体可执行的出价、关键词、预算调整建议
4. 用数据支撑每一个结论，避免模糊表述
请使用中文回答，格式清晰，重要数据用表格或列表呈现。`,

  keyword: `你是亚马逊关键词策略专家。你的职责是：
1. 分析关键词的搜索量、竞争度和相关性
2. 识别高价值、低竞争的长尾关键词
3. 区分品牌词、品类词、竞品词的不同打法
4. 建议合理的匹配类型（精准/词组/广泛）和出价策略
5. 分析搜索词报告，找出需要否定的词
请使用中文回答，给出具体关键词和出价建议。`,

  budget: `你是亚马逊广告预算优化专家。你的职责是：
1. 分析日预算利用率和投放时段分布
2. 识别预算不足导致的曝光损失
3. 建议跨活动的预算再分配方案
4. 结合 ROAS 目标给出预算调整幅度建议
请使用中文回答，预算建议要结合具体的数字和 ROI 测算。`
};

// ─────────────────────────────────────────────────────────────────
// 工具：构建标准广告分析提示词
// ─────────────────────────────────────────────────────────────────
function buildAdAnalysisPrompt(data) {
  const {
    campaigns = [],
    keywords  = [],
    targetAcos,
    dateRange,
    question
  } = data;

  let prompt = '';

  if (dateRange) {
    prompt += `**数据时间范围**: ${dateRange.start} 至 ${dateRange.end}\n\n`;
  }

  if (targetAcos) {
    prompt += `**目标 ACoS**: ${targetAcos}%\n\n`;
  }

  if (campaigns.length > 0) {
    prompt += '**广告活动汇总数据**:\n';
    prompt += '| 活动名称 | 花费($) | 销售额($) | ACoS(%) | ROAS | 点击 | 订单 |\n';
    prompt += '|---------|---------|----------|---------|------|-----|------|\n';
    campaigns.forEach(c => {
      const roas = c.spend > 0 ? (c.sales / c.spend).toFixed(2) : '-';
      prompt += `| ${c.name} | ${(c.spend || 0).toFixed(2)} | ${(c.sales || 0).toFixed(2)} | ${c.acos || '-'} | ${roas} | ${c.clicks || 0} | ${c.orders || 0} |\n`;
    });
    prompt += '\n';
  }

  if (keywords.length > 0) {
    const topKws = keywords
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, 15);

    prompt += `**关键词数据（按花费排序，Top ${topKws.length}）**:\n`;
    prompt += '| 关键词 | 匹配 | 出价($) | 花费($) | ACoS(%) | 点击 | 订单 |\n';
    prompt += '|-------|------|---------|---------|---------|------|------|\n';
    topKws.forEach(k => {
      prompt += `| ${k.keyword} | ${k.matchType || '-'} | ${(k.bid || 0).toFixed(2)} | ${(k.spend || 0).toFixed(2)} | ${k.acos || '-'} | ${k.clicks || 0} | ${k.orders || 0} |\n`;
    });
    prompt += '\n';
  }

  if (question) {
    prompt += `**问题**: ${question}`;
  }

  return prompt;
}

// ─────────────────────────────────────────────────────────────────
// Function Calling 系统提示（强调行动导向）
// ─────────────────────────────────────────────────────────────────
SYSTEM_PROMPTS.agent = `你是一个亚马逊广告 AI 操作助手，可以直接操控广告账户。你有以下能力：
- 查看广告活动、关键词数据
- 调整活动预算（按百分比或固定金额）
- 暂停/启用广告活动
- 批量调整关键词出价
- 添加否定关键词
- 一键执行关键词收割（从自动广告中提取高转化词 + 否定低效词）
- 根据目标 ACoS 智能调价

**重要规则**：
1. 收到操作指令时，优先调用工具执行，而非仅给建议
2. 涉及删除、暂停、大幅调价（>20%）的操作，先用 dryRun=true 预览，再询问用户确认
3. 执行完毕后，用简洁中文汇报结果
4. 如果指令模糊（如"帮我优化广告"），先询问具体目标（ACoS 目标、操作范围等）
5. 始终用中文回复`;

// ─────────────────────────────────────────────────────────────────
// 核心发送函数
// ─────────────────────────────────────────────────────────────────
async function sendChatRequest({ apiKey, baseUrl, model, messages, tools, toolChoice, maxTokens = 2000, timeout = 60000 }) {
  const url = `${baseUrl}/chat/completions`;

  try {
    const body = { model, messages, max_tokens: maxTokens };
    if (tools && tools.length)  body.tools       = tools;
    if (toolChoice)             body.tool_choice  = toolChoice;

    const res = await axios.post(url,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000'
        },
        timeout
      }
    );

    const choice  = res.data.choices?.[0];
    const message = choice?.message;
    const content = message?.content;

    // 如果 AI 返回了 tool_calls，透传给调用方
    if (message?.tool_calls?.length) {
      return { success: true, toolCalls: message.tool_calls, response: content };
    }

    return { success: true, response: content };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message || '请求失败';
    console.error('[AI Service Error]', errMsg);
    // 详细日志：输出完整响应体，方便排查 OpenRouter 错误
    if (err.response?.data) {
      console.error('[AI Service Error Detail]', JSON.stringify(err.response.data).slice(0, 2000));
    } else if (err.response) {
      console.error('[AI Service Error Status]', err.response.status, err.response.statusText);
    }
    return { success: false, error: errMsg, errorDetail: err.response?.data || null };
  }
}

// ─────────────────────────────────────────────────────────────────
// AIService 类
// ─────────────────────────────────────────────────────────────────
class AIService {
  constructor() {
    // 会话历史：Map<sessionId, Array<{role, content}>>
    this._sessions = new Map();
  }

  // ── 连接测试 ────────────────────────────────────────────────
  async testOpenAI(apiKey, model = 'gpt-4o-mini') {
    return sendChatRequest({
      apiKey,
      baseUrl: 'https://api.openai.com/v1',
      model,
      messages: [{ role: 'user', content: 'Reply with OK' }],
      maxTokens: 10
    });
  }

  async testOpenRouter(apiKey, baseUrl = 'https://openrouter.ai/api/v1', model = 'openai/gpt-4o-mini') {
    return sendChatRequest({
      apiKey, baseUrl, model,
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 10,
      timeout: 30000
    });
  }

  // ── 单轮对话（无历史）────────────────────────────────────────
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} opts.baseUrl
   * @param {string} opts.model
   * @param {string} opts.userMessage
   * @param {string} [opts.systemPrompt]   自定义系统提示词，默认用 default
   * @param {number} [opts.maxTokens]
   */
  async chat(opts) {
    const {
      apiKey,
      baseUrl = 'https://openrouter.ai/api/v1',
      model   = 'openai/gpt-4o-mini',
      userMessage,
      systemPrompt,
      maxTokens = 2000
    } = opts;

    const messages = [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPTS.default },
      { role: 'user',   content: userMessage }
    ];

    return sendChatRequest({ apiKey, baseUrl, model, messages, maxTokens });
  }

  // 兼容旧调用签名：chat(apiKey, baseUrl, model, userMessage)
  // （检测第一个参数是否为字符串）
  // 已废弃，但保留兼容
  async chatLegacy(apiKey, baseUrl, model, userMessage, systemPrompt) {
    return this.chat({ apiKey, baseUrl, model, userMessage, systemPrompt });
  }

  // ── 多轮会话 ────────────────────────────────────────────────
  /**
   * 获取或创建一个会话
   * @param {string} sessionId
   * @param {string} [role]  'default'|'analyst'|'keyword'|'budget'
   */
  getOrCreateSession(sessionId, role = 'default') {
    if (!this._sessions.has(sessionId)) {
      const systemContent = SYSTEM_PROMPTS[role] || SYSTEM_PROMPTS.default;
      this._sessions.set(sessionId, [
        { role: 'system', content: systemContent }
      ]);
    }
    return this._sessions.get(sessionId);
  }

  /**
   * 多轮对话
   * @param {object} opts
   * @param {string} opts.sessionId      会话 ID，同一 ID 共享历史
   * @param {string} opts.apiKey
   * @param {string} opts.baseUrl
   * @param {string} opts.model
   * @param {string} opts.userMessage
   * @param {string} [opts.role]         决定系统提示词类型
   * @param {number} [opts.maxHistory]   最多保留多少轮历史（不含 system），默认 10
   * @param {number} [opts.maxTokens]
   */
  async chatSession(opts) {
    const {
      sessionId,
      apiKey,
      baseUrl  = 'https://openrouter.ai/api/v1',
      model    = 'openai/gpt-4o-mini',
      userMessage,
      role     = 'default',
      maxHistory = 10,
      maxTokens  = 2000
    } = opts;

    const history = this.getOrCreateSession(sessionId, role);

    // 追加用户消息
    history.push({ role: 'user', content: userMessage });

    // 裁剪历史（保留 system + 最近 maxHistory 轮）
    const system = history[0];
    const turns  = history.slice(1);
    const trimmed = turns.slice(-(maxHistory * 2));   // 每轮 user + assistant = 2 条
    const messages = [system, ...trimmed];

    const result = await sendChatRequest({ apiKey, baseUrl, model, messages, maxTokens });

    if (result.success) {
      // 记录 assistant 回复到历史
      history.push({ role: 'assistant', content: result.response });
    }

    return { ...result, sessionId, historyLength: history.length - 1 };
  }

  /** 清除会话历史 */
  clearSession(sessionId) {
    this._sessions.delete(sessionId);
    return { cleared: true, sessionId };
  }

  // ── 广告 Agent 对话（支持 Function Calling 多轮执行）──────────
  /**
   * 带 Function Calling 的 Agent 对话
   * AI 可以调用工具真正执行广告操作
   *
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} opts.baseUrl
   * @param {string} opts.model
   * @param {string} opts.userMessage      用户的自然语言指令
   * @param {string} [opts.sessionId]      会话 ID，传入则保留历史
   * @param {Array}  [opts.tools]          工具定义，默认使用全部广告工具
   * @param {number} [opts.maxToolRounds]  最多执行多少轮工具调用，防止死循环，默认 5
   * @returns {{ success, response, executedTools, historyLength }}
   */
  async agentChat(opts) {
    const {
      apiKey,
      baseUrl       = 'https://openrouter.ai/api/v1',
      model         = 'openai/gpt-4o',
      userMessage,
      sessionId,
      tools,
      maxToolRounds = 5,
      maxTokens     = 3000
    } = opts;

    const { TOOL_DEFINITIONS, ToolExecutor } = require('./ai-tools');
    const activeTools = tools || TOOL_DEFINITIONS;

    // 构建消息历史
    let messages;
    if (sessionId) {
      const history = this.getOrCreateSession(sessionId, 'agent');
      history.push({ role: 'user', content: userMessage });
      messages = [...history];
    } else {
      messages = [
        { role: 'system', content: SYSTEM_PROMPTS.agent },
        { role: 'user',   content: userMessage }
      ];
    }

    const executedTools = [];
    let round = 0;

    // Function Calling 循环（AI → tool → AI → tool → ... → 最终回复）
    while (round < maxToolRounds) {
      round++;

      const result = await sendChatRequest({
        apiKey, baseUrl, model, messages,
        tools: activeTools,
        maxTokens
      });

      if (!result.success) {
        return { success: false, error: result.error, executedTools };
      }

      // 没有 tool_calls → AI 已生成最终文本回复
      if (!result.toolCalls || result.toolCalls.length === 0) {
        if (sessionId) {
          const history = this._sessions.get(sessionId);
          if (history) history.push({ role: 'assistant', content: result.response });
        }
        return {
          success: true,
          response: result.response,
          executedTools,
          rounds: round
        };
      }

      // 有 tool_calls → 依次执行，把结果反馈给 AI
      // 先把 assistant 消息（含 tool_calls）加入历史
      messages.push({
        role: 'assistant',
        content: result.response || null,
        tool_calls: result.toolCalls
      });

      for (const tc of result.toolCalls) {
        const toolName = tc.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(tc.function.arguments);
        } catch {
          toolArgs = {};
        }

        const toolResult = await ToolExecutor.execute(toolName, toolArgs);
        executedTools.push({ tool: toolName, args: toolArgs, result: toolResult });

        // 把工具执行结果加入对话
        messages.push({
          role:         'tool',
          tool_call_id: tc.id,
          content:      JSON.stringify(toolResult)
        });
      }
      // 继续下一轮，让 AI 消化工具结果后生成回复或再次调用工具
    }

    // 超过最大轮次，强制返回
    return {
      success: true,
      response: '工具调用轮次已达上限，以下是最近执行结果：\n' +
        executedTools.map(t => `- ${t.tool}: ${JSON.stringify(t.result).slice(0, 100)}`).join('\n'),
      executedTools,
      rounds: round,
      warning: '已达最大工具调用轮次'
    };
  }

  // ── 广告数据分析（专项）────────────────────────────────────
  /**
   * 分析广告活动表现，生成优化建议
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} opts.baseUrl
   * @param {string} opts.model
   * @param {object} opts.adData          { campaigns, keywords, targetAcos, dateRange }
   * @param {string} [opts.question]      具体问题
   */
  async analyzeAdPerformance(opts) {
    const {
      apiKey, baseUrl, model,
      adData = {},
      question = '请全面分析广告表现，给出优化建议'
    } = opts;

    const userMessage = buildAdAnalysisPrompt({ ...adData, question });

    return this.chat({
      apiKey, baseUrl, model,
      systemPrompt: SYSTEM_PROMPTS.analyst,
      userMessage,
      maxTokens: 3000
    });
  }

  /**
   * 关键词策略分析
   * @param {object} opts
   * @param {string} opts.apiKey / baseUrl / model
   * @param {Array}  opts.keywords     关键词数据
   * @param {number} opts.targetAcos
   * @param {string} [opts.question]
   */
  async analyzeKeywords(opts) {
    const { apiKey, baseUrl, model, keywords = [], targetAcos, question } = opts;

    const userMessage = buildAdAnalysisPrompt({
      keywords,
      targetAcos,
      question: question || '分析这些关键词的表现，指出需要提价、降价、否定的关键词，并给出具体出价建议'
    });

    return this.chat({
      apiKey, baseUrl, model,
      systemPrompt: SYSTEM_PROMPTS.keyword,
      userMessage,
      maxTokens: 2500
    });
  }

  /**
   * 预算优化建议
   * @param {object} opts
   * @param {string} opts.apiKey / baseUrl / model
   * @param {Array}  opts.campaigns    活动数据（含 dailyBudget、spend、sales、acos）
   * @param {string} [opts.question]
   */
  async analyzeBudget(opts) {
    const { apiKey, baseUrl, model, campaigns = [], question } = opts;

    const userMessage = buildAdAnalysisPrompt({
      campaigns,
      question: question || '分析每个活动的预算利用率和 ROAS，给出预算再分配建议'
    });

    return this.chat({
      apiKey, baseUrl, model,
      systemPrompt: SYSTEM_PROMPTS.budget,
      userMessage,
      maxTokens: 2000
    });
  }
}

module.exports = new AIService();
