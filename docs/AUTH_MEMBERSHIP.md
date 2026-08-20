# 账号与会员系统

管理后台使用独立页面 `admin.html`，不再通过编辑器弹窗打开。`ADMIN_EMAILS` 中配置的账号属于站点所有者，服务端禁止冻结、降级或取消其邮箱验证。

## 范围

当前阶段实现了邮箱注册、邮箱验证、登录、退出、找回密码、密码重置、修改密码、会话管理，以及完整的套餐、会员、功能授权、用户特殊授权、配额和管理员能力。

本阶段不包含支付，也不包含微信公众号绑定和草稿推送。会员只能由管理员人工开通，后续支付回调可以复用同一套 `memberships` 服务。

## 分层

```text
HTTP Router
  -> Auth / Membership / Admin Controller
  -> Validation + Authorization
  -> Auth / Membership / Admin Service
  -> JSON Collection Repository
  -> Atomic JSON Storage
```

- `server/auth/`：账号、密码、验证令牌、会话、Cookie 和 CSRF。
- `server/email/`：SMTP、开发环境 Console Provider，以及 HTML/纯文本邮件模板。
- `server/membership/`：套餐、会员状态、Feature、Entitlement 和 Quota。
- `server/admin/`：管理员业务和输入校验。
- `server/audit/`：安全脱敏后的审计日志。
- `public/js/auth.js`：注册登录和邮箱验证界面。
- `public/js/membership.js`：会员中心、安全设置和管理界面。
- `public/js/entitlements.js`：前端统一功能权限入口。

## 数据文件

所有文件默认位于 `data/`，首次启动自动创建：

```text
data/auth/users.json
data/auth/email-verification-tokens.json
data/auth/password-reset-tokens.json
data/auth/sessions.json
data/auth/audit-logs.json
data/membership/plans.json
data/membership/memberships.json
data/membership/features.json
data/membership/plan-features.json
data/membership/user-entitlements.json
data/membership/feature-usage.json
```

邮箱使用规范化值做唯一判断。密码只保存 `scrypt` 哈希；邮箱验证令牌、密码重置令牌和会话令牌只保存 HMAC-SHA256 哈希。JSON 写入采用临时文件、备份和原子替换，并用单进程文件锁避免并发覆盖。

JSON 存储适合当前单机、单 Node 进程部署。不要开启 PM2 cluster 或多个 Node 实例共同写同一目录。用户量增长或需要多实例部署时，应先把 Repository 替换为 PostgreSQL 或其他事务数据库。

## 会员状态

支持：

- `free`：默认免费用户。
- `trialing`：试用会员。
- `active`：有效会员。
- `expired`：已过期。
- `canceled`：已取消。
- `paused`：已暂停。
- `granted`：管理员赠送。
- `lifetime`：永久会员。

有效套餐按 `rank` 选择最高等级。结束时间到达后，即使数据库字段仍为 `active`，权限判断也会把它视为过期。

## 功能授权

预置功能标识：

```text
wechat.account.bind
wechat.account.multiple
wechat.draft.create
editor.premium.xxx
```

服务端是唯一可信判断来源。后续受限接口使用：

```js
const { requireFeature } = require("./server/auth/authorization");

const { authContext, feature } = await requireFeature(
  req,
  config,
  "wechat.draft.create",
);
```

真正完成一次计费操作后，使用 `getMembershipService(config).consumeFeatureUsage(user, featureKey)` 原子增加用量。不要在操作开始前扣除，也不要只依赖前端按钮隐藏。

前端统一使用 `public/js/entitlements.js` 的 `checkFeature` 或 `requireFeature`。它会区分未登录、邮箱未验证、套餐不足和配额耗尽，并触发统一界面提示。

## API

账号：

```text
POST   /api/auth/register
POST   /api/auth/resend-verification
POST   /api/auth/verify-email
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/change-password
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
```

会员与功能：

```text
GET /api/membership/me
GET /api/membership/plans
GET /api/features
GET /api/features/:featureKey/check
```

管理员：

```text
GET/PATCH  /api/admin/users[/:id]
GET/POST   /api/admin/membership-plans
PATCH      /api/admin/membership-plans/:id
GET/POST   /api/admin/features
PATCH      /api/admin/features/:id
GET        /api/admin/plan-features
PUT        /api/admin/plans/:planId/features/:featureKey
GET/POST   /api/admin/memberships
PATCH      /api/admin/memberships/:id
GET/POST   /api/admin/entitlements
PATCH/DELETE /api/admin/entitlements/:id
GET        /api/admin/audit-logs
```

管理员接口同时检查登录、邮箱验证、管理员角色、可信 Origin、自定义请求头和 CSRF Token。

## 安全边界

- Session Cookie 使用 `HttpOnly`、`SameSite=Lax`，生产环境强制 `Secure`。
- 登录生成全新会话，修改密码和重置密码会撤销旧会话。
- 状态写操作需要可信 Origin、`X-Editor-Request` 和会话 CSRF Token。
- 登录、注册、验证邮件和重置邮件分别限流。
- 注册、重发验证和忘记密码使用统一响应，避免邮箱枚举。
- 邮件链接只使用 `APP_PUBLIC_URL`，不读取请求的 Host 生成链接。
- 审计元数据会自动遮盖 password、secret、token、cookie、authorization 等字段。
- API 永远不返回密码哈希、验证令牌、重置令牌或完整会话令牌。

## 回滚

1. 停止 Node 服务。
2. 完整备份 `data/` 和 `.env`。
3. 恢复上一版本代码及 `package-lock.json`。
4. 如果回滚版本不认识会员数据，保留 `data/auth/` 和 `data/membership/`，不要删除；旧版本不会读取它们。
5. 运行 `npm ci`，启动旧版本并检查 `/api/health`。

本阶段没有修改旧草稿和模板的数据结构，因此账号会员系统可以独立回滚。
