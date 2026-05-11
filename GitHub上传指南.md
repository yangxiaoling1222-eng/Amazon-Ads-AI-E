# GitHub 上传指南 - WorkBuddy 项目

## 📋 目录
1. [准备工作](#准备工作)
2. [清理敏感信息](#清理敏感信息)
3. [GitHub 上传步骤](#github-上传步骤)
4. [常见问题](#常见问题)

---

## 准备工作

### 1. 安装 Git
如果还没有安装 Git，请先安装：
- 下载地址：<ADDRESS_REMOVED>
- 安装时选择默认选项即可

### 2. 配置 Git 用户信息
打开命令行（PowerShell 或 CMD），执行：
```bash
git config --global user.name "您的GitHub用户名"
git config --global user.email "您的GitHub邮箱"
```

---

## 清理敏感信息

### ⚠️ 重要：在上传前必须清理以下信息

#### 1. 检查是否有 .env 文件
```bash
# 查看项目根目录是否有 .env 文件
dir .env
```
- ✅ **如果有**：确认 `.gitignore` 中已包含 `.env`（已完成）
- ❌ **如果不在 .gitignore 中**：立即添加，不要提交 `.env` 文件

#### 2. 搜索代码中的硬编码密钥
在项目中搜索以下关键词，如果发现硬编码的密钥，需要替换为环境变量：

**需要检查的关键词：**
- `apiKey`
- `api_key`
- `secret`
- `password`
- `token`
- `AKLT` (腾讯云密钥前缀)
- `SK` (腾讯云密钥前缀)

**搜索命令（PowerShell）：**
```powershell
# 搜索可能包含密钥的文件
Select-String -Path "server\**\*.js" -Pattern "apiKey|secret|password|token" -CaseSensitive:$false
```

#### 3. 清理方法

**方法 A：使用环境变量（推荐）**

如果代码中有硬编码的密钥，改为从环境变量读取：

**修改前（不要这样）：**
```javascript
const apiKey = "abc123def456";  // ❌ 硬编码
```

**修改后（正确做法）：**
```javascript
const apiKey = process.env.API_KEY;  // ✅ 从环境变量读取
```

**方法 B：使用配置文件模板**

创建 `.env.example` 文件（已完成），真实的 `.env` 文件不提交。

---

## GitHub 上传步骤

### 步骤 1：在 GitHub 创建新仓库

1. 登录 GitHub：https://github.com/
2. 点击右上角 **"+"** 按钮 → 选择 **"New repository"**
3. **填写仓库信息：**

| 字段 | 填写内容 | 说明 |
|------|----------|------|
| **Repository name** | `workbuddy` 或 `amazon-ads-ai` | 仓库名称，只能用英文、数字、横杠 |
| **Description** | `亚马逊广告 AI 优化平台` | 可选，仓库描述 |
| **Public/Private** | 选择 **Private** | 推荐私有，避免代码泄露 |
| **Add a README** | ❌ 不勾选 | 我们已有 README.md |
| **Add .gitignore** | ❌ 不勾选 | 我们已有 .gitignore |
| **Add license** | ❌ 不勾选 | 后续可添加 |

4. 点击 **"Create repository"** 按钮

### 步骤 2：初始化本地 Git 仓库

打开 PowerShell，进入项目目录：
```bash
cd c:\Users\93178\WorkBuddy\20260429095857
```

初始化 Git 仓库：
```bash
git init
```

### 步骤 3：添加文件到 Git

添加所有文件（`.gitignore` 中排除的文件不会被添加）：
```bash
git add .
```

**检查哪些文件会被提交：**
```bash
git status
```

**重要：检查输出中是否包含以下敏感文件：**
- ❌ `.env` - 不应该出现
- ❌ `*.db` - 数据库文件不应该出现
- ❌ `node_modules/` - 不应该出现
- ❌ 包含密钥的配置文件

如果发现了敏感文件，立即检查 `.gitignore` 配置。

### 步骤 4：提交代码

```bash
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
```

### 步骤 5：关联 GitHub 远程仓库

**复制 GitHub 仓库地址：**
- HTTPS 格式：`https://github.com/您的用户名/仓库名.git`
- SSH 格式：`[email address removed]:您的用户名/仓库名.git`（需要配置 SSH key）

**关联远程仓库：**
```bash
git remote add origin https://github.com/您的用户名/仓库名.git
```

### 步骤 6：推送到 GitHub

```bash
git branch -M main
git push -u origin main
```

**首次推送会要求输入 GitHub 用户名和密码：**
- **Username**：输入您的 GitHub 用户名
- **Password**：输入 **Personal Access Token**（不是登录密码！）

**如何获取 Personal Access Token：**
1. 登录 GitHub → 点击右上角头像 → **Settings**
2. 左侧菜单找到 **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. 点击 **"Generate new token"** → **"Generate new token (classic)"**
4. **填写信息：**
   - **Note**：`WorkBuddy 上传`
   - **Expiration**：选择 `90 days` 或 `No expiration`
   - **Select scopes**：勾选 `repo`（完整仓库权限）
5. 点击 **"Generate token"**
6. **复制生成的 token**（只显示一次！）

---

## 验证上传结果

1. 打开 GitHub 仓库页面
2. 确认以下文件 **已上传**：
   - ✅ `README.md`
   - ✅ `package.json`
   - ✅ `server/` 目录
   - ✅ `public/` 目录
   - ✅ `.gitignore`
   - ✅ `.env.example`

3. 确认以下文件 **未上传**：
   - ❌ `.env`（不应该出现）
   - ❌ `node_modules/`（不应该出现）
   - ❌ `*.db`（不应该出现）
   - ❌ 包含真实 API 密钥的文件

---

## 常见问题

### Q1：推送时提示 "Authentication failed"
**原因**：使用了错误的密码（应该使用 Personal Access Token）

**解决方法**：
1. 按照上述步骤生成 Personal Access Token
2. 推送时，密码栏粘贴 token

### Q2：不小心提交了敏感文件怎么办？
**立即执行以下操作：**

1. **从 Git 历史中删除文件：**
```bash
git rm --cached .env
git commit -m "移除敏感文件"
git push
```

2. **撤销密钥：**
   - 如果提交了 AWS/Amazon API 密钥：立即到 AWS 控制台撤销
   - 如果提交了 GitHub Token：到 GitHub Settings 删除该 token
   - 如果提交了数据库密码：立即修改数据库密码

3. **清理 Git 历史（高级操作）：**
```bash
# 使用 BFG Repo-Cleaner 工具清理敏感数据
# 下载地址：<ADDRESS_REMOVED>
java -jar bfg.jar --delete-files .env
```

### Q3：如何修改已提交的敏感信息？
**推荐做法：**
1. 立即撤销该密钥/密码
2. 修改代码，使用环境变量
3. 强制推送覆盖历史（慎用，会改写历史）：
```bash
git push --force
```

### Q4：.gitignore 不生效怎么办？
**原因**：文件已经被提交过，`.gitignore` 不会忽略已跟踪的文件

**解决方法：**
```bash
# 从 Git 索引中移除文件，但保留本地文件
git rm -r --cached .
git add .
git commit -m "修复 .gitignore"
```

---

## 安全建议

### ✅ 推荐做法
1. **永远不要提交 `.env` 文件**
2. **使用 `.env.example` 作为模板**（已完成）
3. **定期轮换 API 密钥**
4. **使用私有仓库**（Private Repository）
5. **启用 GitHub 两因素认证（2FA）**

### ❌ 禁止做法
1. ❌ 在代码中硬编码密钥
2. ❌ 提交包含密钥的配置文件
3. ❌ 使用公开仓库存储敏感信息
4. ❌ 将数据库文件提交到 Git

---

## 后续操作

### 1. 添加 LICENSE 文件
如果想开源项目，可以在 GitHub 添加 MIT License：
```bash
echo "MIT License" > LICENSE
git add LICENSE
git commit -m "添加 MIT 许可证"
git push
```

### 2. 创建 .gitattributes 文件（可选）
统一换行符格式：
```bash
echo "* text=auto" > .gitattributes
git add .gitattributes
git commit -m "添加 .gitattributes"
git push
```

### 3. 设置 GitHub Secrets（用于 CI/CD）
如果配置了 GitHub Actions，需要添加 Secrets：
1. 进入仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **"New repository secret"**
3. 添加以下 secrets：
   - `OPENROUTER_API_KEY`
   - `AMAZON_CLIENT_ID`
   - `AMAZON_CLIENT_SECRET`
   - 其他敏感配置

---

## 总结检查清单

上传前请确认：
- [ ] ✅ 已创建 `.env.example` 文件
- [ ] ✅ `.gitignore` 包含所有敏感文件
- [ ] ✅ 代码中无硬编码密钥
- [ ] ✅ 使用 `git status` 检查待提交文件
- [ ] ✅ GitHub 仓库设置为 Private
- [ ] ✅ 已生成 Personal Access Token

上传后请确认：
- [ ] ✅ GitHub 仓库中无敏感文件
- [ ] ✅ `.env` 文件未出现在仓库中
- [ ] ✅ 本地代码运行正常（使用 `.env` 中的配置）

---

**祝您上传顺利！** 🚀

如有问题，请随时询问。
