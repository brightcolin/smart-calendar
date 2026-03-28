# 智能日历助手 · Smart Calendar Assistant

用自然语言管理 Google Calendar，支持添加到 iPhone 主屏幕。纯前端，无后端服务器，数据直接存储在你的 Google Calendar。

> ⚠️ 当前为测试阶段，暂不对外开放登录。如需体验请联系作者添加测试账号。

**[中文](#中文) · [English](#english)**

---

<a name="中文"></a>

## 目录

- [功能](#功能)
- [文件结构](#文件结构)
- [自行部署](#自行部署)
- [安全说明](#安全说明)
- [常见问题](#常见问题)
- [License](#license)

---

## 功能

### 自然语言对话

打开 App 默认进入对话界面。直接输入描述，系统自动解析并同步到 Google Calendar，操作完成后结果内联显示在对话里，无需切换页面。

**创建**
```
「#工作 明天14:00开会一小时，提前15分钟提醒」
「下周五晚上看电影两小时」
「后天下午写报告，大概3小时左右」
```

**修改**
```
「把今天的会议推迟到16:00」
「把开会的标签改为 #学习」
「帮刚才创建的活动加备注：带笔记本」
```

**完成 / 删除**
```
「标记写周报已完成」
「删掉今天的开会」
```

**查询**
```
「今天有什么安排？」
「明天有几个活动？」
「本周安排」
```

操作执行后无需确认弹窗，直接生效，结果卡片提供「撤销」按钮应对误操作。修改时在 ±7 天范围内自动搜索目标活动，无需先加载当日列表。

### 标签与颜色

标签写在活动名称前面，格式 `#标签 活动名`，颜色自动同步到 Google Calendar：

| 标签 | 颜色 | 标签 | 颜色 |
|------|------|------|------|
| `#学习` | 蓝色 | `#运动` | 橙色 |
| `#课程` | 紫色 | `#娱乐` | 粉色 |
| `#科研` | 青色 | `#工作` | 红色 |
| `#社工` | 绿色 | `#其他` | 灰色 |

点击活动卡片上的标签徽章或左侧色条可随时修改，颜色同步回 Google Calendar。

### 日历视图

底部「▦ 日历」，支持周视图和日视图：

- 事件块按时段定位，颜色对应标签
- 红色当前时间线
- 点击空白时段跳转对话并预填时间
- 点击事件块查看详情，可跳转对话进行操作

### 番茄钟

今日页面右上角 🍅：

- 自定义专注（5–90分钟）、短休息（1–30分钟）、长休息（5–60分钟）
- SVG 环形倒计时，4轮会话进度点
- 可关联今日任务，专注结束自动记录时间到任务备注
- 阶段结束播放提示音并发送系统通知
- 配置持久保存

### 统计

底部「◎ 统计」，支持日/周切换：

- 按日历分布、按标签分布
- 相同活动合并统计（总耗时 + 平均耗时）
- 预估 vs 实际双进度条对比
- DeepSeek AI 生成周报（纯文本）

### 其他

- 多账号管理，Token 和 API Key 本地 AES-GCM 加密
- Token 每50分钟自动静默刷新，无需重新登录
- 多日历切换

---

## 文件结构

```
├── index.html      # 页面结构与所有弹窗
├── style.css       # 完整样式（深色主题）
├── app.js          # 主逻辑与 UI           ← 修改 Client ID 在第一行
├── auth.js         # 多账号管理与加密存储
├── calendar.js     # Google Calendar API 封装
├── ai.js           # 自然语言解析与执行
├── calview.js      # 可视化日历视图
├── stats.js        # 统计图表与 AI 周报
└── pomodoro.js     # 番茄钟
```

---

## 自行部署

### 前置条件

- Google 账号
- GitHub 账号
- DeepSeek API Key（[申请](https://platform.deepseek.com/api_keys)，按量计费，个人使用费用极低）

### 第一步：创建 Google Cloud 项目

打开 [console.cloud.google.com](https://console.cloud.google.com)，新建项目。

### 第二步：启用 Google Calendar API

左侧 → API 和服务 → 库 → 搜索 `Google Calendar API` → 启用。

### 第三步：配置 OAuth 同意屏幕

左侧 → API 和服务 → OAuth 同意屏幕 → 外部 → 创建。

填写应用名称，添加三个范围：

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

在「测试用户」中添加你的 Gmail。

### 第四步：创建 OAuth 凭据

凭据 → 创建凭据 → OAuth 客户端 ID → Web 应用。

「已获授权的 JavaScript 来源」填入：

```
https://你的用户名.github.io
```

复制生成的**客户端 ID**。

### 第五步：填入 Client ID

打开 `app.js`，修改第一行：

```javascript
const GOOGLE_CLIENT_ID = '你的客户端ID.apps.googleusercontent.com';
```

### 第六步：部署到 GitHub Pages

1. 新建 GitHub 仓库（Public），上传全部 9 个文件
2. Settings → Pages → Branch: main → Save
3. 约 1 分钟后访问 `https://你的用户名.github.io/仓库名`

> ⚠️ 必须通过 `https://` 访问，本地直接打开 HTML 文件会报 Error 400。

### 第七步：添加到 iPhone 主屏幕

Safari 打开网址 → 底部分享按钮 → 添加到主屏幕。

### 第八步：首次配置

登录后进入 ⚙ 设置，填入 DeepSeek API Key 并保存。

---

## 安全说明

所有敏感数据仅存在本地，不经过任何第三方服务器：

| 数据 | 存储 | 加密 |
|------|------|------|
| Google Access Token | localStorage | AES-GCM 256位 |
| DeepSeek API Key | localStorage | AES-GCM 256位 |
| 任务记录、配置 | localStorage | 无（非敏感） |
| 日历事件 | Google Calendar | Google 负责 |

加密密钥由设备指纹通过 PBKDF2（100,000 次迭代）派生，密钥本身不存储。所有网络请求只发往 Google 和 DeepSeek。

撤销授权：[myaccount.google.com/permissions](https://myaccount.google.com/permissions) → 找到本应用 → 撤销。

---

## 常见问题

**Error 400 / Error 401 invalid_client**
`app.js` 第一行 Client ID 未正确填写，或 Google Cloud Console 中「已获授权的 JavaScript 来源」未包含你的 GitHub Pages 域名。修改后等待约 5 分钟生效。

**登录后看不到日历事件**
点击今日页面右上角「刷新」，或检查顶部日历选择器是否选对了日历。

**自然语言找不到要修改的活动**
系统在目标日期 ±7 天内搜索。描述时加上大概日期（如「上周五的那个开会」）可以帮助定位。

**DeepSeek API 费用大概多少**
个人日常使用通常每月不超过 1 元。每次对话约消耗 500–1000 个 token，按实际用量计费。

---

## License

[MIT License](LICENSE) — 自由使用、修改、分发。

---

<a name="english"></a>

## English

**[↑ Back to top](#智能日历助手--smart-calendar-assistant)**

- [Features](#features)
- [File structure](#file-structure)
- [Setup](#setup)
- [Security](#security)
- [FAQ](#faq)

---

A natural-language-driven Google Calendar manager that installs as a PWA on iPhone. No backend required — data flows directly between your device and Google.

> ⚠️ Currently in private testing. Contact the author to be added as a test user.

---

## Features

### Conversational interface

The app opens directly to a chat screen. Type what you want in plain Chinese and it happens — no confirm dialogs, just an inline result card with an undo button if you make a mistake.

**Create**
```
"#work Team meeting tomorrow 14:00 for one hour, remind 15 min before"
"Movie night next Friday evening, two hours"
"Write report the day after tomorrow afternoon, about 3 hours"
```

**Modify**
```
"Push today's meeting to 16:00"
"Change the meeting tag to #study"
"Add a note to the last event: bring laptop"
```

**Complete / Delete**
```
"Mark the weekly report as done"
"Delete today's meeting"
```

**Query**
```
"What's on today?"
"How many events do I have tomorrow?"
"Show me this week's schedule"
```

When modifying events, the system searches ±7 days around the target date automatically — no need to load the day first.

### Tags & colors

Prefix events with `#tag` (e.g. `#work Team meeting`). Colors sync automatically to Google Calendar. Tap any tag badge or the left color bar to change it instantly.

| Tag | Color | Tag | Color |
|-----|-------|-----|-------|
| `#学习` (study) | Blue | `#运动` (exercise) | Orange |
| `#课程` (class) | Purple | `#娱乐` (leisure) | Pink |
| `#科研` (research) | Teal | `#工作` (work) | Red |
| `#社工` (social) | Green | `#其他` (other) | Grey |

### Calendar view

Tap **▦ Calendar** for week and day views with color-coded event blocks. Tap an empty slot to jump to chat with the time pre-filled. Tap an event to view details and jump to chat for natural-language operations.

### Pomodoro timer

Tap 🍅 on the Today page. Customisable focus / break durations, linkable to today's tasks, with audio alerts and system notifications. Settings are saved between sessions.

### Statistics

Tap **◎ Stats** to switch between daily and weekly views: tag breakdown, merged stats for repeated activities, estimated vs actual dual-bar comparison, and AI weekly report in plain text via DeepSeek.

### Other

- Multi-account support; Token and API Key encrypted locally with AES-GCM
- Token silently refreshes every 50 minutes — no login interruptions
- Multi-calendar switching

---

## File structure

```
├── index.html      # Page structure and all modals
├── style.css       # Full styles (dark theme)
├── app.js          # Main logic and UI     ← put your Client ID on line 1
├── auth.js         # Multi-account and encrypted storage
├── calendar.js     # Google Calendar API wrapper
├── ai.js           # Natural language parsing and execution
├── calview.js      # Visual calendar view (week / day)
├── stats.js        # Statistics and AI weekly report
└── pomodoro.js     # Pomodoro timer
```

---

## Setup

### Prerequisites

- A Google account
- A GitHub account
- A DeepSeek API Key ([apply here](https://platform.deepseek.com/api_keys), pay-per-token)

### Step 1 — Create a Google Cloud project

Open [console.cloud.google.com](https://console.cloud.google.com) and create a new project.

### Step 2 — Enable Google Calendar API

APIs & Services → Library → search `Google Calendar API` → Enable.

### Step 3 — Configure the OAuth consent screen

APIs & Services → OAuth consent screen → External → Create. Add these three scopes:

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

Add your Gmail as a test user.

### Step 4 — Create OAuth credentials

Credentials → Create credentials → OAuth client ID → Web application.

Under **Authorised JavaScript origins** add:

```
https://your-username.github.io
```

Copy the **Client ID**.

### Step 5 — Add the Client ID

Edit the first line of `app.js`:

```javascript
const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
```

### Step 6 — Deploy to GitHub Pages

1. Create a public GitHub repository and upload all 9 files
2. Settings → Pages → Branch: main → Save
3. Visit `https://your-username.github.io/repo-name` after ~1 minute

> ⚠️ Must be opened via `https://`. Opening the HTML file locally fails with Error 400.

### Step 7 — Install on iPhone

Safari → Share → Add to Home Screen.

### Step 8 — First-time setup

Sign in, then go to ⚙ Settings and enter your DeepSeek API Key. It's encrypted on-device and remembered.

---

## Security

| Data | Location | Encryption |
|------|----------|------------|
| Google Access Token | localStorage | AES-GCM 256-bit |
| DeepSeek API Key | localStorage | AES-GCM 256-bit |
| Task records, preferences | localStorage | None (non-sensitive) |
| Calendar events | Google Calendar | Managed by Google |

Encryption keys are PBKDF2-derived (100,000 iterations) from a device fingerprint. The key itself is never stored. All network requests go only to Google and DeepSeek.

Revoke access: [myaccount.google.com/permissions](https://myaccount.google.com/permissions)

---

## FAQ

**Error 400 / Error 401 invalid_client**
The Client ID on line 1 of `app.js` is wrong, or the GitHub Pages domain is missing from Authorised JavaScript origins in Google Cloud Console. Changes can take up to 5 minutes to propagate.

**No events after signing in**
Tap Refresh in the Today page, or check the calendar picker at the top.

**Can't find an event to modify**
The system searches ±7 days. Adding an approximate date ("last Friday's meeting") helps narrow it down.

**How much does DeepSeek cost?**
Typically less than ¥1/month for personal use. Roughly 500–1000 tokens per conversation.

---

## License

[MIT License](LICENSE)
