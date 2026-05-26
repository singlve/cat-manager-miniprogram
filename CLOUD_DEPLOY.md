# ☁️ 云开发部署指南

## 当前状态
- 所有页面已统一走 `clouddb.js` 数据层，支持**云端 + 本地**自动切换
- `FORCE_LOCAL = true` 时使用本地存储，无需配置即可开发调试
- 云函数 `login`（获取 openid）和 `checkReminders`（定时提醒）已就绪

## 开通步骤（约 5 分钟）

### 1. 开通云开发
在微信开发者工具中：
- 点击工具栏 **「云开发」** 按钮
- 如果是第一次，会提示开通 → 选择**免费基础版**（够用）
- 记下 **环境 ID**（格式如 `cat-health-xxxx`）

### 2. 配置环境 ID
打开 `app.js`，找到这行：
```js
const envId = 'YOUR_ENV_ID';
```
替换为你的环境 ID：
```js
const envId = 'cat-health-xxxx';
```

### 3. 关闭调试开关
- `utils/clouddb.js` 第 6 行：`FORCE_LOCAL = true` → 改为 `false`
- `pages/login/login.js` 第 4 行：`FORCE_MOCK = true` → 改为 `false`
- `pages/register/register.js` 第 4 行：`FORCE_MOCK = true` → 改为 `false`

### 4. 部署云函数
在开发者工具中：
- 右键 `cloudfunctions/login` 文件夹 → **「上传并部署：云端安装依赖」**
- 右键 `cloudfunctions/checkReminders` 文件夹 → **「上传并部署：云端安装依赖」**

### 5. 创建数据库集合
在「云开发」控制台 → 数据库，创建以下 5 个集合：
- `cats`          猫咪档案
- `health_records` 健康记录
- `reminders`     提醒
- `users`         用户

> 每个集合点击权限设置 → 选择 **「所有用户可读，仅创建者可写」**

### 6. 配置定时提醒（可选）
在「云开发」控制台 → 云函数 → `checkReminders` → 触发器：
- 添加触发器，Cron 表达式：`0 0 1 * * * *`（每天凌晨 1 点执行）
- 需要先在「设置 → 消息推送」申请订阅消息模板
- 模板 ID 需与小程序端 `pages/reminder-add/reminder-add.js` / `pages/reminders/reminders.js` 中的 `SUBSCRIBE_TMPL_ID` 保持一致
- 云函数环境变量必须配置 `WECHAT_APPSECRET`，用于定时任务获取微信接口 `access_token`
- 可在云函数环境变量中配置 `WECHAT_APPID`；未配置时使用 `wx1362cb2063c2e367`
- 可在云函数环境变量中配置 `TEMPLATE_ID`；未配置时会使用代码中的默认模板 ID
- 可在云函数环境变量中配置 `MINIPROGRAM_STATE`：正式版用 `formal`，体验版用 `trial`，开发版用 `developer`
- 部署后建议在云开发控制台手动运行一次 `checkReminders`，查看返回的 `sent`、`failed`、`skippedNoOpenid` 等统计

## 数据迁移
首次切到云端后，本地 storage 里的数据不会自动上传。
如需迁移，可在「我的」页面长按「猫咪档案」触发导出功能（后续可加）。

## 本地调试
保持 `FORCE_LOCAL = true`，所有数据存在本地，刷新不丢失。
测试账号：`13800138000` / `123456`
