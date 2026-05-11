# 亚马逊广告 AI 智能专家
> 深度集成 AI 能力的广告管理平台

## 核心功能

### 1. 多维度数据对接
- **领星 ERP 集成**：通过领星开发者 API 同步全量广告数据
- **亚马逊 Direct API**：直连亚马逊广告 API，支持 LWA 验证

### 2. AI 指令中心
- 自然语言查询广告数据
- 自动化报表生成
- 智能诊断与建议

### 3. 广告自动驾驶
- 目标 ACOS 锚点设定
- 小时级广告表现监控
- 闭环自动调价执行

### 4. 智能分析引擎
- 历史数据趋势分析
- 三级优先级建议体系
- 一键执行优化操作

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境配置
cp .env.example .env
# 编辑 .env 填入你的 API 凭证

# 启动开发服务器
npm run dev

# 启动自动调价调度器
npm run auto-bid
```

## 项目结构

```
src/
├── config/          # 配置文件
├── services/        # 核心服务
│   ├── lingxing/    # 领星 ERP API
│   └── amazon/      # 亚马逊广告 API
├── automation/      # 自动驾驶模块
├── ai/             # AI 指令中心
├── analysis/       # 分析引擎
├── api/            # API 路由
└── utils/          # 工具函数
```

## API 端点

- `POST /api/connect/test` - 测试连接
- `GET /api/campaigns` - 获取广告活动列表
- `GET /api/ai/query` - AI 自然语言查询
- `POST /api/automation/set-target` - 设置 ACOS 目标
- `GET /api/suggestions` - 获取优化建议

## License

MIT
