# Git 安装与 GitHub 上传详细教程

## 📋 目录
1. [问题诊断](#问题诊断)
2. [安装 Git](#安装-git)
3. [配置 Git](#配置-git)
4. [GitHub 上传步骤](#github-上传步骤)
5. [图解说明](#图解说明)

---

## 问题诊断

### 您遇到的问题
```
git : 无法将"git"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

### 问题原因
1. **Git 未安装**
2. **Git 已安装，但未添加到系统 PATH 环境变量**

---

## 安装 Git

### 方法一：下载安装包（推荐新手）

#### 步骤 1：下载 Git
1. 访问 Git 官网：https://git-scm.com/download/win
2. 会自动下载 **64-bit Git for Windows Setup**
3. 如果下载慢，可以用国内镜像：
   - 腾讯云镜像：https://mirrors.cloud.tencent.com/git-for-windows/
   - 选择最新版本的 `Git-x.x.x-64-bit.exe`

#### 步骤 2：安装 Git（重要：每一步怎么选）

运行下载好的 `Git-x.x.x-64-bit.exe`，按照以下步骤：

| 安装界面 | 选项 | 说明 |
|---------|------|------|
| **Information** | 直接点 **Next** | 欢迎界面 |
| **Select Components** | 保持默认，**全部勾选** | 包括"Additional icons"、"Windows Explorer integration"等 |
| **Choosing the default editor** | 选择 **Use Visual Studio Code as Git's default editor**（如果已安装 VSCode）<br/>或选择 **Use Notepad as Git's default editor** | 选择默认编辑器 |
| **Adjusting the name of the initial branch** | 选择 **Let Git decide** | 默认分支名 |
| **Adjusting your PATH environment** | ⚠️ **必须选择 "Git from the command line and also from 3rd-party software"** | **最重要的一步！** 这会把 Git 添加到 PATH |
| **Choosing the SSH executable** | 选择 **Use OpenSSH** | 使用内置 SSH |
| **Choosing HTTPS library** | 选择 **Use the OpenSSL library** | HTTPS 证书验证 |
| **Configuring line ending conversions** | 选择 **Checkout Windows-style, commit Unix-style line endings** | 换行符转换 |
| **Configuring the terminal emulator** | 选择 **Use MinTTY (the default terminal of MSYS2)** | 终端模拟器 |
| **Choose the default behavior of `git pull`** | 选择 **Default (fast-forward or merge)** | pull 默认行为 |
| **Choose a credential helper** | 选择 **Git Credential Manager Core** | 凭证管理 |
| **Configuring extra options** | 勾选 **Enable file system caching**<br/>勾选 **Enable symbolic links** | 额外选项 |
| **Configuring experimental options** | **不勾选** 任何选项 | 实验性功能 |

#### 步骤 3：验证安装
安装完成后：
1. **关闭所有 PowerShell/CMD 窗口**（重要！）
2. 重新打开 PowerShell
3. 输入：
```powershell
git --version
```
4. 如果显示 `git version x.x.x`，说明安装成功！

---

### 方法二：使用命令安装（如果您有 winget）

```powershell
# 使用 Windows 包管理器安装 Git
winget install --id Git.Git -e --source winget
```

安装后同样需要**重启 PowerShell**。

---

## 配置 Git

### 1. 配置用户信息
打开 PowerShell，执行：
```powershell
# 替换成您的 GitHub 用户名和邮箱
git config --global user.name "您的GitHub用户名"
git config --global user.email "您的GitHub邮箱"

# 查看配置是否成功
git config --global --list
```

### 2. 配置默认分支名
```powershell
git config --global init.defaultBranch main
```

---

## GitHub 上传步骤

### 步骤 1：在 GitHub 创建新仓库

1. 登录 GitHub：https://github.com/
2. 点击右上角 **"+"** 按钮 → 选择 **"New repository"**

**填写信息（每一步都说明）：**

| 字段 | 填写内容 | 图解 |
|------|----------|------|
| **Repository name** | `workbuddy` 或 `amazon-ads-ai` | 仓库名称，只能用英文、数字、横杠 |
| **Description** | `亚马逊广告 AI 优化平台` | 可选，仓库描述 |
| **Public / Private** | 选择 **Private** | 推荐私有，避免代码泄露 |
| **Add a README file** | ❌ **不勾选** | 我们已有 README.md |
| **Add .gitignore** | ❌ **不勾选** | 我们已有 .gitignore |
| **Choose a license** | ❌ **不勾选** | 后续可添加 |

3. 点击 **"Create repository"** 按钮
4. **不要关闭页面！** 下一步需要用到这个页面的 URL

---

### 步骤 2：初始化本地 Git 仓库

打开 PowerShell，进入项目目录：
```powershell
cd "c:\Users\93178\WorkBuddy\20260429095857"
```

初始化 Git 仓库：
```powershell
git init
```

---

### 步骤 3：添加文件到 Git

添加所有文件（`.gitignore` 中排除的文件不会被添加）：
```powershell
git add .
```

**⚠️ 重要：检查哪些文件会被提交**
```powershell
git status
```

**检查输出中是否包含以下敏感文件：**
- ❌ `.env` - 不应该出现（如有，检查 `.gitignore`）
- ❌ `node_modules/` - 不应该出现
- ❌ `*.db` 或 `*.sqlite` - 不应该出现
- ❌ `系统简介.md` - 已加入 `.gitignore`，不应出现

**如果发现了敏感文件：**
1. 检查 `.gitignore` 文件是否正确
2. 手动将文件添加到 `.gitignore`：
```powershell
echo ".env" >> .gitignore
echo "*.db" >> .gitignore
git rm --cached .env  # 如果已经添加了
```

---

### 步骤 4：提交代码

```powershell
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
```

**如果遇到错误：`Please tell me who you are`**
说明 Git 用户信息未配置，执行：
```powershell
git config --global user.name "您的用户名"
git config --global user.email "您的邮箱"
```
然后重新执行 `git commit`。

---

### 步骤 5：关联 GitHub 远程仓库

**复制 GitHub 仓库的 URL：**
- 在刚创建的 GitHub 仓库页面，点击 **"SSH"** 或 **"HTTPS"** 按钮
- 复制 URL，格式如：
  - HTTPS：`https://github.com/用户名/仓库名.git`
  - SSH：`[email address removed]:用户名/仓库名.git`（需要配置 SSH key）

**关联远程仓库：**
```powershell
# 如果使用 HTTPS（推荐新手）
git remote add origin https://github.com/您的用户名/仓库名.git

# 如果使用 SSH
git remote add origin [email address removed]:您的用户名/仓库名.git
```

**验证关联是否成功：**
```powershell
git remote -v
```
应该显示：
```
origin  https://github.com/用户名/仓库名.git (fetch)
origin  https://github.com/用户名/仓库名.git (push)
```

---

### 步骤 6：推送到 GitHub

```powershell
git branch -M main
git push -u origin main
```

**首次推送会要求输入 GitHub 凭证：**

#### 如果使用 HTTPS（推荐）
1. **Username**：输入您的 GitHub 用户名
2. **Password**：
   - ⚠️ **不是登录密码！**
   - 需要输入 **Personal Access Token**
   - 如何获取 Token 见下方说明

#### 如何获取 Personal Access Token（重要！）

1. 登录 GitHub → 点击右上角头像 → **Settings**
2. 左侧菜单滚动到底部，找到 **Developer settings**
3. 点击 **Personal access tokens** → **Tokens (classic)**
4. 点击 **"Generate new token"** → **"Generate new token (classic)"**
5. **填写信息：**
   - **Note**：`WorkBuddy 上传` （随便写，用来识别这个 token）
   - **Expiration**：选择 `90 days` 或 `No expiration`（不过期）
   - **Select scopes**：勾选 `repo`（完整仓库权限）
6. 滚动到底部，点击 **"Generate token"**
7. **复制生成的 token**（只显示一次！一定要复制保存）

#### 推送时输入凭证
- **Username**：您的 GitHub 用户名
- **Password**：粘贴刚才复制的 **Personal Access Token**

---

### 步骤 7：验证上传结果

1. 打开 GitHub 仓库页面
2. 确认以下文件 **已上传**：
   - ✅ `README.md`
   - ✅ `package.json`
   - ✅ `server/` 目录
   - ✅ `public/` 目录
   - ✅ `.gitignore`
   - ✅ `.env.example`
   - ✅ `系统简介.md`（如果希望公开）

3. 确认以下文件 **未上传**：
   - ❌ `.env`（不应该出现在仓库中）
   - ❌ `node_modules/`（不应该出现）
   - ❌ `*.db` 或 `*.sqlite`（不应该出现）
   - ❌ 包含真实 API 密钥的文件

---

## 图解说明

### 图解 1：GitHub 创建仓库页面
```
┌─────────────────────────────────────────┐
│ Create a new repository                 │
├─────────────────────────────────────────┤
│ Repository name: [workbuddy          ]  │
│ Description:    [亚马逊广告 AI 优化平台 ]│
│                                         │
│ ○ Public                               │
│ ● Private  ← 推荐选择私有              │
│                                         │
│ ☐ Add a README file  ← 不勾选         │
│ ☐ Add .gitignore  ← 不勾选             │
│ ☐ Choose a license  ← 不勾选           │
│                                         │
│ [ Create repository ] ← 点击此按钮     │
└─────────────────────────────────────────┘
```

### 图解 2：Git 安装 - PATH 配置（最重要！）
```
┌─────────────────────────────────────────┐
│ Adjusting your PATH environment         │
├─────────────────────────────────────────┤
│ ○ Use Git from Git Bash only           │
│   (不推荐，只能从 Git Bash 使用)        │
│                                         │
│ ○ Use Git from the command line and     │
│   also from 3rd-party software  ← 选这个│
│   (推荐！添加到系统 PATH)                │
│                                         │
│ ○ Use Git and optional Unix tools       │
│   from the Command Prompt               │
│   (不推荐，可能覆盖系统工具)             │
│                                         │
│ [ Next > ]                             │
└─────────────────────────────────────────┘
```

### 图解 3：Personal Access Token 生成页面
```
┌─────────────────────────────────────────┐
│ Generate new token (classic)            │
├─────────────────────────────────────────┤
│ Note: [WorkBuddy 上传                ]  │
│ Expiration: [No expiration        ▼]   │
│                                         │
│ Select scopes:                          │
│ ☑ repo      ← 必须勾选                 │
│    ☑ repo:status                        │
│    ☑ repo_deployment                    │
│    ☑ public_repo                        │
│    ☑ repo:invite                       │
│    ☑ security_events                    │
│ ☐ workflow                              │
│ ☐ write:packages                        │
│ ...                                     │
│                                         │
│ [ Generate token ] ← 滚动到底部点击    │
└─────────────────────────────────────────┘
```

---

## 常见问题与解决方法

### Q1：git command not found（git 命令找不到）
**原因**：Git 未安装或未添加到 PATH

**解决方法**：
1. 重新安装 Git，确保选择 "Git from the command line and also from 3rd-party software"
2. 安装后**重启 PowerShell**
3. 如果还不行，手动添加 Git 到 PATH：
   - 打开"系统属性" → "高级" → "环境变量"
   - 在"系统变量"中找到 `Path`，点击"编辑"
   - 点击"新建"，添加 Git 安装路径（如 `C:\Program Files\Git\cmd`）
   - 确定保存后重启 PowerShell

### Q2：推送时提示 "Authentication failed"
**原因**：使用了错误的密码（应该使用 Personal Access Token）

**解决方法**：
1. 按照上述步骤生成 Personal Access Token
2. 推送时，密码栏粘贴 token（不是登录密码）

### Q3：不小心提交了敏感文件（如 .env）怎么办？
**立即执行以下操作：**

1. **从 Git 索引中删除文件（保留本地文件）：**
```powershell
git rm --cached .env
git commit -m "移除敏感文件 .env"
git push
```

2. **撤销密钥/密码：**
   - 如果提交了 AWS/Amazon API 密钥：立即到 AWS 控制台撤销
   - 如果提交了 GitHub Token：到 GitHub Settings 删除该 token
   - 如果提交了数据库密码：立即修改数据库密码

3. **清理 Git 历史（高级操作）：**
```powershell
# 使用 BFG Repo-Cleaner 工具清理敏感数据
# 下载地址：<ADDRESS_REMOVED>
java -jar bfg.jar --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

### Q4：如何修改已提交的敏感信息？
**推荐做法：**
1. 立即撤销该密钥/密码
2. 修改代码，使用环境变量
3. 强制推送覆盖历史（慎用，会改写历史）：
```powershell
# 修改代码后
git add .
git commit -m "移除硬编码密钥"
git push --force
```

### Q5：.gitignore 不生效怎么办？
**原因**：文件已经被提交过，`.gitignore` 不会忽略已跟踪的文件

**解决方法：**
```powershell
# 从 Git 索引中移除所有文件，但保留本地文件
git rm -r --cached .
git add .
git commit -m "修复 .gitignore"
git push
```

---

## 安全建议

### ✅ 推荐做法
1. **永远不要提交 `.env` 文件**
2. **使用 `.env.example` 作为模板**（我们已创建）
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

### 1. 添加 LICENSE 文件（如果想开源）
```powershell
echo "MIT License" > LICENSE
# 然后把 LICENSE 内容填充完整
git add LICENSE
git commit -m "添加 MIT 许可证"
git push
```

### 2. 创建 .gitattributes 文件（可选，统一换行符）
```powershell
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
   - Name: `OPENROUTER_API_KEY` | Value: `您的 OpenRouter API Key`
   - Name: `AMAZON_CLIENT_ID` | Value: `您的 Amazon Client ID`
   - Name: `AMAZON_CLIENT_SECRET` | Value: `您的 Amazon Client Secret`
   - 其他敏感配置...

---

## 总结检查清单

上传前请确认：
- [ ] ✅ 已安装 Git 并添加到 PATH
- [ ] ✅ 已配置 Git 用户信息（`git config --global user.name/email`）
- [ ] ✅ 已创建 `.env.example` 文件
- [ ] ✅ `.gitignore` 包含所有敏感文件
- [ ] ✅ 使用 `git status` 检查待提交文件，无敏感文件
- [ ] ✅ GitHub 仓库设置为 Private
- [ ] ✅ 已生成 Personal Access Token

上传后请确认：
- [ ] ✅ GitHub 仓库中无敏感文件
- [ ] ✅ `.env` 文件未出现在仓库中
- [ ] ✅ 本地代码运行正常（使用 `.env` 中的配置）

---

## 快速命令汇总

```powershell
# 1. 进入项目目录
cd "c:\Users\93178\WorkBuddy\20260429095857"

# 2. 初始化 Git
git init

# 3. 添加文件
git add .

# 4. 提交
git commit -m "初始提交"

# 5. 关联远程仓库（替换成您的 GitHub 用户名和仓库名）
git remote add origin https://github.com/用户名/仓库名.git

# 6. 推送
git branch -M main
git push -u origin main
```

---

**祝您上传顺利！** 🚀

如有任何问题，请随时询问。
