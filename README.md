# 智能日历助手 · Smart Calendar Assistant

自然语言驱动的 Google Calendar 任务管理工具，支持添加到 iPhone 主屏幕。纯前端实现，无需后端服务器，数据直接存储在你的 Google Calendar。

> ⚠️ 当前为测试阶段，暂不对外开放登录。如需体验请联系作者添加测试账号。

**[中文](#中文) · [English](#english)**

---

<a name="中文"></a>
## 目录

- [功能介绍](#功能介绍)
- [文件结构](#文件结构)
- [自行部署](#自行部署)
- [安全说明](#安全说明)
- [常见问题](#常见问题)
- [License](#license)

---

## 功能介绍

### 自然语言操作

直接输入中文描述，系统自动解析并同步到 Google Calendar：

```
创建：「#工作 明天14:00开会一小时，提前15分钟提醒」
修改：「把今天的会议推迟到16:00」
完成：「标记写周报已完成」
追加：「帮刚才创建的活动加备注：带笔记本」
```

支持模糊时间（早上、下午、晚上）、相对日期（明天、下周五、3天后）、模糊时长（一小时、大概两小时左右）。修改时在 ±7 天范围内自动搜索目标活动，无需先加载当日事件。

### 标签与颜色

标签写在活动名称前面，格式为 `#标签 活动名`，颜色自动同步到 Google Calendar 事件颜色：

| 标签 | 颜色 | 适用场景 |
|------|------|---------|
| `#学习` | 蓝色 | 自主学习、阅读 |
| `#课程` | 紫色 | 上课、培训 |
| `#科研` | 青色 | 实验、论文、研究 |
| `#社工` | 绿色 | 社团、志愿活动 |
| `#运动` | 橙色 | 健身、跑步 |
| `#娱乐` | 粉色 | 电影、游戏、休闲 |
| `#工作` | 红色 | 工作任务、会议 |
| `#其他` | 灰色 | 其他 |

点击活动卡片上的标签徽章或左侧色条可随时修改，颜色自动同步回 Google Calendar。

### 可视化日历视图

底部导航「▦ 日历」，支持周视图和日视图：

- 事件块按时段定位，颜色对应标签
- 红色当前时间线实时显示
- 点击空白时段快速跳转创建
- 点击事件块查看详情，可直接完成、编辑标签、删除

### 番茄钟

今日页面右上角 🍅 按钮打开：

- 自定义专注时长（5–90分钟）、短休息（1–30分钟）、长休息（5–60分钟）
- SVG 环形倒计时，4轮会话点显示进度
- 可关联今日任务，专注结束后自动记录时间到任务备注
- 阶段结束时播放提示音并发送系统通知
- 配置持久化保存

### 统计分析

- 日视图 / 周视图切换，左右导航浏览历史
- 按日历分布、按标签分布
- 相同活动合并统计（多次「写周报」显示总耗时和平均耗时）
- 预估 vs 实际时间对比（双进度条独立显示）
- DeepSeek AI 生成周报，纯文本输出

### 其他

- 多账号管理，Token 和 API Key 本地 AES-GCM 加密存储
- Token 50分钟自动静默刷新，无需重新登录
- 完成活动时可手动调整实际完成时间
- 批量操作：批量完成、批量改时间、批量删除
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
├── calview.js      # 可视化日历视图（周/日）
├── stats.js        # 统计图表与 AI 周报
└── pomodoro.js     # 番茄钟
```

---

## 自行部署

### 前置条件

- Google 账号
- GitHub 账号（用于免费部署）
- DeepSeek API Key（[申请地址](https://platform.deepseek.com/api_keys)，按量计费）

### 第一步：创建 Google Cloud 项目

打开 [console.cloud.google.com](https://console.cloud.google.com)，顶部下拉 → 新建项目 → 创建。

### 第二步：启用 Google Calendar API

左侧 → API 和服务 → 库 → 搜索 `Google Calendar API` → 启用。

### 第三步：配置 OAuth 同意屏幕

左侧 → API 和服务 → OAuth 同意屏幕 → 外部 → 创建。填写应用名称，添加以下三个范围：

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

在「测试用户」中添加你的 Gmail 地址。

### 第四步：创建 OAuth 凭据

凭据 → 创建凭据 → OAuth 客户端 ID → Web 应用。

在「已获授权的 JavaScript 来源」填入：

```
https://你的用户名.github.io
```

创建后复制生成的**客户端 ID**。

### 第五步：填入 Client ID

打开 `app.js`，修改第一行：

```javascript
const GOOGLE_CLIENT_ID = '你的客户端ID.apps.googleusercontent.com';
```

### 第六步：部署到 GitHub Pages

1. 新建 GitHub 仓库（Public），上传全部 9 个文件
2. Settings → Pages → Branch: main → Save
3. 约 1 分钟后访问 `https://你的用户名.github.io/仓库名`

> ⚠️ 必须通过 `https://` 网址访问，本地直接打开 HTML 文件会报 Error 400。

### 第七步：添加到 iPhone 主屏幕

Safari 打开网址 → 底部分享按钮 → 添加到主屏幕 → 添加。

### 第八步：首次配置

登录后进入 ⚙ 设置，填入 DeepSeek API Key 并保存。Key 加密存储于本设备，下次打开无需重新输入。

---

## 安全说明

所有敏感数据仅存储在本地设备，不经过任何第三方服务器：

| 数据 | 存储位置 | 加密方式 |
|------|---------|---------|
| Google Access Token | 本地 localStorage | AES-GCM 256位 |
| DeepSeek API Key | 本地 localStorage | AES-GCM 256位 |
| 任务记录、偏好设置 | 本地 localStorage | 无（非敏感） |
| 日历事件 | Google Calendar 服务器 | Google 负责 |

加密密钥由设备指纹通过 PBKDF2（100,000 次迭代）派生，密钥本身从不存储。所有网络请求只发往 Google 和 DeepSeek。

撤销 Google 授权：[myaccount.google.com/permissions](https://myaccount.google.com/permissions) → 找到本应用 → 撤销。

---

## 常见问题

**Error 400 / Error 401 invalid_client**

`app.js` 第一行的 Client ID 未正确填写，或 Google Cloud Console 中「已获授权的 JavaScript 来源」未包含你的 GitHub Pages 域名。修改授权来源后需等待约 5 分钟生效。

**登录后看不到日历事件**

点击今日页面右上角「刷新」按钮，或检查顶部日历选择器是否选择了正确的日历。

**自然语言找不到要修改的活动**

系统在目标日期 ±7 天内搜索。描述时可加上大概日期，如「上周五的那个开会」，帮助系统定位。

**DeepSeek API 费用大概多少**

个人日常使用通常每月不超过 1 元人民币。按实际 token 消耗计费，每次对话约 500–1000 个 token。

---

## License

[MIT License](LICENSE) — 自由使用、修改、分发，包括商业用途。

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

A natural-language-driven Google Calendar manager that installs as a PWA on iPhone. No backend required — all data flows directly between your device and Google.

> ⚠️ Currently in testing. Login is not open to the public. Contact the author to be added as a test user.

---

## Features

### Natural language

Type what you want in plain Chinese and the app creates or modifies Google Calendar events automatically:

```
Create:  "#work Team meeting tomorrow 14:00 for one hour, remind 15 min before"
Modify:  "Push today's meeting to 16:00"
Complete:"Mark the weekly report as done"
Append:  "Add a note to the last event: bring laptop"
```

Supports fuzzy time expressions, relative dates, and fuzzy durations. When modifying events, the system searches ±7 days around the target date — no need to load the day first.

### Tags & colors

Prefix events with `#tag` followed by the event name (e.g. `#work Team meeting`). The color syncs automatically to Google Calendar. Tap any tag badge or the left color bar on an event card to change it instantly.

| Tag | Color |
|-----|-------|
| `#学习` (study) | Blue |
| `#课程` (class) | Purple |
| `#科研` (research) | Teal |
| `#社工` (social) | Green |
| `#运动` (exercise) | Orange |
| `#娱乐` (leisure) | Pink |
| `#工作` (work) | Red |
| `#其他` (other) | Grey |

### Calendar view

Tap **▦ Calendar** in the bottom nav for a built-in week or day view:

- Event blocks positioned by time slot, coloured by tag
- Live red current-time indicator
- Tap an empty slot to jump to Create with the time pre-filled
- Tap an event block to complete, edit tag, or delete

### Pomodoro timer

Tap 🍅 in the top-right corner of the Today page:

- Customisable focus (5–90 min), short break (1–30 min), long break (5–60 min)
- SVG ring countdown with 4-session dot tracker
- Link to a today task — focus time is logged to the task note automatically
- Audio beep (Web Audio API) and system notification when each phase ends
- Settings saved between sessions

### Statistics

- Toggle between **daily** and **weekly** views
- Breakdown by calendar and by tag
- Merged stats for repeated activities (e.g. multiple "weekly report" entries show total and average time)
- Estimated vs actual time comparison with two independent progress bars
- DeepSeek AI weekly report in plain text (no markdown symbols)

### Other

- Multi-account support; Token and API Key encrypted locally with AES-GCM
- Token silently refreshes every 50 minutes — no repeated login prompts
- Completion time picker: adjust the actual finish time after the fact
- Batch operations: complete, reschedule, or delete multiple events at once
- Multi-calendar switching

---

## File structure

```
├── index.html      # Page structure and all modals
├── style.css       # Full styles (dark theme)
├── app.js          # Main logic and UI     ← put your Client ID on line 1
├── auth.js         # Multi-account management and encrypted storage
├── calendar.js     # Google Calendar API wrapper
├── ai.js           # Natural language parsing and execution
├── calview.js      # Visual calendar view (week / day)
├── stats.js        # Statistics charts and AI weekly report
└── pomodoro.js     # Pomodoro timer
```

---

## Setup

### Prerequisites

- A Google account
- A GitHub account (for free hosting)
- A DeepSeek API Key ([apply here](https://platform.deepseek.com/api_keys), pay-per-token, very cheap for personal use)

### Step 1 — Create a Google Cloud project

Open [console.cloud.google.com](https://console.cloud.google.com), click the project dropdown → New project → Create.

### Step 2 — Enable Google Calendar API

Left sidebar → APIs & Services → Library → search `Google Calendar API` → Enable.

### Step 3 — Configure the OAuth consent screen

Left sidebar → APIs & Services → OAuth consent screen → External → Create. Fill in the app name, then add these three scopes:

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

Add your Gmail address as a test user.

### Step 4 — Create OAuth credentials

Credentials → Create credentials → OAuth client ID → Web application.

Under **Authorised JavaScript origins** add:

```
https://your-username.github.io
```

Click Create and copy the **Client ID**.

### Step 5 — Add the Client ID

Open `app.js` and edit the first line:

```javascript
const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
```

### Step 6 — Deploy to GitHub Pages

1. Create a new public GitHub repository and upload all 9 files
2. Go to Settings → Pages → Branch: main → Save
3. After about 1 minute, visit `https://your-username.github.io/repo-name`

> ⚠️ Must be accessed via `https://`. Opening the HTML file locally will fail with Error 400.

### Step 7 — Install on iPhone

Open the Pages URL in Safari → Share button → Add to Home Screen → Add.

### Step 8 — First-time setup

After signing in, go to ⚙ Settings and enter your DeepSeek API Key, then save. The key is encrypted on your device and remembered for future sessions.

---

## Security

All sensitive data is stored locally on your device. Nothing passes through any third-party server:

| Data | Location | Encryption |
|------|----------|------------|
| Google Access Token | localStorage | AES-GCM 256-bit |
| DeepSeek API Key | localStorage | AES-GCM 256-bit |
| Task records, preferences | localStorage | None (non-sensitive) |
| Calendar events | Google Calendar | Managed by Google |

Encryption keys are derived from a device fingerprint using PBKDF2 (100,000 iterations). The key itself is never stored. All network requests go only to Google and DeepSeek.

To revoke access: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → find this app → Remove.

---

## FAQ

**Error 400 / Error 401 invalid_client**

The Client ID on line 1 of `app.js` is incorrect, or your GitHub Pages domain is not listed under Authorised JavaScript origins in Google Cloud Console. Changes to authorised origins can take up to 5 minutes to take effect.

**No events after signing in**

Tap the Refresh button in the top-right of the Today page, or check that the correct calendar is selected in the top calendar picker.

**Can't find an event to modify**

The system searches ±7 days around the target date. Adding an approximate date to your description (e.g. "last Friday's meeting") helps narrow the search.

**How much does the DeepSeek API cost?**

For typical personal use, less than ¥1 per month. DeepSeek charges per token; each conversation uses roughly 500–1000 tokens.

---

## License

[MIT License](LICENSE) — free to use, modify, and distribute, including commercially.
