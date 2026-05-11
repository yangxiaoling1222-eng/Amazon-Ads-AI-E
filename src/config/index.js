/**
 * 统一配置管理
 * 从环境变量加载所有配置
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件
dotenv.config();

// 配置对象
const config = {
  // 应用配置
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-key',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')
  },

  // 领星 ERP API 配置
  lingxing: {
    apiKey: process.env.LINGXING_API_KEY,
    apiSecret: process.env.LINGXING_API_SECRET,
    baseUrl: process.env.LINGXING_BASE_URL || 'https://open.lingxing.com/api',
    storeIds: process.env.LINGXING_STORE_IDS ? process.env.LINGXING_STORE_IDS.split(',') : [],
    rateLimit: parseInt(process.env.LINGXING_RATE_LIMIT) || 60,
    enabled: !!(process.env.LINGXING_API_KEY && process.env.LINGXING_API_SECRET)
  },

  // 亚马逊广告 API 配置 (LWA)
  amazon: {
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
    refreshToken: process.env.AMAZON_REFRESH_TOKEN,
    accessToken: process.env.AMAZON_ACCESS_TOKEN || '',
    sellerId: process.env.AMAZON_SELLER_ID,
    marketplaceIds: process.env.AMAZON_MARKETPLACE_IDS 
      ? process.env.AMAZON_MARKETPLACE_IDS.split(',') 
      : ['ATVPDKIKX0DER'],
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    lwaTokenEndpoint: process.env.LWA_TOKEN_ENDPOINT || 'https://api.amazon.com/auth/o2/token',
    lwaApiEndpoint: process.env.LWA_API_ENDPOINT || 'https://advertising-api.amazon.com',
    enabled: !!(process.env.AMAZON_CLIENT_ID && process.env.AMAZON_CLIENT_SECRET && process.env.AMAZON_REFRESH_TOKEN)
  },

  // 店铺配置
  stores: parseStoresConfig(process.env.STORES),
  defaultStore: process.env.DEFAULT_STORE || '',

  // 数据库配置
  db: {
    type: process.env.DB_TYPE || 'sqlite',
    path: process.env.DB_PATH || './data/ads_expert.db',
    // MySQL 配置
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  },

  // AI 服务配置
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    // AI 生成参数
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2048,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    // AI 自动操作开关
    autoBidding: process.env.AI_AUTO_BIDDING_ENABLED === 'true',
    autoNegativeKeywords: process.env.AI_AUTO_NEGATIVE_KEYWORDS === 'true',
    autoKeywordAdding: process.env.AI_AUTO_KEYWORD_ADDING === 'true',
    autoPlacementOptimize: process.env.AI_AUTO_PLACEMENT_OPTIMIZE === 'true',
    autoBudgetAdjust: process.env.AI_AUTO_BUDGET_ADJUST === 'true',
    autoPauseLowPerformers: process.env.AI_AUTO_PAUSE_LOW_PERFORMERS === 'true',
    executionInterval: parseInt(process.env.AI_EXECUTION_INTERVAL) || 60,
    enabled: !!process.env.OPENAI_API_KEY
  },

  // OpenRouter 配置
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o',
    enabled: !!process.env.OPENROUTER_API_KEY
  },

  // 自动驾驶配置
  autopilot: {
    enabled: process.env.ACOS_MONITORING_ENABLED !== 'false',
    defaultTargetAcos: parseFloat(process.env.DEFAULT_TARGET_ACOS) || 25,
    tolerance: parseFloat(process.env.ACOS_TOLERANCE) || 5,
    bidStep: parseFloat(process.env.AUTO_BID_STEP) || 10,
    inefficientAcosThreshold: parseFloat(process.env.INEFFICIENT_ACOS_THRESHOLD) || 50,
    inefficientConversionsThreshold: parseInt(process.env.INEFFICIENT_CONVERSIONS_THRESHOLD) || 0
  },

  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  },

  // 市场区域映射
  marketplaces: {
    ATVPDKIKX0DER: { region: 'US', name: '美国', currency: 'USD', endpoint: 'https://advertising-api.amazon.com' },
    A1F83G8C2ARO7P: { region: 'UK', name: '英国', currency: 'GBP', endpoint: 'https://advertising-api-eu.amazon.com' },
    A1PA6795UKMFR9: { region: 'DE', name: '德国', currency: 'EUR', endpoint: 'https://advertising-api-eu.amazon.com' },
    A13V1IB3VIYICK: { region: 'FR', name: '法国', currency: 'EUR', endpoint: 'https://advertising-api-eu.amazon.com' },
    APJ6JRA9NG5V4: { region: 'IT', name: '意大利', currency: 'EUR', endpoint: 'https://advertising-api-eu.amazon.com' },
    A1RKKUPIHCS9HS: { region: 'ES', name: '西班牙', currency: 'EUR', endpoint: 'https://advertising-api-eu.amazon.com' },
    A1VC38T7YXB528: { region: 'JP', name: '日本', currency: 'JPY', endpoint: 'https://advertising-api.jp.amazon.com' }
  }
};

/**
 * 解析店铺配置
 */
