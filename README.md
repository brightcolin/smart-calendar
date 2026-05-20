# 智能日历助手 · Smart Calendar Assistant

用自然语言管理 Google Calendar 的私人秘书。内置课程表感知、智能排期、批量规划、番茄钟、统计仪表盘。纯前端，无后端服务器，数据直接存储在你的 Google Calendar。

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

### 秘书大脑

系统内置一套「秘书守则」，AI 不只是翻译你的指令，还会根据你的课程表、作息节奏、任务优先级做出智能判断：

- **课程表感知**：知道你周几几点有什么课，自动避开课程时段
- **时段匹配**：高强度学习排在 19:00–21:00，轻度任务排在 22:00 后
- **保护时段**：午休 12:15–13:30、运动窗口 17:00–18:00 不安排学习任务
- **优先级排序**：考试季自动优先安排课程复习，按微积分 > 物理 > 高代排序
- **六条主线追踪**：学习、科研、RoboMaster、自媒体、竞赛、运动，每条线有周目标时长

### 自然语言对话

打开 App 默认进入对话界面。直接输入描述，系统自动解析并同步到 Google Calendar。

**创建（智能排期）**
```
「#工作 明天14:00开会一小时，提前15分钟提醒」
「安排物理复习」                    ← 自动选最优空闲时段
「下周五晚上看电影两小时」
```

**批量规划**
```
「帮我规划明天」                    ← AI 生成整天方案，确认后批量创建
「这周还要做微积分作业、读论文、项目推广，帮我排一下」
```

规划方案会展示排期思路（为什么这样排），你回复「确认」创建，或「调整」重新排。

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

操作执行后直接生效，结果卡片提供「撤销」按钮应对误操作。修改时在 ±7 天范围内自动搜索目标活动。

### 任务完成

通过对话告诉 AI「标记 XX 已完成」，AI 会自动计算实际耗时并同步到 Google Calendar。

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

### 备考规划

底部「📖 复习」，为考试季提供结构化 28 天复习计划管理：

- **进度仪表盘**：倒计时天数、总体完成率、今日任务进度；各科目（微积分/物理/高代/英语/近代史/作业）独立进度条 vs 目标总学时
- **时间轴视图**：按日期分组的任务卡片，支持按科目筛选；过期未完成任务标红提示
- **AI 智能调整**：告知临时变动，DeepSeek 自动重新排列后续所有任务
- **同步日历**：一键将复习任务批量创建到 Google Calendar（tag: `#学习`）
- **手动管理**：添加、编辑、删除单条任务，逐条勾选完成

### 统计

底部「◎ 统计」，按周查看：

- 按日历分布、按标签分布
- 相同活动合并统计（总耗时 + 平均耗时）
- 预估 vs 实际双进度条对比
- DeepSeek AI 生成周报（纯文本）

### 其他

- 多账号管理，Token 和 API Key 本地 AES-GCM 加密
- Token 每50分钟自动静默刷新，无需重新登录
- 多日历切换
- 时区感知，正确处理 UTC+N 时区的日期显示

---

## 文件结构

```
├── index.html      # 页面结构与所有弹窗
├── style.css       # 完整样式（深色主题）
├── app.js          # 主逻辑、UI                ← 修改 Client ID 在第一行
├── auth.js         # 多账号管理与加密存储
├── calendar.js     # Google Calendar API 封装
├── ai.js           # 秘书大脑：自然语言解析、智能排期、批量规划
├── calview.js      # 可视化日历视图（周/日）
├── stats.js        # 统计图表、AI 周报
├── pomodoro.js     # 番茄钟
└── review.js       # 备考规划：28天计划、进度追踪、AI调整
```

---

## 自行部署

### 前置条件

