# 智能日历助手 · Smart Calendar Assistant

> 自然语言驱动的 Google Calendar 任务管理工具，可添加到 iPhone 主屏幕，无需后端服务器。

[English](#english) · [功能演示](#功能演示) · [快速开始](#快速开始) · [部署指南](#部署指南) · [贡献指南](#贡献指南)

---

## 简介

这是一个纯前端的智能日历助手，通过自然语言与 Google Calendar 深度集成。你可以直接说「明天14:00开会一小时 #工作」，系统自动解析并创建日历事件；也可以说「把今天的会议推迟到16:00」，系统会找到该事件并更新。

所有数据直接存储在 Google Calendar，不经过任何第三方服务器。

---

## 功能演示

### 自然语言创建活动
```
「#工作 明天14:00开会一小时，提前15分钟提醒」
「下周五晚上看电影两小时」（自动创建第一个时间点）
「后天下午写报告，大概3小时左右」
```

### 自然语言修改活动
```
「把今天的会议推迟到16:00」
「把开会标签改为 #学习」
「标记写周报已完成」
「帮刚才创建的活动加备注：带笔记本」
```

### 可视化日历视图
- 周视图 / 日视图，事件块颜色对应标签
- 点击空白时段快速创建活动
- 点击事件块查看详情、完成、删除

### 统计与 AI 分析
- 按标签分布（`#工作`、`#学习` 等）
- 相同活动合并统计（多次「写周报」的总耗时与平均耗时）
- 预估 vs 实际时间对比可视化
- DeepSeek AI 生成每日分析和周报

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript，无框架依赖 |
| 认证 | Google OAuth 2.0（Google Identity Services） |
| 日历数据 | Google Calendar API v3 |
| AI 解析 | DeepSeek API（deepseek-chat 模型） |
| 加密存储 | Web Crypto API（AES-GCM + PBKDF2） |
| 部署 | GitHub Pages（零成本静态托管） |

---

## 文件结构

```
smart-calendar/
├── index.html      # 页面结构与所有 Modal
├── style.css       # 完整样式（深色主题）
├── app.js          # 主逻辑、UI、批量操作  ← 修改 Client ID 在这里
├── auth.js         # 多账号管理 + AES-GCM 加密存储
├── calendar.js     # Google Calendar API 封装
├── ai.js           # DeepSeek 自然语言解析与执行
├── calview.js      # 可视化日历视图（周视图 / 日视图）
└── stats.js        # 统计图表与 AI 周报生成
```

---

## 快速开始

### 前置条件

- 一个 Google 账号
- 一个 GitHub 账号（用于免费部署）
- 一个 DeepSeek API Key（[申请地址](https://platform.deepseek.com/api_keys)，按量计费）

---

## 部署指南

### 第一步：创建 Google Cloud 项目

1. 打开 [console.cloud.google.com](https://console.cloud.google.com)
2. 顶部下拉 → **新建项目** → 名称填 `smart-calendar` → 创建

### 第二步：启用 Google Calendar API

1. 左侧 → **API 和服务** → **库**
2. 搜索 `Google Calendar API` → 点击 **启用**

### 第三步：配置 OAuth 同意屏幕

1. 左侧 → **API 和服务** → **OAuth 同意屏幕**
2. 用户类型选「外部」→ 创建
3. 填写应用名称（`智能日历助手`）和你的 Gmail 邮箱
4. 在「范围」里添加以下三个权限：
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/userinfo.email`
5. 在「测试用户」里添加你的 Gmail → 保存

### 第四步：创建 OAuth 凭据

1. 左侧 → **凭据** → **+ 创建凭据** → **OAuth 客户端 ID**
2. 应用类型选「Web 应用」
3. 在「已获授权的 JavaScript 来源」填入：
   ```
   https://你的用户名.github.io
   ```
4. 点击创建 → 复制生成的**客户端 ID**

### 第五步：填入 Client ID

用任意文本编辑器打开 `app.js`，修改第一行：

```javascript
// 改这里 ↓
const GOOGLE_CLIENT_ID = '你的客户端ID.apps.googleusercontent.com';
```

保存文件。

### 第六步：上传到 GitHub Pages

1. 在 GitHub 新建仓库，名称 `smart-calendar`，设为 **Public**
2. 上传全部 8 个文件
3. 进入仓库 **Settings** → **Pages** → Branch 选 `main` → **Save**
4. 约 1 分钟后访问：`https://你的用户名.github.io/smart-calendar`

> ⚠️ 必须通过 `https://` 网址打开，直接双击 HTML 文件会报 Error 400。

### 第七步：添加到 iPhone 主屏幕

1. 用 **Safari** 打开 GitHub Pages 网址
2. 底部分享按钮 → **添加到主屏幕** → 添加
3. 桌面出现图标，打开后全屏运行

### 第八步：首次配置

1. 点击「使用 Google 账号登录」
2. 进入 **⚙ 设置** → 填入 DeepSeek API Key → **保存设置**
3. Key 加密存储于本设备，下次打开无需重新输入

---

## 使用说明

### 标签体系

标签写在活动名称**前面**，格式为 `#标签 活动名`：

| 标签 | Google Calendar 颜色 | 适用场景 |
|------|---------------------|---------|
| `#学习` | 蓝色 | 自主学习、阅读 |
| `#课程` | 紫色 | 上课、培训 |
| `#科研` | 青色 | 实验、论文、研究 |
| `#社工` | 绿色 | 社团、志愿活动 |
| `#运动` | 橙色 | 健身、跑步 |
| `#娱乐` | 粉色 | 电影、游戏、休闲 |
| `#工作` | 红色 | 工作任务、会议 |
| `#其他` | 灰色 | 其他 |

点击事件卡片上的标签徽章可随时修改标签，颜色自动同步到 Google Calendar。

### 支持的时间表达

```
绝对时间：明天14:00、下周五09:30、3月25日下午
相对时间：明天、后天、下周一、3天后、下个月初
模糊时间：早上（08:00）、下午（13:00）、晚上（19:00）、深夜（22:00）
模糊时长：一小时、半小时、一个半小时、大概2小时左右
```

### 批量操作

在「今日」页面点击右上角「**批量**」进入批量模式，勾选多个活动后可一次性**标记完成**、**修改时间**或**删除**。

---

## 安全说明

| 数据 | 存储位置 | 加密方式 |
|------|---------|---------|
| Google Access Token | 本地 localStorage | AES-GCM（256位） |
| DeepSeek API Key | 本地 localStorage | AES-GCM（256位） |
| 任务记录、偏好设置 | 本地 localStorage | 不加密（非敏感数据） |
| 日历事件 | Google Calendar 服务器 | Google 负责 |

加密密钥由设备指纹通过 PBKDF2（100,000 次迭代 + SHA-256）派生，密钥本身从不存储。整个应用无任何后端服务器，所有网络请求只发往 Google 和 DeepSeek。

**随时撤销授权：** [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → 找到本应用 → 撤销访问权限

---

## 贡献指南

欢迎提交 Issue 和 Pull Request。

**常见贡献方向：**
- 英文界面支持
- 优化自然语言解析准确率
- 新增统计维度或图表类型
- 改善移动端手势交互
- 适配更多日历服务（如 Apple Calendar）

提交 PR 前请确保：
1. 代码在 Chrome/Safari 移动端通过基本测试
2. 不引入新的外部 JavaScript 依赖
3. 保持现有的文件拆分架构

---

## 常见问题

**Q: Error 400 / Error 401 invalid_client**
`app.js` 第一行的 Client ID 未正确填写，或 Google Cloud Console 的「已获授权的 JavaScript 来源」未包含你的 GitHub Pages 域名（注意：修改后需等待约 5 分钟生效）。

**Q: 登录后看不到日历事件**
点击今日页面右上角的「刷新」按钮，或检查顶部日历选择器是否已选择正确的日历。

**Q: 自然语言找不到要修改的活动**
系统会在目标日期 ±7 天范围内搜索。如果活动在更远的日期，可在描述中加上大概时间，如「上个月底的那个开会」。

**Q: DeepSeek API 费用大概多少**
日常个人使用通常每月不超过 1 元人民币。DeepSeek 按实际 token 消耗计费，每次对话约消耗 500–1000 个 token。

---

## License

[MIT License](LICENSE) — 自由使用、修改、分发，包括商业用途。

---

<a name="english"></a>
## English Summary

A natural-language-driven Google Calendar manager that installs as a PWA on iPhone. No backend required.

**What it does:**
- Create events by typing naturally: *"#work Meeting tomorrow 14:00 for one hour"*
- Modify events: *"Push today's meeting to 16:00"* — finds the event automatically across date ranges
- Built-in week/day calendar view with color-coded event blocks per tag
- Multi-account support with AES-GCM encrypted local storage
- Weekly AI reports powered by DeepSeek

**To get started:** Follow the deployment guide above. The only file you need to edit is the first line of `app.js` with your Google OAuth Client ID. Everything else works out of the box.
