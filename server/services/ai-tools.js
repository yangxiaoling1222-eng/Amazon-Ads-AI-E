/**
 * AI Function Calling 工具定义 + 执行器
 *
 * 让 AI 不只是给建议，而是真正执行广告操作。
 * 流程：
 *   1. 用户发自然语言指令（如"帮我把 ACoS > 40% 的活动预算降低 20%"）
 *   2. AI 选择合适的 Tool，填入参数
 *   3. ToolExecutor 调用实际 API
 *   4. 把执行结果反馈给 AI，AI 生成最终回复
 */

const ads = require('./amazon-ads');

// ─────────────────────────────────────────────────────────────────
// Tool 定义（OpenAI Function Calling 格式）
// ─────────────────────────────────────────────────────────────────
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_campaigns',
      description: '获取广告账户下的广告活动列表，可按状态筛选',
      parameters: {
        type: 'object',
        properties: {
          profileId: {
            type: 'string',
            description: '广告账户 Profile ID'
          },
          states: {
            type: 'array',
            items: { type: 'string', enum: ['ENABLED', 'PAUSED', 'ARCHIVED'] },
            description: '活动状态过滤，如 ["ENABLED"]，不填则返回全部',
            default: ['ENABLED', 'PAUSED']
          }
        },
        required: ['profileId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_campaign_budgets',
      description: '批量调整广告活动的日预算，支持按百分比增减或设置固定金额',
      parameters: {
        type: 'object',
        properties: {
          profileId: {
            type: 'string',
            description: '广告账户 Profile ID'
          },
          updates: {
            type: 'array',
            description: '要更新的活动列表',
            items: {
              type: 'object',
              properties: {
                campaignId: { type: 'string', description: '活动 ID' },
                budget:     { type: 'number', description: '新的日预算金额（$）' }
              },
              required: ['campaignId', 'budget']
            }
          }
        },
        required: ['profileId', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pause_campaigns',
      description: '暂停指定的广告活动',
      parameters: {
        type: 'object',
        properties: {
          profileId:   { type: 'string', description: 'Profile ID' },
          campaignIds: {
            type: 'array',
            items: { type: 'string' },
            description: '要暂停的活动 ID 列表'
          },
          reason: { type: 'string', description: '暂停原因（仅用于日志记录）' }
        },
        required: ['profileId', 'campaignIds']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enable_campaigns',
      description: '启用（恢复投放）指定的广告活动',
      parameters: {
        type: 'object',
        properties: {
          profileId:   { type: 'string', description: 'Profile ID' },
          campaignIds: { type: 'array', items: { type: 'string' }, description: '要启用的活动 ID 列表' }
        },
        required: ['profileId', 'campaignIds']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_keywords',
      description: '获取广告组的关键词列表（含出价、状态、匹配类型）',
      parameters: {
        type: 'object',
        properties: {
          profileId:   { type: 'string', description: 'Profile ID' },
          campaignIds: { type: 'array', items: { type: 'string' }, description: '按活动 ID 过滤' },
          adGroupIds:  { type: 'array', items: { type: 'string' }, description: '按广告组 ID 过滤' }
        },
        required: ['profileId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'adjust_keyword_bids',
      description: '批量调整关键词出价，支持设置固定金额或按百分比增减',
      parameters: {
        type: 'object',
        properties: {
          profileId: { type: 'string', description: 'Profile ID' },
          adjustments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                keywordId:    { type: 'string', description: '关键词 ID' },
                bid:          { type: 'number', description: '新出价（$）' }
              },
              required: ['keywordId', 'bid']
            },
            description: '关键词出价调整列表'
          }
        },
        required: ['profileId', 'adjustments']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_negative_keywords',
      description: '为广告活动或广告组添加否定关键词，用于屏蔽不相关流量',
      parameters: {
        type: 'object',
        properties: {
          profileId: { type: 'string', description: 'Profile ID' },
          negatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                campaignId:  { type: 'string' },
                adGroupId:   { type: 'string' },
                keywordText: { type: 'string', description: '否定词文本' },
                matchType:   {
                  type: 'string',
                  enum: ['NEGATIVE_EXACT', 'NEGATIVE_PHRASE'],
                  description: '否定匹配类型'
                }
              },
              required: ['campaignId', 'keywordText', 'matchType']
            }
          }
        },
        required: ['profileId', 'negatives']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_smart_bids',
      description: '根据目标 ACoS 智能计算并批量应用关键词出价建议',
      parameters: {
        type: 'object',
        properties: {
          profileId:  { type: 'string', description: 'Profile ID' },
          targetAcos: { type: 'number', description: '目标 ACoS（%），如 20 表示 20%' },
          keywords: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:      { type: 'string', description: '关键词 ID' },
                keyword: { type: 'string', description: '关键词文本' },
                bid:     { type: 'number', description: '当前出价' },
                acos:    { type: 'number', description: '当前 ACoS（%）' }
              },
              required: ['id', 'bid', 'acos']
            },
            description: '需要调价的关键词数据'
          },
          dryRun: {
            type: 'boolean',
            description: '是否仅预览不实际执行，默认 false',
            default: false
          }
        },
        required: ['profileId', 'targetAcos', 'keywords']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'harvest_keywords',
      description: '自动从自动广告搜索词报告中提取高转化词（加入手动精准）并否定低效词，实现关键词收割闭环',
      parameters: {
        type: 'object',
        properties: {
          profileId:   { type: 'string', description: 'Profile ID' },
          campaignIds: { type: 'array', items: { type: 'string' }, description: '要分析的活动 ID，不填则分析全部' },
          startDate:   { type: 'string', description: '报告开始日期 YYYY-MM-DD，默认近 30 天' },
          endDate:     { type: 'string', description: '报告结束日期 YYYY-MM-DD，默认昨天' },
          targetAcos:  { type: 'number', description: '目标 ACoS（%），用于计算建议出价' },
          avgOrderValue: { type: 'number', description: '平均客单价（$），用于计算建议出价' },
          dryRun: {
            type: 'boolean',
            description: '是否仅预览不实际执行，建议首次使用 true',
            default: true
          }
        },
        required: ['profileId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_asin_targeting',
      description: '将 ASIN 添加为商品定向投放。效果好（ACoS 低）的竞品 ASIN 定向到广告，出现在竞品详情页下方',
      parameters: {
        type: 'object',
        properties: {
          profileId: { type: 'string', description: 'Profile ID' },
          targetings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                campaignId:   { type: 'string', description: '活动 ID' },
                adGroupId:    { type: 'string', description: '广告组 ID' },
                asin:         { type: 'string', description: '目标 ASIN（如 B08N5WRWNW）' },
                bid:          { type: 'number', description: '出价（$）' }
              },
              required: ['campaignId', 'adGroupId', 'asin', 'bid']
            },
            description: 'ASIN 定向列表'
          }
        },
        required: ['profileId', 'targetings']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_negative_asin_targeting',
      description: '将 ASIN 添加为否定商品定向。效果差（高 ACoS 或无转化）的竞品 ASIN 否定掉，避免浪费广告费',
      parameters: {
        type: 'object',
        properties: {
          profileId: { type: 'string', description: 'Profile ID' },
          negatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                campaignId: { type: 'string', description: '活动 ID' },
                asin:        { type: 'string', description: '要否定的 ASIN（如 B08N5WRWNW）' }
              },
              required: ['campaignId', 'asin']
            },
            description: '否定 ASIN 列表'
          }
        },
        required: ['profileId', 'negatives']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_asin_targetings',
      description: '查询当前广告活动已有的 ASIN 定向列表，用于避免重复添加',
      parameters: {
        type: 'object',
        properties: {
          profileId:   { type: 'string', description: 'Profile ID' },
          campaignIds: { type: 'array', items: { type: 'string' }, description: '按活动 ID 过滤，不填则查全部' }
        },
        required: ['profileId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '将用户的广告优化需求创建为系统任务，方便后续跟踪和执行。当用户说"生成任务""帮我创建一个任务""把这个加入任务列表"等时调用。',
      parameters: {
        type: 'object',
        properties: {
          name:        { type: 'string', description: '任务名称，简洁概括用户需求，如"优化洗手片广告ACOS"' },
          description: { type: 'string', description: '任务详细描述，包含用户提到的具体目标、时间、产品等信息' },
          priority:    { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级：high=高, medium=中, low=低', default: 'medium' },
          items: {
            type: 'array',
            description: '子任务列表，将大任务拆分为可执行的子任务',
            items: {
              type: 'object',
              properties: {
                title:       { type: 'string', description: '子任务标题' },
                description: { type: 'string', description: '子任务描述' },
                actionType:  { type: 'string', enum: ['analyze', 'adjust_bid', 'adjust_budget', 'pause', 'enable', 'add_keyword', 'add_negative', 'harvest', 'report'], description: '操作类型' }
              },
              required: ['title', 'actionType']
            }
          }
        },
        required: ['name', 'description']
      }
    }
  }
];

