# Git 上传快速操作清单

## ⚠️ 第一步：安装 Git（如果还没安装）

### 方法 A：下载安装包（最简单）
1. 访问：https://git-scm.com/download/win
2. 下载 "64-bit Git for Windows Setup"
3. 运行安装包，**关键步骤**：
   - **Adjusting your PATH environment**：选择 "Git from the command line and also from 3rd-party software" ⚠️ 必须选这个
   - 其他步骤全部保持默认，一路 Next
4. 安装完成后，**关闭所有 PowerShell/CMD 窗口**，再重新打开

### 方法 B：使用 winget（如果可用）
```powershell
winget install --id Git.Git -e --source winget
```

### 验证安装成功
重新打开 PowerShell，输入：
```powershell
git --version
```
如果显示 `git version x.x.x`，说明安装成功！

---

## 第二步：配置 Git 用户信息

打开 PowerShell，执行（替换成您的信息）：
```powershell
git config --global user.name "您的GitHub用户名"
git config --global user.email "您的GitHub邮箱"
git config --global init.defaultBranch main
```

验证配置：
```powershell
git config --global --list
```

---

## 第三步：在 GitHub 创建仓库

1. 登录 https://github.com/
2. 点击右上角 **"+"** → **"New repository"**
3. 填写：
   - **Repository name**: `workbuddy` （或您喜欢的名字）
   - **Description**: `亚马逊广告 AI 优化平台`
   - **Public/Private**: 选择 **Private**（推荐）
   - **不要勾选** "Add a README"、"Add .gitignore"、"Add license"
4. 点击 **"Create repository"**
5. **复制仓库 URL**（如 `https://github.com/用户名/仓库名.git`）

---

## 第四步：上传代码（自动化脚本）

### 选项 A：让我帮您执行命令
**请告诉我：**
1. 您的 GitHub 用户名
2. 仓库名（第三步创建的）
3. 是否需要我帮您执行命令

### 选项 B：您自己执行命令

打开 PowerShell，依次执行：

```powershell
# 1. 进入项目目录
cd "c:\Users\93178\WorkBuddy\20260429095857"

# 2. 初始化 Git 仓库
git init

# 3. 添加所有文件（.gitignore 会排除敏感文件）
git add .

# 4. 检查哪些文件会被提交（重要！）
git status

# 5. 如果确认没有敏感文件，提交
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"

# 6. 关联 GitHub 仓库（替换成您的 URL）
git remote add origin https://github.com/您的用户名/仓库名.git

# 7. 推送到 GitHub
git branch -M main
git push -u origin main
```

---

## 第五步：输入 GitHub 凭证

推送时会要求输入用户名和密码：

- **Username**: 输入您的 GitHub 用户名
- **Password**: ⚠️ **不是登录密码！** 需要输入 **Personal Access Token**

### 如何获取 Personal Access Token：

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
- **Username**: 您的 GitHub 用户名
- **Password**: 粘贴刚才复制的 **Personal Access Token**

---

## 第六步：验证上传结果

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
   - ❌ `*.db` 或 `*.sqlite`（不应该出现）

---

## 常见问题快速解决

### Q1: `git: command not found`
**解决**: Git 未安装或未添加到 PATH，重新安装 Git 并选择 "Git from the command line and also from 3rd-party software"

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

### Q4: `.gitignore` 不生效
**解决**:
```powershell
git rm -r --cached .
git add .
git commit -m "修复 .gitignore"
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

**准备好后，请告诉我您的 GitHub 用户名和仓库名，我可以帮您执行上传命令！** 🚀
