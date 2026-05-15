# WorkBuddy GitHub 上传完整教程

> 本教程覆盖 Git 安装 → 配置 → 上传 → 常见问题解决的全过程。

---

## 一、安装 Git（3种方法）

### 方法 A：使用批处理脚本（最简单）✅

1. 双击运行项目目录中的 `安装Git并上传到GitHub.bat`
2. 等待 Git 下载并安装
3. **安装完成后必须重启电脑**
4. 重启后再次运行 `安装Git并上传到GitHub.bat`
5. 按提示操作即可完成上传

### 方法 B：手动下载安装（推荐）✅

1. 访问：https://git-scm.com/download/win
2. 点击 **"64-bit Git for Windows Setup"** 下载
3. 运行安装包，**关键步骤**：
   - **Select Components**：全部保持默认
   - **Adjusting your PATH environment**：⚠️ 必须选择 **"Git from the command line and also from 3rd-party software"**
   - 其他全部保持默认，一路 Next
4. 安装完成后，**关闭所有 PowerShell/CMD 窗口**，再重新打开

### 方法 C：使用 winget（Windows 10/11）✅

以管理员身份打开 PowerShell，执行：
```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements
```
安装后重启 PowerShell。

---

## 二、验证 Git 安装成功

重新打开 PowerShell，执行：
```powershell
git --version
```
如果显示 `git version 2.x.x`，说明安装成功！

---

## 三、配置 Git 用户信息

在 PowerShell 中执行（**替换成您的信息**）：
```powershell
git config --global user.name "yangxiaoling1222-eng"
git config --global user.email "您的GitHub邮箱"
git config --global init.defaultBranch main
```

验证配置：
```powershell
git config --global --list
```

---

## 四、清理敏感信息（上传前必做！）

### ⚠️ 检查是否有 .env 文件
```powershell
# 查看项目根目录是否有 .env 文件
dir .env
```
- ✅ 如果有：确认 `.gitignore` 中已包含 `.env`
- ❌ 如果不在 .gitignore 中：立即添加，不要提交 `.env` 文件

### ⚠️ 搜索代码中的硬编码密钥
```powershell
# 搜索可能包含密钥的文件
Select-String -Path "server\**\*.js" -Pattern "apiKey|secret|password|token" -CaseSensitive:$false
```

如果代码中有硬编码的密钥，改为从环境变量读取：

**修改前（不要这样）：**
```javascript
const apiKey = "abc123def456";  // ❌ 硬编码
```

**修改后（正确做法）：**
```javascript
const apiKey = process.env.API_KEY;  // ✅ 从环境变量读取
```

---

## 五、上传代码到 GitHub

### 步骤 1：进入项目目录
```powershell
cd "c:\Users\93178\WorkBuddy\20260429095857"
```

### 步骤 2：初始化 Git 仓库
```powershell
git init
```

### 步骤 3：添加所有文件
```powershell
git add .
```

### 步骤 4：检查哪些文件会被提交（重要！）
```powershell
git status
```

**确认没有以下文件：**
- ❌ `.env`
- ❌ `node_modules/`
- ❌ `*.db` 或 `*.sqlite`
- ❌ 包含真实 API 密钥的文件

### 步骤 5：提交代码
```powershell
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
```

### 步骤 6：关联 GitHub 仓库
```powershell
git remote add origin https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git
```

### 步骤 7：推送到 GitHub
```powershell
git branch -M main
git push -u origin main
```

---

## 六、输入 GitHub 凭证

推送时会弹出登录框或要求输入用户名和密码：

### 如果使用浏览器登录（推荐）
1. 会自动打开浏览器
2. 登录 GitHub 账号
3. 点击 **"Authorize Git"** 授权
4. 完成！

### 如果要求输入用户名和密码
- **Username**：`yangxiaoling1222-eng`
- **Password**：⚠️ **不是登录密码！** 需要输入 **Personal Access Token**

#### 如何获取 Personal Access Token：

1. 登录 GitHub → 点击右上角头像 → **Settings**
2. 左侧菜单滚动到底部，点击 **Developer settings**
3. 点击 **Personal access tokens** → **Tokens (classic)**
4. 点击 **"Generate new token"** → **"Generate new token (classic)"**
5. 填写：
   - **Note**：`WorkBuddy 上传`
   - **Expiration**：选择 `90 days` 或 `No expiration`
   - **Select scopes**：勾选 `repo`（完整仓库权限）
6. 滚动到底部，点击 **"Generate token"**
7. **复制生成的 token**（只显示一次，务必保存好）

**推送时：**
- **Username**：`yangxiaoling1222-eng`
- **Password**：粘贴刚才复制的 **Personal Access Token**

---

## 七、验证上传结果

1. 打开 https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E
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
   - ❌ `*.db` 或 `*.sqlite`（不应该出现）

---

## 八、后续更新代码（日常推送）

每次修改代码后，执行以下命令推送更新：

```powershell
# 进入项目目录
cd "c:\Users\93178\WorkBuddy\20260429095857"

# 查看修改了哪些文件
git status

# 添加所有修改
git add .

# 提交（写上本次修改的说明）
git commit -m "描述本次修改内容"

# 推送到 GitHub
git push
```

---

## 九、常见问题

### Q1: `git: command not found`
**解决**：Git 未安装或未添加到 PATH，重新安装并选择 "Git from the command line and also from 3rd-party software"

### Q2: 推送时 `Authentication failed`
**解决**：密码栏应该填 **Personal Access Token**，不是登录密码

### Q3: 推送时 `! [rejected] main -> main (fetch first)`
**原因**：远程仓库有你本地没有的提交

**解决**：
```powershell
git pull
git push
```
如果弹出编辑器让你写合并信息，直接输入一行文字后保存退出即可。

### Q4: 不小心提交了 `.env` 文件
**立即执行**：
```powershell
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "移除敏感文件"
git push
```
**然后撤销该密钥！**

### Q5: `.gitignore` 不生效
**解决**：
```powershell
git rm -r --cached .
git add .
git commit -m "修复 .gitignore"
git push
```

---

## 十、快速命令汇总

```powershell
# 进入项目目录
cd "c:\Users\93178\WorkBuddy\20260429095857"

# 配置 Git
git config --global user.name "yangxiaoling1222-eng"
git config --global user.email "您的GitHub邮箱"
git config --global init.defaultBranch main

# 初始化并上传
git init
git add .
git status  # 检查文件
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
git remote add origin https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git
git branch -M main
git push -u origin main

# 日常更新
git add .
git commit -m "描述修改内容"
git push
```

---

## 安全清单

上传前确认：
- [ ] `.env` 文件不在 `git status` 列表中
- [ ] `node_modules/` 不在 `git status` 列表中
- [ ] 没有硬编码的 API 密钥
- [ ] GitHub 仓库设置为 **Private**

---

**祝您上传顺利！** 🚀

如有问题，请随时询问。😊