// ─────────────────────────────────────────────────────────────────
// Tool 执行器
// ─────────────────────────────────────────────────────────────────
class ToolExecutor {
  /**
   * 执行单个 tool call
   * @param {string} toolName
   * @param {object} args       AI 填入的参数
   * @returns {object}          执行结果（会被 stringify 后发回 AI）
   */
  async execute(toolName, args) {
    console.log(`[ToolExecutor] 执行 ${toolName}`, JSON.stringify(args).slice(0, 200));

    try {
      switch (toolName) {
        // ── 查询类 ──────────────────────────────────────────────
        case 'get_campaigns': {
          const filters = {};
          if (args.states) filters.states = args.states;
          const data = await ads.getCampaigns(args.profileId, filters);
          const campaigns = data.campaigns || data || [];
          return {
            success: true,
            count: campaigns.length,
            campaigns: campaigns.slice(0, 50)   // 最多返回 50 条给 AI
          };
        }

        case 'get_keywords': {
          const filters = {};
          if (args.campaignIds) filters.campaignIdFilter = args.campaignIds;
          if (args.adGroupIds)  filters.adGroupIdFilter  = args.adGroupIds;
          const data = await ads.getKeywords(args.profileId, filters);
          const keywords = data.keywords || data || [];
          return {
            success: true,
            count: keywords.length,
            keywords: keywords.slice(0, 100)
          };
        }

        // ── 更新预算 ─────────────────────────────────────────────
        case 'update_campaign_budgets': {
          const campaigns = args.updates.map(u => ({
            campaignId: u.campaignId,
            budget: {
              budgetType: 'DAILY',
              budget: u.budget
            }
          }));
          const result = await ads.updateCampaigns(args.profileId, campaigns);
          return {
            success: true,
            updated: args.updates.length,
            result: result?.campaigns?.success || result
          };
        }

        // ── 暂停活动 ─────────────────────────────────────────────
        case 'pause_campaigns': {
          const campaigns = args.campaignIds.map(id => ({
            campaignId: id,
            state: 'PAUSED'
          }));
          const result = await ads.updateCampaigns(args.profileId, campaigns);
          return {
            success: true,
            paused: args.campaignIds.length,
            reason: args.reason || '按 AI 指令暂停'
          };
        }

        // ── 启用活动 ─────────────────────────────────────────────
        case 'enable_campaigns': {
          const campaigns = args.campaignIds.map(id => ({
            campaignId: id,
            state: 'ENABLED'
          }));
          await ads.updateCampaigns(args.profileId, campaigns);
          return { success: true, enabled: args.campaignIds.length };
        }

        // ── 调整关键词出价 ────────────────────────────────────────
        case 'adjust_keyword_bids': {
          const keywords = args.adjustments.map(a => ({
            keywordId: a.keywordId,
            bid: a.bid
          }));
          const result = await ads.updateKeywords(args.profileId, keywords);
          return {
            success: true,
            adjusted: args.adjustments.length,
            result: result?.keywords?.success || result
          };
        }

        // ── 否词 ─────────────────────────────────────────────────
        case 'add_negative_keywords': {
          const result = await ads.addNegativeKeywords(args.profileId, args.negatives);
          return {
            success: true,
            added: args.negatives.length,
            result: result?.negativeKeywords?.success || result
          };
        }

        // ── 智能调价 ─────────────────────────────────────────────
        case 'apply_smart_bids': {
          const result = await ads.applySmartBids(
            args.profileId,
            args.keywords,
            args.targetAcos,
            { dryRun: args.dryRun || false }
          );
          return { success: true, ...result };
        }

        // ── 关键词收割 ───────────────────────────────────────────
        case 'harvest_keywords': {
          const reportOpts = {};
          if (args.startDate)   reportOpts.startDate   = args.startDate;
          if (args.endDate)     reportOpts.endDate     = args.endDate;
          if (args.campaignIds) reportOpts.campaignIds = args.campaignIds;

          const searchTerms = await ads.getSearchTermReport(args.profileId, reportOpts);

          const rules = {};
          if (args.targetAcos)   rules.targetAcos   = args.targetAcos;
          if (args.avgOrderValue) rules.avgOrderValue = args.avgOrderValue;

          const analysis = ads.analyzeSearchTerms(searchTerms, rules);

          if (args.dryRun !== false) {
            // 默认 dryRun = true，安全第一
            return {
              dryRun: true,
              reportRows: searchTerms.length,
              summary: analysis.summary,
              harvestPreview: analysis.harvest.slice(0, 20),
              negatePreview:  analysis.negate.slice(0, 20),
              asinHarvestPreview: analysis.asinHarvest.slice(0, 20),
              asinNegatePreview:  analysis.asinNegate.slice(0, 20)
            };
          }

          // 真正执行
          let harvestResult = null, negateResult = null;
          let asinHarvestResult = null, asinNegateResult = null;
          if (analysis.harvest.length > 0) {
            const kwPayload = analysis.harvest.map(h => ({
              adGroupId: h.adGroupId, campaignId: h.campaignId,
              keywordText: h.searchTerm, matchType: 'EXACT',
              bid: h.suggestedBid || 0.50, state: 'ENABLED'
            }));
            harvestResult = await ads.createKeywords(args.profileId, kwPayload);
          }
          if (analysis.negate.length > 0) {
            const negPayload = analysis.negate.map(n => ({
              campaignId: n.campaignId, adGroupId: n.adGroupId,
              keywordText: n.searchTerm, matchType: 'NEGATIVE_EXACT'
            }));
            negateResult = await ads.addNegativeKeywords(args.profileId, negPayload);
          }
          if (analysis.asinHarvest.length > 0) {
            asinHarvestResult = await ads.createProductTargetings(
              args.profileId,
              analysis.asinHarvest.map(h => ({
                adGroupId: h.adGroupId, campaignId: h.campaignId,
                asin: h.asin, bid: h.suggestedBid || 0.50
              }))
            );
          }
          if (analysis.asinNegate.length > 0) {
            asinNegateResult = await ads.createNegativeAsinTargetings(
              args.profileId,
              analysis.asinNegate.map(n => ({
                campaignId: n.campaignId, asin: n.asin
              }))
            );
          }

          return {
            dryRun: false,
            reportRows: searchTerms.length,
            summary: analysis.summary,
            harvestResult,
            negateResult,
            asinHarvestResult,
            asinNegateResult
          };
        }

        // ── ASIN 定向 ────────────────────────────────────────────
        case 'add_asin_targeting': {
          const result = await ads.createProductTargetings(args.profileId, args.targetings);
          return {
            success: true,
            added: args.targetings.length,
            result: result?.targetings?.success || result
          };
        }

        // ── ASIN 否定定向 ────────────────────────────────────────
        case 'add_negative_asin_targeting': {
          const result = await ads.createNegativeAsinTargetings(args.profileId, args.negatives);
          return {
            success: true,
            added: args.negatives.length,
            result: result?.negativeTargetings?.success || result
          };
        }

        // ── 查询现有 ASIN 定向 ───────────────────────────────────
        case 'get_asin_targetings': {
          const targetings = await ads.getAsinTargetings(args.profileId, args.campaignIds || []);
          // 提取 ASIN 列表
          const asinList = targetings.map(t => {
            try {
              const expr = t.targetingClause?.expression || [];
              const asinExpr = expr.find(e => e.type === 'asinSameAs' || e.type === 'asin');
              return { targetingId: t.targetingId, asin: asinExpr?.value, state: t.state };
            } catch { return null; }
          }).filter(Boolean);
          return {
            success: true,
            count: asinList.length,
            targetings: asinList.slice(0, 100)
          };
        }

        // ── 创建任务 ─────────────────────────────────────────────
        case 'create_task': {
          const db = require('../config/database');
          const taskId = 'T' + Date.now().toString(36).toUpperCase();
          const now = new Date().toISOString();

          db.run(`
            INSERT INTO ai_tasks (id, name, description, source, source_id, priority, status, total_items, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            taskId,
            args.name,
            args.description || '',
            'ai_chat',
            '',
            args.priority || 'medium',
            'pending',
            args.items?.length || 0,
            now, now
          ]);

          if (args.items && args.items.length > 0) {
            args.items.forEach(item => {
              db.run(`
                INSERT INTO ai_task_items (task_id, title, description, action_type, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
              `, [
                taskId,
                item.title || '',
                item.description || '',
                item.actionType || '',
                'pending',
                now
              ]);
            });
          }

          return {
            success: true,
            taskId,
            name: args.name,
            itemCount: args.items?.length || 0,
            message: `任务「${args.name}」已创建，包含 ${args.items?.length || 0} 个子任务`
          };
        }

        default:
          return { success: false, error: `未知工具: ${toolName}` };
      }
    } catch (err) {
      console.error(`[ToolExecutor] ${toolName} 执行失败:`, err.message);
      return {
        success: false,
        error: err.response?.data?.message || err.message || '执行失败'
      };
    }
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  ToolExecutor: new ToolExecutor()
};
