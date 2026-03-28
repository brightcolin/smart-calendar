# 智能日历助手

自然语言驱动的 Google Calendar 任务管理工具，支持添加到 iPhone 主屏幕使用。纯前端实现，无需后端服务器，数据直接存储在你的 Google Calendar。

> ⚠️ 当前为测试阶段，暂不对外开放登录。如需体验请联系作者添加测试账号。

---

## 功能

### 自然语言操作
直接输入中文描述，系统自动解析并同步到 Google Calendar：

```
创建：「#工作 明天14:00开会一小时，提前15分钟提醒」
修改：「把今天的会议推迟到16:00」
完成：「标记写周报已完成」
追加：「帮刚才创建的活动加备注：带笔记本」
```

支持模糊时间（早上、下午、晚上）、相对日期（明天、下周五、3天后）、模糊时长（一小时、大概两小时左右）。修改时支持跨日期搜索，±7天范围内自动查找目标活动。

### 标签与颜色
标签写在活动名称前面，格式为 `#标签 活动名`，颜色自动同步到 Google Calendar：

| 标签 | 颜色 |
|------|------|
| #学习 | 蓝色 |
| #课程 | 紫色 |
| #科研 | 青色 |
| #社工 | 绿色 |
| #运动 | 橙色 |
| #娱乐 | 粉色 |
| #工作 | 红色 |
| #其他 | 灰色 |

点击任意活动卡片上的标签徽章可随时修改，颜色同步回 Google Calendar。

### 可视化日历视图
底部导航「▦ 日历」，支持周视图和日视图，事件块按标签颜色显示，点击空白时段快速创建，点击事件块查看详情或操作。

### 番茄钟
今日页面右上角 🍅 按钮打开。支持自定义专注/短休息/长休息时长，可关联今日任务，专注结束后自动记录时间到任务备注，阶段结束时播放提示音并发送系统通知。

### 统计分析
- 日视图 / 周视图切换
- 按日历分布、按标签分布
- 相同活动合并统计（多次「写周报」显示总耗时和平均耗时）
- 预估 vs 实际时间对比（独立进度条）
- DeepSeek AI 生成周报（纯文本，无格式符号）

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
├── calview.js      # 可视化日历视图
├── stats.js        # 统计图表与周报
└── pomodoro.js     # 番茄钟
```

---

## 自行部署

### 前置条件
- Google 账号
- GitHub 账号
- DeepSeek API Key（[申请](https://platform.deepseek.com/api_keys)，按量计费，个人使用费用极低）

### 步骤

**1. 创建 Google Cloud 项目**

打开 [console.cloud.google.com](https://console.cloud.google.com)，新建项目。

**2. 启用 Google Calendar API**

API 和服务 → 库 → 搜索 Google Calendar API → 启用。

**3. 配置 OAuth 同意屏幕**

API 和服务 → OAuth 同意屏幕 → 外部 → 创建。填写应用名称，添加以下三个范围：

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

添加测试用户（你的 Gmail）。

**4. 创建 OAuth 凭据**

凭据 → 创建凭据 → OAuth 客户端 ID → Web 应用。

已获授权的 JavaScript 来源填入：
```
https://你的用户名.github.io
```

复制生成的客户端 ID。

**5. 填入 Client ID**

打开 `app.js` 第一行，替换为你的客户端 ID：

```javascript
const GOOGLE_CLIENT_ID = '你的客户端ID.apps.googleusercontent.com';
```

**6. 部署到 GitHub Pages**

Fork 本仓库或上传文件到新仓库（Public），进入 Settings → Pages → Branch: main → Save。约1分钟后访问 `https://你的用户名.github.io/仓库名`。

> 必须通过 https:// 网址访问，本地直接打开文件会报 Error 400。

**7. 添加到 iPhone 主屏幕**

Safari 打开网址 → 分享 → 添加到主屏幕。

**8. 首次配置**

登录后进入设置，填入 DeepSeek API Key 并保存。

---

## 安全说明

所有敏感数据仅存储在本地，不经过任何第三方服务器：

| 数据 | 存储 | 加密 |
|------|------|------|
| Google Token | localStorage | AES-GCM 256位 |
| DeepSeek Key | localStorage | AES-GCM 256位 |
| 任务记录 | localStorage | 无（非敏感） |
| 日历事件 | Google Calendar | Google 负责 |

撤销授权：[myaccount.google.com/permissions](https://myaccount.google.com/permissions)

---

## 常见问题

**Error 401 invalid_client**
`app.js` 第一行的 Client ID 未正确填写，或 Google Cloud Console 中授权的 JavaScript 来源未包含你的 GitHub Pages 域名（修改后等待约5分钟生效）。

**登录后看不到事件**
点击今日页面右上角「刷新」，或检查顶部日历选择器是否选择了正确的日历。

**自然语言找不到要修改的活动**
系统会在目标日期 ±7 天内搜索。描述时可加上大概日期，如「上周五的那个开会」。

---

## License

MIT
