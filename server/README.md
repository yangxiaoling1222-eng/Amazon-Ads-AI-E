# 亚马逊广告AI专家平台 - 后端服务

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件，填入你的API密钥：

```env
# 领星ERP API
LINGXING_API_KEY=你的领星API密钥
LINGXING_API_SECRET=你的领星API密钥

# Amazon Ads API
AMAZON_CLIENT_ID=你的Client ID
AMAZON_CLIENT_SECRET=你的Client Secret
AMAZON_REFRESH_TOKEN=你的Refresh Token
```

### 3. 初始化数据库

```bash
npm run init-db
# 或直接运行
node scripts/init-db.js
```

### 4. 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

服务将在 http://localhost:3000 启动

---

## API 接口列表

### 健康检查
- `GET /health` - 服务状态

### 配置管理
- `GET /api/config` - 获取所有配置
- `POST /api/config` - 保存配置
- `POST /api/config/batch` - 批量保存配置

### 领星ERP API
- `GET /api/lingxing/test` - 测试连接
- `GET /api/lingxing/stores` - 获取店铺列表
- `GET /api/lingxing/campaigns` - 获取广告活动
- `POST /api/lingxing/report` - 获取广告报告
- `POST /api/lingxing/sync` - 同步广告数据

### Amazon Ads API
- `GET /api/amazon/test` - 测试连接
- `GET /api/amazon/profiles` - 获取广告账户
- `GET /api/amazon/campaigns` - 获取广告活动
- `GET /api/amazon/adgroups` - 获取广告组
- `GET /api/amazon/keywords` - 获取关键词
- `POST /api/amazon/report` - 生成报告

### 业务接口
- `GET /api/portfolios` - 获取广告组合列表
- `POST /api/portfolios` - 创建广告组合
- `PUT /api/portfolios/:id` - 更新广告组合
- `POST /api/portfolios/batch-assign` - 批量分配
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `GET /api/logs` - 获取操作日志
- `POST /api/logs` - 记录操作日志
- `GET /api/stats` - 获取统计数据

---

## 测试API连接

启动服务后，可以测试API连接：

```bash
# 测试领星API
curl http://localhost:3000/api/lingxing/test

# 测试Amazon Ads API
curl http://localhost:3000/api/amazon/test
```

---

## 目录结构

```
server/
├── server.js              # 主入口
├── package.json           # 依赖配置
├── .env                   # 环境变量（需创建）
├── config/
│   └── database.js        # 数据库配置
├── services/
│   ├── lingxing.js        # 领星ERP API服务
│   └── amazon-ads.js      # Amazon Ads API服务
├── routes/
│   ├── api.js             # 业务接口
│   ├── config.js          # 配置接口
│   ├── lingxing.js        # 领星路由
│   └── amazon.js          # Amazon路由
├── scripts/
│   └── init-db.js         # 数据库初始化脚本
└── data/                  # SQLite数据库文件（自动创建）
```
