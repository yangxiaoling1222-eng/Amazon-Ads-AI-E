# WorkBuddy GitHub 上传完整教程

> 本教程基于 2026-05-11 成功上传路径，针对您项目中容易出错的地方做了特别提醒。

---

## 目录

1. [环境准备](#1-环境准备)
2. [首次上传（新建仓库）](#2-首次上传新建仓库)
3. [后续更新代码](#3-后续更新代码)
4. [常见问题与解决](#4-常见问题与解决)

---

## 1. 环境准备

### 1.1 确认已安装 Git

打开 **Git Bash**（不是 PowerShell），输入：

```bash
git --version
```

**成功标志**：显示 `git version 2.x.x.windows.x`

---

### 1.2 确认项目目录

在 Git Bash 中，进入项目目录：

```bash
cd /c/Users/93178/WorkBuddy/20260429095857
pwd
```

**成功标志**：显示 `/c/Users/93178/WorkBuddy/20260429095857`

---

### 1.3 确认 SSH Key 已配置（只需做一次）

检查是否已有 SSH Key：

```bash
cat ~/.ssh/id_ed25519.pub
```

**如果有输出**（以 `ssh-ed25519` 开头）→ 跳过 1.4，直接进入第 2 步

**如果没有输出**（报错 `No such file or directory`）→ 执行 1.4

---

### 1.4 生成 SSH Key（只需做一次）

⚠️ **关键点**：每个命令单独输入，不要合并成一行！

**第1步：生成密钥**
```bash
ssh-keygen -t ed25519 -C "yangxiaoling1222-eng@github"
```
按回车3次（确认路径 → 空密码 → 确认空密码）

**第2步：查看公钥**
```bash
cat ~/.ssh/id_ed25519.pub
```

复制输出的公钥（以 `ssh-ed25519` 开头），然后：

1. 打开：https://github.com/settings/keys
2. 点击 **New SSH key**
3. **Title**：`WorkBuddy`
4. **Key**：粘贴公钥
5. 点击 **Add SSH key**

---

## 2. 首次上传（新建仓库）

> 假设您的 GitHub 仓库地址是：
> `https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git`

⚠️ **本项目的敏感文件保护**：
- `.env` 文件不会被上传（已在 `.gitignore` 中）
- 数据库文件不会被上传
- `.workbuddy` 目录不会被上传

---

### 步骤 1：进入项目目录

```bash
cd /c/Users/93178/WorkBuddy/20260429095857
```

---

### 步骤 2：初始化 Git 仓库（只需做一次）

```bash
git init
```

---

### 步骤 3：配置用户信息（只需做一次）

⚠️ **重要**：必须先进入项目目录后再执行，否则可能提交到错误的位置。

```bash
git config user.name "yangxiaoling1222-eng"
git config user.email "[email address removed]"
```

---

### 步骤 4：添加所有文件到暂存区

```bash
git add .
```

---

### 步骤 5：检查要提交的文件（重要！）

```bash
git status
```

**检查要点**：
- ✅ 应该看到绿色的 `new file:` 列出一堆文件
- ❌ **不应该**看到 `.env`、`*.db`、`node_modules/` 等敏感文件
- 如果看到敏感文件，按 `Ctrl + C` 取消，然后检查 `.gitignore` 配置

---

### 步骤 6：提交代码

```bash
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"
```

---

### 步骤 7：关联 GitHub 仓库（只需做一次）

```bash
git remote remove origin 2>/dev/null
git remote add origin git@github.com:yangxiaoling1222-eng/Amazon-Ads-AI-E.git
```

⚠️ **必须使用 SSH 地址**，不要用 HTTPS！

---

### 步骤 8：推送到 GitHub

```bash
git branch -M main
git push -u origin main
```

---

### 步骤 9：确认 SSH 连接

⚠️ **关键点**：第一次推送时会询问：

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

**必须输入 `yes`**，不能按回车跳过！

---

### 步骤 10：验证成功

打开浏览器，访问：
```
https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E
```

应该能看到所有代码文件。

---

## 3. 后续更新代码

> 如果代码已有 Git 仓库，只需执行以下步骤更新

---

### 步骤 1：进入项目目录

```bash
cd /c/Users/93178/WorkBuddy/20260429095857
```

---

### 步骤 2：添加修改的文件

```bash
git add .
```

---

### 步骤 3：检查修改内容

```bash
git status
```

应该看到 `modified:` 列出发修改的文件。

---

### 步骤 4：提交修改

```bash
git commit -m "提交说明：本次修改了什么"
```

---

### 步骤 5：推送到 GitHub

```bash
git push
```

---

## 4. 常见问题与解决

---

### ❌ 问题1：`git 不是内部或外部命令`

**原因**：Git 未安装或未添加到 PATH

**解决**：
1. 重新安装 Git：https://git-scm.com/download/win
2. 安装时选择 **"Git from the command line and also from 3rd-party software"**
3. 或者使用 **Git Bash**（自带 Git）

---

### ❌ 问题2：`git: command not found`

**解决**：关闭所有终端窗口，重新打开 Git Bash

---

### ❌ 问题3：`nothing added to commit`

**原因**：不在正确的项目目录中

**解决**：
```bash
cd /c/Users/93178/WorkBuddy/20260429095857
ls
```
确认看到 `server/`、`public/`、`package.json` 等文件

---

### ❌ 问题4：命令粘在一起（如 `Enter file...cat`）

**原因**：两个命令写在一行

**解决**：
1. 按 `Ctrl + C` 取消
2. **每个命令单独一行输入**
3. 每行输完后**按回车执行**

---

### ❌ 问题5：`Recv failure: Connection was reset`

**原因**：网络无法访问 GitHub

**解决**：使用 SSH 方式推送（本文档已使用 SSH）

---

### ❌ 问题6：`Permission denied (publickey)`

**原因**：SSH Key 未配置或未添加到 GitHub

**解决**：
1. 检查 SSH Key 是否存在：
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```
2. 如果没有，按 1.4 步骤重新生成
3. 确认已在 GitHub 添加该 SSH Key

---

### ❌ 问题7：忘记输入 `yes`

**原因**：第一次连接 GitHub 时要求确认

**解决**：重新执行推送，输入 `yes`

```bash
git push -u origin main
```

---

### ❌ 问题8：提交到错误的仓库

**原因**：可能在错误的目录执行了 `git init`

**解决**：检查当前目录
```bash
pwd
git remote -v
```
确认 `origin` 指向正确的仓库地址

---

### ❌ 问题9：不小心提交了敏感文件

**立即解决**：
```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "移除敏感文件"
git push
```

---

## 📝 快速命令清单

### 首次上传
```bash
cd /c/Users/93178/WorkBuddy/20260429095857
git init
git config user.name "yangxiaoling1222-eng"
git config user.email "[email address removed]"
git add .
git commit -m "初始提交"
git remote add origin git@github.com:yangxiaoling1222-eng/Amazon-Ads-AI-E.git
git branch -M main
git push -u origin main
# 第一次会问 yes/no，输入 yes
```

### 后续更新
```bash
cd /c/Users/93178/WorkBuddy/20260429095857
git add .
git commit -m "更新说明"
git push
```

### 查看状态
```bash
cd /c/Users/93178/WorkBuddy/20260429095857
git status
git remote -v
```

---

## 📁 本项目重要文件说明

| 文件/目录 | 说明 | 是否上传 |
|-----------|------|----------|
| `.gitignore` | Git 忽略配置 | ✅ 上传 |
| `.env.example` | 环境变量模板 | ✅ 上传 |
| `.env` | 真实环境变量 | ❌ 不上传 |
| `server/` | 后端代码 | ✅ 上传 |
| `public/` | 前端代码 | ✅ 上传 |
| `.workbuddy/` | 工作记忆 | ❌ 不上传 |
| `node_modules/` | 依赖包 | ❌ 不上传 |
| `*.db` | 数据库文件 | ❌ 不上传 |

---

## 🎯 本项目注意事项

1. **必须使用 Git Bash**，不要用 PowerShell 执行 Git 命令
2. **必须使用 SSH 方式**，不要用 HTTPS（已配置）
3. **SSH Key 只需配置一次**，以后无需重复
4. **每次命令单独输入**，不要合并成一行
5. **第一次推送输入 `yes`** 确认连接

---

*教程更新时间：2026-05-11*
*基于成功上传路径整理*
