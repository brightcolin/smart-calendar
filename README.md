# 智能日历助手 · Smart Calendar Assistant

一个直接运行在浏览器中的 Google Calendar 助手，支持自然语言事件管理、智能排期、日历视图、复习计划和时间统计。项目使用原生 HTML、CSS 和 JavaScript，无框架、无打包步骤、无后端服务器。

> 当前处于个人测试阶段。Google OAuth 测试模式下，只有加入测试用户列表的账号可以登录。

## 功能

- 使用自然语言创建、修改、查询、完成和删除 Google Calendar 事件。
- 结合真实日历事件和用户本地规则安排空闲时段。
- 批量规划一天或一周的任务，并在确认后写入日历。
- 周视图和日视图展示带标签颜色的事件。
- 按标签、日期和活动名称统计时间，生成 AI 周报。
- 本地配置考试科目、日期和目标时长，生成并调整复习任务。
- 将复习任务同步到 Google Calendar。
- 多 Google 账号切换，以及本地加密保存 Token 和 DeepSeek API Key。

## 与桌面 Widget 的关系

配套桌面应用位于独立仓库 [`calendar-widget`](https://github.com/brightcolin/calendar-widget)。

两个应用不会加载彼此的源码，也不共享 localStorage。它们通过同一个 Google Calendar 账号协作：

- Web 应用负责创建和修改日历事件。
- Widget 以只读权限展示主日历中的当日事件。
- 两者共同识别 `#标签 活动名`事件标题格式。
- 番茄钟数据只保存在 Widget 本地。

修改标签名称或事件标题格式时，需要同步检查两个仓库。

## 快速开始

项目没有构建步骤。请使用静态 HTTP 服务器，不要直接双击 `index.html`：

```powershell
git clone https://github.com/brightcolin/smart-calendar.git
cd smart-calendar
python -m http.server 8080
```

也可以使用：

```powershell
npx serve .
```

然后访问 `http://localhost:8080`。

本地登录前，需要在 Google Cloud OAuth 客户端中加入对应的本地来源。生产环境必须使用 HTTPS，并将实际部署来源加入“已获授权的 JavaScript 来源”。

## Google OAuth 配置

1. 在 Google Cloud 创建项目并启用 Google Calendar API。
2. 配置 OAuth 同意屏幕；测试期间将自己的 Google 账号加入测试用户。
3. 创建 Web 应用类型的 OAuth 客户端。
4. 添加实际使用的 JavaScript 来源，例如本地测试来源或 GitHub Pages 域名。
5. 将 OAuth Client ID 填入 `app.js` 顶部的 `GOOGLE_CLIENT_ID`。

应用当前请求以下权限：

```text
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

OAuth Client ID 是公开标识符，不等同于访问 Token；不要把 Client Secret、Access Token 或 Refresh Token 写入仓库。

## DeepSeek 配置

登录后进入“设置”，填写 DeepSeek API Key。AI 请求由浏览器直接发送到 DeepSeek API。

API Key 会在浏览器中加密后写入 localStorage，但这不能防御同源恶意脚本、XSS、浏览器扩展或已经能够访问本机账户的用户。请使用独立 Key、设置合理额度，并在怀疑泄漏时及时撤销。

## 个人规划与隐私

公开源码不包含作者的课程表、作息、考试日期或复习任务。个人数据通过页面设置保存在当前浏览器：

- “设置 → 个人规划规则”保存课程、作息、保护时段和优先级。
- “复习 → 管理科目”保存考试科目、日期和目标时长。
- 复习页面根据本地科目生成通用计划，也可以逐项编辑任务。
- “导出个人配置”会生成包含私人数据的 JSON 文件。
- “导入个人配置”会覆盖当前浏览器中的复习计划。

导出的个人配置不应上传到公开仓库。仓库已经忽略 `/private/` 和 `/备考计划.md`，但仍应避免使用 `git add -f` 强制提交这些文件。

## 标签和事件格式

事件标题推荐使用：

```text
#标签 活动名
```

默认标签为：`学习`、`课程`、`科研`、`社工`、`运动`、`娱乐`、`工作`和`其他`。

事件描述可能包含以下兼容字段：

```text
预估时长：90分钟
实际：80分钟
状态：已完成
标签：学习
```

不要随意修改这些格式，否则历史事件、统计和桌面 Widget 可能无法正确解析。

## 部署

可以部署到 GitHub Pages、Cloudflare Pages 或其他静态托管服务：

1. 部署仓库中的 HTML、CSS 和 JavaScript 文件。
2. 确保站点使用 HTTPS。
3. 将完整站点来源加入 Google OAuth 客户端的授权 JavaScript 来源。
4. 访问部署地址并完成登录与本地设置。

本项目没有后端。Google Calendar 数据保存在 Google，任务镜像和个人设置保存在浏览器 localStorage。

## 项目结构

```text
index.html      页面结构和设置界面
style.css       页面样式
auth.js         Google OAuth、多账号和本地加密
calendar.js     Google Calendar API、事件格式和标签
ai.js           DeepSeek 请求、自然语言操作和智能排期
stats.js        时间统计和 AI 周报
calview.js      周/日日历视图
review.js       本地复习科目、任务、导入导出和日历同步
app.js          应用状态、导航和共享 UI
AGENTS.md       Codex 项目规范
CLAUDE.md       Claude Code 入口，引用 AGENTS.md
```

脚本由 `index.html` 按以下顺序加载：

```text
auth.js → calendar.js → ai.js → stats.js → calview.js → review.js → app.js
```

## 开发与验证

仓库目前没有自动化测试或 lint 命令。修改后至少需要：

1. 通过静态 HTTP 服务器打开页面。
2. 检查浏览器控制台。
3. 测试受影响的登录、日历和设置流程。
4. 验证用户内容经过 HTML 转义。
5. 修改标签或事件格式时检查 `calendar-widget`。

Codex 会读取 `AGENTS.md`。Claude Code 通过 `CLAUDE.md` 引用同一份规范，避免两套项目说明不同步。

## 已知限制

- DeepSeek API Key 位于浏览器端，不适合无法信任页面代码或浏览器环境的场景。
- Google Calendar 是事件的权威数据源，本地任务镜像可能短暂不同步。
- 个人配置默认只存在当前浏览器；清除站点数据前应先导出备份。
- 当前没有真正的离线能力、Web App Manifest 或 Service Worker。
- 复习计划的通用生成器只提供初始时间块，仍需结合课程和个人情况调整。

## License

[MIT License](LICENSE)

---

## English

Smart Calendar Assistant is a framework-free browser application for managing Google Calendar with natural-language commands, local planning rules, review-plan generation, calendar views, and statistics.

Personal schedules and exam plans are not embedded in the public source. They are stored in browser localStorage and can be imported or exported as private JSON files. The companion Electron widget lives in the separate [`calendar-widget`](https://github.com/brightcolin/calendar-widget) repository and shares only Google Calendar event data and the `#tag title` convention.

Serve the repository with a static HTTP server, configure a Google OAuth Web client, enter its Client ID near the top of `app.js`, and add a DeepSeek API Key from the Settings page. Production deployments require HTTPS.

Licensed under the [MIT License](LICENSE).