- Google 账号
- GitHub 账号（推荐申请 [GitHub Student Pack](https://education.github.com/pack) 以使用 Private Pages）
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

1. 新建 GitHub 仓库（Public 或 Private + GitHub Pro），上传全部 9 个文件
2. Settings → Pages → Branch: main → Save
3. 约 1 分钟后访问 `https://你的用户名.github.io/仓库名`

> ⚠️ 必须通过 `https://` 访问，本地直接打开 HTML 文件会报 Error 400。

### 第七步：添加到 iPhone 主屏幕

Safari 打开网址 → 底部分享按钮 → 添加到主屏幕。

### 第八步：首次配置

登录后进入 ⚙ 设置，填入 DeepSeek API Key 并保存。

---

## 自定义秘书守则

`ai.js` 中的 `buildSystemPrompt()` 函数包含完整的秘书守则。你可以根据自己的情况修改：

- **课程表**：更新「课程表」部分的时间和科目
- **作息框架**：调整起床时间、午休区、运动窗口
- **优先级**：修改考试季/非考试季的任务排序
- **标签体系**：在 `calendar.js` 的 `TAG_COLOR` 和 `TAG_HEX` 中增减标签
- **备考科目与计划**：在 `review.js` 的 `SUBJECTS` 数组和 `generateDefaultPlan()` 中修改科目、考试日期、目标学时和具体任务

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

**关于源代码公开**：即使仓库是 Public，安全风险也很低。Google Client ID 不是密钥，它的安全靠 OAuth 同意屏幕的「已授权 JavaScript 来源」限制。DeepSeek API Key 加密存储在用户浏览器中，不在代码里。如需私有化，推荐使用 GitHub Student Pack（Private Pages）或 Cloudflare Pages。

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
个人日常使用通常每月不超过 1 元。每次对话约消耗 500–1500 个 token（批量规划消耗更多），按实际用量计费。

---

## 配合 Claude 使用

本 App 可以和 Claude（claude.ai）配合使用，实现更强的规划能力：

- **App 负责日常快操作**：随手加事件、看安排、开番茄钟、查统计
- **Claude 负责规划层**：每周帮你排下周计划、在多条主线之间分配时间、检测冲突
- 两者共享同一个 Google Calendar，天然协作
- 在 Claude 项目中粘贴秘书守则，即可获得跨对话的一致规划体验

---

## License

[MIT License](LICENSE) — 自由使用、修改、分发。

---

<a name="english"></a>

## English

**[↑ Back to top](#智能日历助手--smart-calendar-assistant)**

A natural-language-driven Google Calendar manager with a built-in "secretary brain." Understands your class schedule, respects your routines, and plans tasks intelligently. Installs as a PWA on iPhone. No backend — data flows directly between your device and Google.

> ⚠️ Currently in private testing. Contact the author to be added as a test user.

---

### Key features

**Secretary brain** — The AI knows your class schedule, sleep rhythm, exercise window, lunch break, and task priorities. When you say "schedule physics review" without a time, it picks the best available slot automatically.

**Batch planning** — Say "plan my tomorrow" and the AI generates a full-day schedule with reasoning, which you can confirm or adjust before creating.

**Exam review planner** — 28-day study plan with per-subject progress tracking (calculus, physics, linear algebra, English, history, homework). AI smart rescheduling, conflict detection, and one-click Google Calendar sync.

**Conversational CRUD** — Create, modify, query, complete, and delete events in natural language. Undo button on every action. Modification auto-searches ±7 days.

**Tags & colors** — Prefix events with `#tag`. Colors sync to Google Calendar. Tap to change.

**Calendar view** — Week and day views with color-coded blocks, current-time line, and tap-to-create on empty slots.

**Pomodoro timer** — Customizable durations, linkable to tasks, auto-logs focus time.

**Statistics** — Tag breakdown, merged activity stats, estimated vs actual comparison, AI weekly report.

**Security** — AES-GCM encrypted tokens and keys. PBKDF2-derived device key. All traffic goes only to Google and DeepSeek.

---

### File structure

```
├── index.html      # Page structure and modals
├── style.css       # Full styles (dark theme)
├── app.js          # Main logic, UI                    ← Client ID on line 1
├── auth.js         # Multi-account + encrypted storage
├── calendar.js     # Google Calendar API wrapper
├── ai.js           # Secretary brain: NL parsing, smart scheduling, batch planning
├── calview.js      # Visual calendar (week / day)
├── stats.js        # Stats, AI weekly report
├── pomodoro.js     # Pomodoro timer
└── review.js       # Exam review planner: 28-day plan, progress tracking, AI rescheduling
```

---

### Setup

1. Create a Google Cloud project and enable Calendar API
2. Configure OAuth consent screen with calendar + userinfo scopes
3. Create OAuth Web credentials with your GitHub Pages domain
4. Put the Client ID in `app.js` line 1
5. Deploy to GitHub Pages (or Cloudflare Pages / Vercel for private repos)
6. Add to iPhone Home Screen via Safari Share
7. Sign in and enter DeepSeek API Key in Settings

See the [Chinese setup guide](#自行部署) for detailed steps.

---

### Customization

Edit `buildSystemPrompt()` in `ai.js` to change class schedules, routines, and priorities. Edit the `SUBJECTS` array and `generateDefaultPlan()` in `review.js` to customize exam subjects, dates, target hours, and the 28-day task schedule.

---

### Security

| Data | Location | Encryption |
|------|----------|------------|
| Google Access Token | localStorage | AES-GCM 256-bit |
| DeepSeek API Key | localStorage | AES-GCM 256-bit |
| Task records | localStorage | None (non-sensitive) |
| Calendar events | Google Calendar | Managed by Google |

Revoke access: [myaccount.google.com/permissions](https://myaccount.google.com/permissions)

---

### License

[MIT License](LICENSE)
