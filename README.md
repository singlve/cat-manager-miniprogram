# 宠物健康管家

微信小程序，管理宠物的健康记录、提醒和基本信息。支持猫、狗等多种宠物。

## 功能

- 宠物档案管理（添加、编辑、删除、头像上传、状态管理）
- 健康记录追踪（洗澡、驱虫、疫苗、体检等，支持分页和筛选）
- 体重记录（精确到时分秒，折线图追踪变化趋势）
- 智能提醒（逾期/即将/未来分组，订阅消息推送）
- 记账本（月/年视图、分类统计、柱状图、宠物独立核算）
- 积分商城（虚拟/实物商品兑换，补签卡、背包、收货地址）
- 留言板（发布、点赞、评论回复、通知中心、管理员采纳/删除）
- 管理员后台（公告管理、数据管理、商品管理、发货管理）
- 签到系统（连续签到、补签、抽奖转盘、累积奖励）
- 数据云同步（微信云开发，本地存储自动降级）
- UGC 内容安全校验

## 技术栈

- 原生微信小程序
- 微信云开发（CloudBase）
- WXML + WXSS + JavaScript
- Vitest（单元测试）

## 本地开发

1. 克隆仓库
2. 用微信开发者工具打开项目
3. 配置 AppID（`project.config.json`）
4. 开通云开发并创建集合：`cats`、`health_records`、`weight_records`、`reminders`、`users`、`user_inventory`、`redeem_items`、`redeem_records`、`avatar_frames`、`shipping_addresses`、`expenses`、`feedback`、`notifications`、`announcements`、`shipments`
5. 部署云函数：

| 云函数 | 用途 |
|--------|------|
| `login` | 获取 openid |
| `getPhoneNumber` | 微信手机号解密 |
| `checkReminders` | 定时检查提醒并推送订阅消息（需配置定时触发器 + 模板 ID） |
| `adminUsers` | 管理员搜索/编辑用户数据 |
| `adminFeedback` | 留言板操作（采纳/删除/评论/点赞/通知/文件链接） |
| `adminAnnouncement` | 公告增删改查 |
| `getAdminRecords` | 管理员查询兑换记录和发货单 |
| `queryExpress` | 快递查询 |
| `contentCheck` | UGC 内容安全校验（文本/图片） |

## 版本

**v1.3** — iOS 输入体验修复、留言板通知中心、内容安全校验、多项 bug 修复和优化
