# 智能日历任务助手

自然语言创建与管理任务，与 Google Calendar 深度集成，DeepSeek AI 驱动。

**MIT License · 多文件 · 无需后端 · 可添加到 iPhone 主屏幕**

---

## 功能清单

- 多账号管理，凭据 AES-GCM 加密存储，下次打开自动恢复
- 自然语言创建任务（「明天下午3点开会一小时」）
- 自然语言修改任务（「把今天下午的会议推迟到4点」）
- 读取 Google Calendar 现有事件
- 多日历切换
- 任务标签颜色自动同步到 Google Calendar 事件
- 任务描述 + 自定义提醒时间和方式（弹窗/邮件）
- 批量操作：批量完成、批量改时间、批量删除
- 工作时间设定，超出范围时提示
- 每日/每周统计，按日历维度 + 按标签维度
- 预估 vs 实际时间可视化对比（双进度条）
- DeepSeek AI 今日分析 + 周报生成
- 自动读取本地时区，跨时区安全

---

## ⚠ 重要：必须通过 https:// 网址打开

直接双击 index.html 会报 Error 400。
必须部署到 GitHub Pages 或任何 https 服务后通过网址访问。

---

## 完整操作步骤

### 第一步：创建 Google Cloud 项目

1. 打开 https://console.cloud.google.com
2. 顶部下拉 → 「新建项目」→ 名称 smart-calendar → 「创建」

### 第二步：启用 Google Calendar API

1. 左侧 → 「API 和服务」→「库」
2. 搜索 Google Calendar API → 「启用」

### 第三步：配置 OAuth 同意屏幕

1. 左侧 → 「API 和服务」→「OAuth 同意屏幕」
2. 用户类型「外部」→「创建」
3. 填写应用名称（智能日历助手）和你的 Gmail
4. 「保存并继续」
5. 添加范围：https://www.googleapis.com/auth/calendar 和 https://www.googleapis.com/auth/userinfo.profile 和 https://www.googleapis.com/auth/userinfo.email
6. 添加测试用户：你的 Gmail → 保存

### 第四步：创建 OAuth 凭据

1. 左侧 → 「凭据」→「+ 创建凭据」→「OAuth 客户端 ID」
2. 应用类型「Web 应用」
3. 「已获授权的 JavaScript 来源」添加：https://你的用户名.github.io
4. 创建 → 复制客户端 ID

### 第五步：修改代码

用文本编辑器打开 app.js，找到第一行：

  const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';

替换为你的客户端 ID，保存。

### 第六步：上传到 GitHub Pages

1. 登录 github.com → 新建仓库 smart-calendar（Public）
2. 上传所有文件：index.html、style.css、app.js、auth.js、calendar.js、ai.js、stats.js、README.md
3. 仓库 Settings → Pages → Branch: main → Save
4. 约 1 分钟后得到：https://你的用户名.github.io/smart-calendar

### 第七步：在 iPhone 上安装

1. Safari 打开网址
2. 分享按钮 → 「添加到主屏幕」→「添加」

### 第八步：首次使用

1. 点击「使用 Google 账号登录」→ 允许
2. 进入设置，填入 DeepSeek API Key（申请：https://platform.deepseek.com/api_keys）
3. 点击「保存设置」→ Key 加密保存，下次无需重新输入

---

## 如何撤销 Google 权限

方式一：https://myaccount.google.com/permissions → 找到「智能日历助手」→ 撤销
方式二：应用内账号管理 → 移除账号（同时调用 Google API 撤销 Token）

---

## 数据说明

| 数据 | 存储位置 | 加密 |
|------|---------|------|
| Google Token | localStorage | ✅ AES-GCM |
| DeepSeek Key | localStorage | ✅ AES-GCM |
| 用户名/头像 | localStorage（账号对象内） | ✅ AES-GCM |
| 任务记录 | localStorage | ❌（非敏感） |
| 偏好设置 | localStorage | ❌（非敏感） |

加密密钥由设备指纹（UA+分辨率+语言）通过 PBKDF2 派生，不存储密钥本身。

---

MIT License
