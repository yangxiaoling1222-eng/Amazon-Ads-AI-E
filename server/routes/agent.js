/**
 * AI Agent 路由
 * 支持自然语言指令驱动的广告操作（Function Calling）
 */

const express = require('express');
const router  = express.Router();
const ai      = require('../services/ai');
const { TOOL_DEFINITIONS } = require('../services/ai-tools');
const db      = require('../config/database');
const fs      = require('fs');
const path    = require('path');

/**
 * 清理回复中的开场白（兜底处理）
 */
function cleanIntro(text) {
  if (!text) return text;

  // 常见的开场白模式
  const patterns = [
    /^【强制规则】[\s\S]*?用户问题：\s*/,
    /^【重要】[\s\S]*?用户问题：\s*/,
    /^您好！?\s*/,
    /^您好，?\s*/,
    /^你好！?\s*/,
    /^你好，?\s*/,
    /^您好[\u4e00-\u9fa5]+：\s*/,
    /^我能帮您做以下事情[：:：]?\s*/,
    /^以下是[\u4e00-\u9fa5]*[：:：]\s*/,
    /^根据您的问题[\u4e00-\u9fa5]*[：:：]\s*/,
    /^根据我的能力[\u4e00-\u9fa5]*[：:：]\s*/,
    /^\*\*[\u4e00-\u9fa5]*[\*\*]?\s*$/m,
    /^[-─]\s*$/m,
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 清理开头的空行
  cleaned = cleaned.replace(/^[\s\n\r]+/, '');

  return cleaned;
}

function fail(res, err, code = 500) {
  const msg = err?.response?.data?.error?.message || err?.message || '请求失败';
  console.error('[Agent Error]', msg);
  return res.status(code).json({ success: false, message: msg });
}

/**
 * 从数据库 api_config 表读取 AI 配置（每次从磁盘读取最新数据）
 * 优先级：aiProvider 决定使用哪个 > 环境变量兜底
 */
function loadAiConfig() {
  try {
    // 优先尝试从磁盘重新加载最新数据库，避免内存缓存导致配置不更新
    const dbPath = path.join(__dirname, '../data/ads_platform.db');
    console.log('[Agent] 尝试从磁盘读取数据库:', dbPath, '文件存在:', fs.existsSync(dbPath));
    let rows = [];
    if (fs.existsSync(dbPath)) {
      try {
        // 使用 better-sqlite3 同步读取磁盘数据库（无需 await）
        const BetterSQLite3 = require('better-sqlite3');
        const diskDb = new BetterSQLite3(dbPath, { readonly: true });
        rows = diskDb.prepare(
          "SELECT config_key, config_value FROM api_config WHERE config_key IN ('aiProvider','siliconflow','openrouter','openai','custom','amazon')"
        ).all();
        diskDb.close();
        console.log('[Agent] 从磁盘读取到', rows.length, '条配置');
      } catch (diskErr) {
        console.warn('[Agent] 从磁盘读取配置失败，回退到内存数据库:', diskErr.message);
        rows = db.query(
          "SELECT config_key, config_value FROM api_config WHERE config_key IN ('aiProvider','siliconflow','openrouter','openai','custom','amazon')"
        );
      }
    } else {
      console.log('[Agent] 磁盘数据库不存在，使用内存数据库');
      rows = db.query(
        "SELECT config_key, config_value FROM api_config WHERE config_key IN ('aiProvider','siliconflow','openrouter','openai','custom','amazon')"
      );
    }

    const cfg = {};
    rows.forEach(r => {
      // 安全解析 JSON：如果失败，使用原始值（适用于纯字符串如 aiProvider）
      try { cfg[r.config_key] = JSON.parse(r.config_value); } catch (_) {
        cfg[r.config_key] = r.config_value; // 直接使用原始字符串
      }
    });

    let apiKey, baseUrl, model, profileId, provider;

    // ── aiProvider 决定路由（用户选择模式）──
    const selectedProvider = cfg.aiProvider || 'siliconflow';

    if (selectedProvider === 'siliconflow' && cfg.siliconflow?.apiKey) {
      apiKey   = cfg.siliconflow.apiKey;
      baseUrl  = 'https://api.siliconflow.cn/v1';
      model    = cfg.siliconflow.model || 'Qwen/Qwen3-8B';
      provider = 'SiliconFlow';
    } else if (selectedProvider === 'openrouter' && cfg.openrouter?.apiKey) {
      apiKey   = cfg.openrouter.apiKey;
      baseUrl  = cfg.openrouter.baseUrl || 'https://openrouter.ai/api/v1';
      model    = cfg.openrouter.model   || 'openai/gpt-4o';
      provider = 'OpenRouter';
    } else if (selectedProvider === 'openai' && cfg.openai?.apiKey) {
      apiKey   = cfg.openai.apiKey;
      baseUrl  = 'https://api.openai.com/v1';
      model    = cfg.openai.model || 'gpt-4o';
      provider = 'OpenAI';
    } else if (selectedProvider === 'custom' && cfg.custom?.apiKey) {
      apiKey   = cfg.custom.apiKey;
      baseUrl  = cfg.custom.baseUrl || 'https://api.openai.com/v1';
      model    = cfg.custom.model  || 'gpt-4o';
      provider = 'Custom';
    } else {
      // 环境变量兜底（保留兼容性）
      apiKey   = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      baseUrl  = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      model    = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o';
      provider = 'OpenRouter';
    }

    // Amazon profileId（取第一个已配置的 profile）
    if (cfg.amazon?.profileId) {
      profileId = cfg.amazon.profileId;
    }

    return { apiKey, baseUrl, model, profileId, provider };
  } catch (e) {
    console.error('[Agent] loadAiConfig error:', e.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /agent/chat
// 自然语言 → AI → 工具调用 → 执行 → 返回结果
// ─────────────────────────────────────────────────────────────────
/**
 * body: {
 *   message:    "帮我把所有 ACoS 超过 40% 的活动预算降低 20%",
 *   sessionId:  "user-123",           // 可选，多轮会话
 *   profileId:  "xxx",                // 可选，传入则注入到上下文
 *   apiKey:     "sk-...",             // OpenRouter/OpenAI API Key
 *   baseUrl:    "https://...",        // 默认 OpenRouter
 *   model:      "openai/gpt-4o",      // 默认 gpt-4o
 *   dryRunAll:  true                  // 可选，强制所有工具调用为 dryRun
 * }
 */
router.post('/chat', async (req, res) => {
  try {
    const {
      message,
      sessionId,
      profileId:  clientProfileId,
      apiKey:     clientApiKey,
      baseUrl:    clientBaseUrl,
      model:      clientModel,
      dryRunAll = false
    } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: '缺少 message 参数' });
    }

    // 从系统配置读取，前端传的值优先（兼容旧调用）
    const sysCfg  = loadAiConfig();
    const apiKey  = clientApiKey  || sysCfg.apiKey;
    const baseUrl = clientBaseUrl || sysCfg.baseUrl;
    const model   = clientModel   || sysCfg.model;
    const profileId = clientProfileId || sysCfg.profileId;

    if (!apiKey) {
      return res.status(400).json({ success: false, message: '未配置 AI API Key，请先在系统设置中填写' });
    }

    // 如果提供了 profileId，注入到消息上下文
    let userMessage = message;
    if (profileId) {
      userMessage = `[当前广告账户 profileId: ${profileId}]\n\n${message}`;
    }
    if (dryRunAll) {
      userMessage += '\n\n[注意：本次所有操作请先使用 dryRun=true 预览，不要实际执行]';
    }

    // 🔒 强制指令：禁止开场白，直接回答
    userMessage = `【强制规则】
1. 直接回答用户问题，不要加任何开场白、问候语或功能介绍
2. 禁止使用："您好！""您好，""我能帮您做以下事情""以下是""根据您的问题"
3. 用户问问题 → 直接给出答案
4. 用户要求操作 → 直接执行并汇报结果
5. 如果是追问 → 直接继续之前的话题，不要重复介绍

用户问题：
${message}`;

    const result = await ai.agentChat({
      apiKey,
      baseUrl,
      model,
      userMessage,
      sessionId
    });

    // 🧹 清理回复中的开场白（兜底处理）
    if (result.response) {
      result.response = cleanIntro(result.response);
    }

    res.json({
      success:      result.success,
      response:     result.response,
      executedTools: result.executedTools || [],
      rounds:       result.rounds,
      warning:      result.warning,
      error:        result.error,
      errorDetail:  result.errorDetail || null,
      taskId:       result.taskId || null,   // AI 自动创建的任务 ID
      // 回传实际使用的模型信息（前端展示用）
      usedModel:    model
    });
  } catch (err) { fail(res, err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /agent/chat-stream  （Server-Sent Events 流式输出）
// ─────────────────────────────────────────────────────────────────
router.post('/chat-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { message, sessionId, profileId, apiKey, baseUrl, model } = req.body;

    if (!message || !apiKey) {
      send('error', { message: '缺少 message 或 apiKey' });
      return res.end();
    }

    let userMessage = message;
    if (profileId) userMessage = `[profileId: ${profileId}]\n\n${message}`;

    // 通知前端：开始处理
    send('start', { message: '正在分析您的指令...' });

    const result = await ai.agentChat({
      apiKey, baseUrl, model, userMessage, sessionId,
      // 在工具执行时通过闭包发送进度事件（改造后可支持，当前先用完成事件）
    });

    // 如果有工具调用，逐条推送进度
    for (const tool of (result.executedTools || [])) {
      send('tool_executed', {
        tool:    tool.tool,
        success: tool.result?.success,
        summary: summarizeTool(tool)
      });
    }

    send('done', {
      response:     result.response,
      executedTools: result.executedTools?.length || 0,
      rounds:       result.rounds
    });

    res.end();
  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /agent/config  — 返回当前系统配置的 AI 模型信息（不含密钥）
// ─────────────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  const cfg = loadAiConfig();
  const hasKey = !!cfg.apiKey;
  res.json({
    success: true,
    data: {
      configured: hasKey,
      model:      hasKey ? cfg.model : null,
      provider:   hasKey ? cfg.provider : null,
      profileId:  cfg.profileId || null
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /agent/tools  — 查看可用工具列表
// ─────────────────────────────────────────────────────────────────
router.get('/tools', (req, res) => {
  const tools = TOOL_DEFINITIONS.map(t => ({
    name:        t.function.name,
    description: t.function.description,
    params:      Object.keys(t.function.parameters?.properties || {})
  }));
  res.json({ success: true, count: tools.length, tools });
});

// ─────────────────────────────────────────────────────────────────
// DELETE /agent/session/:sessionId  — 清除会话历史
// ─────────────────────────────────────────────────────────────────
router.delete('/session/:sessionId', (req, res) => {
  const result = ai.clearSession(req.params.sessionId);
  res.json({ success: true, ...result });
});

// ─────────────────────────────────────────────────────────────────
// 工具执行摘要
// ─────────────────────────────────────────────────────────────────
function summarizeTool(tool) {
  const r = tool.result;
  switch (tool.tool) {
    case 'get_campaigns':       return `查到 ${r.count} 个广告活动`;
    case 'get_keywords':        return `查到 ${r.count} 个关键词`;
    case 'update_campaign_budgets': return `更新了 ${r.updated} 个活动的预算`;
    case 'pause_campaigns':     return `暂停了 ${r.paused} 个活动`;
    case 'enable_campaigns':    return `启用了 ${r.enabled} 个活动`;
    case 'adjust_keyword_bids': return `调整了 ${r.adjusted} 个关键词出价`;
    case 'add_negative_keywords': return `添加了 ${r.added} 个否定词`;
    case 'apply_smart_bids':    return r.dryRun ? `预览：${r.suggestions?.length} 个词需要调价` : `已调整 ${r.updated} 个关键词出价`;
    case 'harvest_keywords':    return r.dryRun
      ? `预览：可收割 ${r.summary?.harvestCount} 个词，建议否定 ${r.summary?.negateCount} 个词`
      : `已收割 ${r.summary?.harvestCount} 个词，否定 ${r.summary?.negateCount} 个词`;
    default: return JSON.stringify(r).slice(0, 80);
  }
}

// ────────────────────────────────────────────────────────────────
// GET /agent/models  — 动态拉取 OpenRouter 模型列表（后端转发避免CORS）
// 参数：?apiKey=sk-or-v1-...
// ────────────────────────────────────────────────────────────────
router.get('/models', async (req, res) => {
  const sysCfg = loadAiConfig();
  const apiKey = req.query.apiKey || sysCfg.apiKey;
  if (!apiKey) return res.status(400).json({ success: false, error: '未配置 API Key' });

  try {
    const axios = require('axios');
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      timeout: 15000
    });
    const list = response.data.data || response.data;
    res.json({ success: true, data: list, currentModel: sysCfg.model });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || '拉取模型列表失败';
    res.status(err.response?.status || 500).json({ success: false, error: msg });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /agent/siliconflow-models  — 拉取 SiliconFlow 模型列表
// 参数：?apiKey=sk-...（可选，不传则用系统配置）
// ────────────────────────────────────────────────────────────────
router.get('/siliconflow-models', async (req, res) => {
  const sysCfg = loadAiConfig();
  const apiKey = req.query.apiKey || (sysCfg.provider === 'SiliconFlow' ? sysCfg.apiKey : null);
  // 若没传 apiKey 且系统配置的不是 SF，允许直接用查询参数的 key
  const key = req.query.apiKey || apiKey;
  if (!key) return res.status(400).json({ success: false, error: '未配置 SiliconFlow API Key' });

  try {
    const axios = require('axios');
    const response = await axios.get('https://api.siliconflow.cn/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key },
      timeout: 15000
    });
    const list = (response.data.data || []).filter(m =>
      m.type === 'text' || m.object === 'model'
    );
    res.json({ success: true, data: list, currentModel: sysCfg.model });
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error?.message || err.message || '拉取模型列表失败';
    res.status(err.response?.status || 500).json({ success: false, error: msg });
  }
});

module.exports = router;
