# Huzoo（互圈）项目长期记录

## 项目概览
互助社交平台。用户亮出技能/资源，互相匹配需求。
- 前端：vanilla HTML/CSS/JS，无构建步骤
- 后端：Node.js + Express + SQLite (better-sqlite3)
- 部署：阿里云轻量服务器，PM2 + Nginx

## 功能版本记录

### v1（初始版本）
- 用户注册/登录（账号密码 + 微信 OAuth）
- 档案 CRUD（nickname/intro/offers/keywords/needs/wechat）
- 全文搜索（FTS5 优先，降级 LIKE）
- 收藏系统
- 举报 + 管理员处理
- 统计面板（热门能力/关键词/趋势图）
- 骨架屏 + 加载更多 + toast 通知

### v2（2026-06-19 深化）
- 站内私信系统（messages 表 + 完整 inbox UI）
- 城市字段（profiles.city）+ 同城筛选
- 微信号隐私保护（未登录显示「登录后可见」）
- 卡片详情弹窗（点击卡片主体打开）
- 未读消息 badge + 30s 轮询
- offer 列表卡片截断（前 3 条）

## 技术注意事项
- better-sqlite3 需与 Node.js 版本匹配编译，测试时用系统 Node（25.x）
- DB 迁移：db.js 底部有幂等 migrate() 函数，新字段用 ALTER TABLE 添加
- FTS5 不支持城市字段精确过滤，有城市筛选时自动降级 LIKE 分支
- JWT 黑名单内存存储，重启后失效（可接受，30 天 token 期限足够）