function parseStoresConfig(storesJson) {
  const defaultStores = [
    { 
      id: 'store_us', 
      name: '美国站 - Amazon.com', 
      marketplace: 'ATVPDKIKX0DER', 
      region: 'US', 
      currency: 'USD', 
      enabled: true,
      lingxingStoreId: ''
    },
    { 
      id: 'store_uk', 
      name: '英国站 - Amazon.co.uk', 
      marketplace: 'A1F83G8C2ARO7P', 
      region: 'UK', 
      currency: 'GBP', 
      enabled: false,
      lingxingStoreId: ''
    },
    { 
      id: 'store_de', 
      name: '德国站 - Amazon.de', 
      marketplace: 'A1PA6795UKMFR9', 
      region: 'DE', 
      currency: 'EUR', 
      enabled: false,
      lingxingStoreId: ''
    },
    { 
      id: 'store_jp', 
      name: '日本站 - Amazon.co.jp', 
      marketplace: 'A1VC38T7YXB528', 
      region: 'JP', 
      currency: 'JPY', 
      enabled: false,
      lingxingStoreId: ''
    }
  ];

  if (!storesJson) {
    return defaultStores;
  }

  try {
    const parsed = JSON.parse(storesJson);
    // 合并配置
    return defaultStores.map(store => {
      const custom = parsed.find(s => s.id === store.id);
      return custom ? { ...store, ...custom } : store;
    });
  } catch (e) {
    console.warn('STORES 配置解析失败，使用默认配置:', e.message);
    return defaultStores;
  }
}

/**
 * 根据店铺ID获取店铺信息
 */
export function getStore(storeId) {
  return config.stores.find(s => s.id === storeId);
}

/**
 * 获取启用的店铺列表
 */
export function getEnabledStores() {
  return config.stores.filter(s => s.enabled);
}

/**
 * 获取市场信息
 */
export function getMarketplace(marketplaceId) {
  return config.marketplaces[marketplaceId];
}

/**
 * 验证配置完整性
 */
export function validateConfig() {
  const errors = [];

  // 至少需要一个数据源
  if (!config.lingxing.enabled && !config.amazon.enabled) {
    errors.push('至少需要配置领星API或亚马逊API中的一个');
  }

  // 如果启用了AI，需要API Key
  if (config.ai.enabled && !config.ai.openaiApiKey) {
    errors.push('AI功能已启用但未配置 OpenAI API Key');
  }

  // 验证市场配置
  config.stores.forEach(store => {
    if (store.enabled && !config.marketplaces[store.marketplace]) {
      errors.push(`店铺 ${store.name} 的市场ID配置无效`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export default config;
