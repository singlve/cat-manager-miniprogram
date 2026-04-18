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

## 数据迁移
首次切到云端后，本地 storage 里的数据不会自动上传。
如需迁移，可在「我的」页面长按「猫咪档案」触发导出功能（后续可加）。

## 本地调试
保持 `FORCE_LOCAL = true`，所有数据存在本地，刷新不丢失。
测试账号：`13800138000` / `123456`
