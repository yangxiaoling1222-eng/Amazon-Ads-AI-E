# Git 安装与代码上传指南

## 您的 GitHub 仓库信息
- **仓库 URL**: `https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git`
- **用户名**: `yangxiaoling1222-eng`
- **仓库名**: `Amazon-Ads-AI-E`

---

## 第一步：安装 Git（3种方法）

### 方法 A：使用我创建的批处理脚本（最简单）✅

1. 双击运行项目目录中的 `安装Git并上传到GitHub.bat`
2. 等待 Git 下载并安装
3. **安装完成后必须重启电脑**
4. 重启后再次运行 `安装Git并上传到GitHub.bat`
5. 按提示操作即可完成上传

### 方法 B：手动下载安装（推荐）✅

1. 访问：https://git-scm.com/download/win
2. 点击 "64-bit Git for Windows Setup" 下载
3. 运行安装包，**关键步骤**：
   - **Select Components**: 全部保持默认
   - **Adjusting your PATH environment**: ⚠️ 必须选择 **"Git from the command line and also from 3rd-party software"**
   - 其他全部保持默认，一路 Next
4. 安装完成后，**关闭所有 PowerShell/CMD 窗口**，再重新打开

### 方法 C：使用 winget（Windows 10/11）✅

以管理员身份打开 PowerShell，执行：
```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements
```
安装后重启 PowerShell。

---

## 第二步：验证 Git 安装成功

重新打开 PowerShell，执行：
```powershell
git --version
```
如果显示 `git version 2.x.x`，说明安装成功！

---

## 第三步：配置 Git 用户信息

在 PowerShell 中执行（替换成您的信息）：
```powershell
git config --global user.name "yangxiaoling1222-eng"
git config --global user.email "[email address removed]"
git config --global init.defaultBranch main
```

验证配置：
```powershell
git config --global --list
```

---

## 第四步：上传代码到 GitHub

打开 PowerShell，进入项目目录：
```powershell
cd "c:\Users\93178\WorkBuddy\20260429095857"
```

### 1. 初始化 Git 仓库
```powershell
git init
```

### 2. 添加所有文件
```powershell
git add .
```

### 3. 检查哪些文件会被提交（重要！）
```powershell
git status
```
**确认没有以下文件：**
- ❌ `.env`
- ❌ `node_modules/`
- ❌ `*.db` 或 `*.sqlite`

### 4. 提交代码
```powershell
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
```

### 5. 关联 GitHub 仓库
```powershell
git remote add origin https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git
```

### 6. 推送到 GitHub
```powershell
git branch -M main
git push -u origin main
```

---

## 第五步：输入 GitHub 凭证

推送时会弹出登录框或要求输入用户名和密码：

### 如果使用浏览器登录（推荐）
1. 会自动打开浏览器
2. 登录 GitHub 账号
3. 点击 "Authorize Git" 授权
4. 完成！

### 如果要求输入用户名和密码
- **Username**: `yangxiaoling1222-eng`
- **Password**: ⚠️ **不是登录密码！** 需要输入 **Personal Access Token**

#### 如何获取 Personal Access Token：

1. 登录 GitHub → 点击右上角头像 → **Settings**
2. 左侧菜单滚动到底部，点击 **Developer settings**
3. 点击 **Personal access tokens** → **Tokens (classic)**
4. 点击 **"Generate new token"** → **"Generate new token (classic)"**
5. 填写：
   - **Note**: `WorkBuddy 上传`
   - **Expiration**: 选择 `90 days` 或 `No expiration`
   - **Select scopes**: 勾选 `repo`（完整仓库权限）
6. 滚动到底部，点击 **"Generate token"**
7. **复制生成的 token**（只显示一次，务必保存好）

**推送时：**
- **Username**: `yangxiaoling1222-eng`
- **Password**: 粘贴刚才复制的 **Personal Access Token**

---

## 第六步：验证上传结果

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

## 常见问题

### Q1: `git: command not found`
**解决**: Git 未安装或未添加到 PATH，重新安装并选择 "Git from the command line and also from 3rd-party software"

### Q2: 推送时 `Authentication failed`
**解决**: 密码栏应该填 **Personal Access Token**，不是登录密码

### Q3: 不小心提交了 `.env` 文件
**立即执行**:
```powershell
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "移除敏感文件"
git push
```
**然后撤销该密钥！**

---

## 快速命令汇总（安装 Git 后执行）

```powershell
# 进入项目目录
cd "c:\Users\93178\WorkBuddy\20260429095857"

# 配置 Git
git config --global user.name "yangxiaoling1222-eng"
git config --global user.email "[email address removed]"
git config --global init.defaultBranch main

# 初始化并上传
git init
git add .
git status  # 检查文件
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
git remote add origin https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git
git branch -M main
git push -u origin main
```

---

## 需要帮助？

如果您在安装或上传过程中遇到任何问题，请告诉我：
1. 错误信息截图或文字
2. 当前执行到哪一步

我会帮您解决！😊

---

**祝您上传顺利！** 🚀
