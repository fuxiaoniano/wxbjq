# 傅小念的编辑器

本项目是一个本地优先的微信公众号富文本编辑器，使用原生 HTML、CSS、JavaScript 和 Node.js 原生 `http` 服务构建，数据以本地 JSON 文件保存。

项目现已包含邮箱账号、SMTP 邮件验证、安全会话，可扩展的套餐、会员、Feature、Entitlement 和配额体系，以及微信公众号多账号绑定、图片素材转换和草稿箱推送。当前仍使用本地 JSON 数据文件，不包含支付。

## 已有功能

- 可视化富文本编辑和 HTML 源码编辑。
- 加粗、斜体、下划线、无序列表、有序列表、对齐、撤销、重做、清除格式、分割线、字号。
- 文字色、背景色、模板主题色均支持 `#RRGGBB` 和 `#RRGGBBAA` 色值输入，输入编码后会反向定位颜色选择器，聚焦色值框可直接复制。
- 模板预览、模板搜索、分类筛选、只看自定义模板、模板插入到光标位置。
- 模板导入、保存、删除，public-stateless 模式下降级到浏览器存储。
- 草稿新建、覆盖保存、另存为、重命名、复制、恢复、删除。
- 停止输入约 1 秒后自动保存临时恢复记录。
- 插入链接、删除链接、插入图片 URL、本地图片/Data URL、粘贴图片、拖拽图片、删除选中图片。
- 文章统计、微信兼容检查、复制前自动清洗和转换。
- 导出当前 HTML、纯文本、草稿、模板和完整备份，支持完整备份导入。
- 邮箱注册、邮箱验证、登录、退出、修改密码、忘记密码和密码重置。
- HttpOnly Session Cookie、CSRF 防护、会话撤销和多设备登录管理。
- 免费、试用、有效、过期、取消、暂停、赠送和永久会员状态。
- 套餐功能、单用户特殊授权、周期配额和统一服务端权限判断。
- 用户、会员、套餐、功能、授权和审计日志管理界面。
- 独立管理后台与受保护的站点所有者账号。
- 一个会员绑定多个公众号、凭据认证加密和持久化 Access Token 缓存。
- 将当前文章预览并保存到微信公众号草稿箱，支持图片转换、配额控制和幂等提交。

## 本次升级内容

- 静态文件仅从 `public/` 目录读取，项目根目录、`data/`、`server/`、`.git/` 等不再通过 HTTP 暴露。
- 增加 URL 安全解码、路径穿越防护、异常 URL 兜底、`clientError` 处理。
- 增加安全响应头：CSP、nosniff、Referrer-Policy、X-Frame-Options、COOP、Permissions-Policy。
- 增加 local 和 public-stateless 两种运行模式。
- 写接口检查 Origin、Content-Type、`X-Editor-Request` 和 `Sec-Fetch-Site`。
- 增加请求体大小限制、简单内存限流、统一 JSON 错误结构。
- 前后端统一 HTML/CSS/URL 白名单清洗。
- 草稿和模板使用原子 JSON 写入，并保留 `.bak`。
- 前端拆分为原生 ES Modules，服务端拆分为 `server/` 模块。
- 增加 `node:test` 自动测试和语法检查脚本。
- 增加 SMTP Provider、一次性验证令牌、账号安全审计和登录/邮件限流。
- 增加会员套餐、Feature/Entitlement、配额和管理员 API。
- 增加微信公众号多账号绑定、AES-256-GCM 凭据加密和租户隔离。
- `2.2.0` 完成上线前审查：修复并发草稿/模板写入、微信草稿重复提交、远端成功后的本地故障误报、会员时间边界、主题换色和异常回退逻辑。
- 生产公网环境默认关闭未认证的共享草稿、模板与备份 API；账号、会员和公众号数据仍由受保护的服务端存储提供。
- 加强 HTML/CSS/链接清洗、远程图片下载上限、微信响应流大小和 JSON 备份恢复保护。
- 移除编辑器页面中已被独立管理后台取代的重复管理界面和代码。

## 项目结构

```text
.
├── public/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── autosave.js
│       ├── backup.js
│       ├── built-in-templates.js
│       ├── clipboard.js
│       ├── colors.js
│       ├── config.js
│       ├── drafts.js
│       ├── editor.js
│       ├── auth.js
│       ├── entitlements.js
│       ├── membership.js
│       ├── images.js
│       ├── sanitizer.js
│       ├── selection.js
│       ├── statistics.js
│       ├── templates.js
│       ├── toolbar.js
│       ├── utils.js
│       └── wechat-compatibility.js
├── server/
│   ├── admin/
│   ├── audit/
│   ├── auth/
│   ├── data/
│   ├── email/
│   ├── membership/
│   ├── wechat/
│   ├── backup.js
│   ├── compatibility.js
│   ├── config.js
│   ├── drafts.js
│   ├── responses.js
│   ├── router.js
│   ├── sanitizer.js
│   ├── security.js
│   ├── settings.js
│   ├── storage.js
│   └── templates.js
├── data/
│   ├── drafts/
│   ├── backups/
│   └── settings.json
├── tests/
├── docs/
├── server.js
├── system-templates.json
├── package.json
└── README.md
```

## Node.js 版本

建议使用 Node.js 20 或更新版本。

## 安装

项目使用 `dotenv` 读取 `.env`，使用 `nodemailer` 发送 SMTP 邮件。

```powershell
npm install
```

安装完成后使用 `npm start` 启动。

## 环境变量

复制 `.env.example` 为 `.env` 并修改。真实注册必须设置 `EMAIL_PROVIDER=smtp`、SMTP 服务器、发件邮箱和授权码。生产环境还必须设置 HTTPS `APP_PUBLIC_URL`、至少 32 位的 `SESSION_SECRET` 和 `COOKIE_SECURE=true`。启用公众号绑定时还必须设置 `WECHAT_CREDENTIAL_KEY`。

宝塔、QQ SMTP 和子路径部署的逐步说明见 [docs/DEPLOYMENT_BAOTA.md](docs/DEPLOYMENT_BAOTA.md)。
公众号配置和安全说明见 [docs/WECHAT_ACCOUNTS.md](docs/WECHAT_ACCOUNTS.md)。

## local 模式

适合本机使用：

```env
DEPLOYMENT_MODE=local
HOST=127.0.0.1
SERVER_STORAGE_ENABLED=true
```

行为：

- 仅监听回环地址。
- 允许草稿和模板写入本地 JSON 文件。
- 编辑器原有基础功能保持兼容；会员功能需要登录并验证邮箱。
- 写接口仍会检查 Origin、Content-Type、`X-Editor-Request` 和 `Sec-Fetch-Site`。
- 默认可信来源会包含 `127.0.0.1`、`localhost` 和 `[::1]` 的当前端口；如使用自定义域名或反向代理，请设置 `TRUSTED_ORIGINS`。

启动：

```powershell
$env:HOST="127.0.0.1"
$env:PORT="8090"
$env:DEPLOYMENT_MODE="local"
$env:SERVER_STORAGE_ENABLED="true"
node server.js
```

打开：

```text
http://127.0.0.1:8090/
```

## public-stateless 模式

适合只公开编辑器基础页面、不启用账号和服务器写入的部署：

```env
DEPLOYMENT_MODE=public-stateless
SERVER_STORAGE_ENABLED=false
```

行为：

- 可以公开访问编辑器页面。
- 禁止服务器端草稿、模板、设置和备份导入写入。
- 写接口返回 `403 SERVER_STORAGE_DISABLED`。
- 草稿、模板和图片仅在浏览器 localStorage、Data URL 或导出文件中管理。
- 默认关闭账号与会员接口。

需要注册、会员或 SMTP 时，应使用 `local` 模式并让 Node 只监听 `127.0.0.1`，再由 HTTPS Nginx 反向代理。

## 为什么公网无登录模式关闭服务器写入

现有草稿和模板接口为了兼容旧版，仍是共享数据，并未自动变成账号私有数据。`public-stateless` 模式会关闭全部服务端数据能力；此外，即使使用 `local` 模式，只要是 `NODE_ENV=production` 且 `APP_PUBLIC_URL` 指向公网，`ALLOW_UNAUTHENTICATED_REMOTE_STORAGE=false` 也会自动关闭共享草稿、模板与备份 API，前端改用浏览器 localStorage。账号、会员、管理员和公众号接口继续使用服务端数据，并执行身份与权限校验。

只有在外层已经提供可靠访问控制且明确接受共享数据风险时，才设置 `ALLOW_UNAUTHENTICATED_REMOTE_STORAGE=true`。

启动安全检查会拒绝以下危险组合：

```text
HOST 不是 127.0.0.1 或 ::1
SERVER_STORAGE_ENABLED=true
ALLOW_UNAUTHENTICATED_REMOTE_STORAGE 不等于 true
```

## 子路径部署

设置：

```env
APP_PUBLIC_URL=https://fuxiaonian.net/wechat-editor/public/
APP_BASE_PATH=/wechat-editor/public
TRUSTED_ORIGINS=https://fuxiaonian.net
```

页面会通过 meta 配置读取基础路径，API、JS、CSS 和健康检查都支持该基础路径。

## API

```text
GET    /api/health
GET    /api/drafts
POST   /api/drafts
GET    /api/drafts/:id
PUT    /api/drafts/:id
DELETE /api/drafts/:id
GET    /api/system-templates
POST   /api/system-templates
PUT    /api/system-templates
PUT    /api/system-templates/:id
DELETE /api/system-templates/:id
POST   /api/backup/export
POST   /api/backup/import
```

public-stateless 模式下，所有服务器写接口都会返回 403。

账号、会员和管理员 API 详见 [docs/AUTH_MEMBERSHIP.md](docs/AUTH_MEMBERSHIP.md)。

## 草稿管理

新草稿结构：

```json
{
  "id": "",
  "title": "",
  "html": "",
  "createdAt": "",
  "updatedAt": "",
  "savedAt": "",
  "wordCount": 0,
  "bytes": 0
}
```

旧草稿仍兼容。读取旧结构时会自动补齐字段并用原子写入保存，写入前保留 `.bak`。

## 自动保存恢复

编辑时停止输入约 1 秒后，会把临时内容保存到浏览器 localStorage。页面重新打开时如果检测到未保存内容，会显示：

```text
恢复 / 预览 / 忽略
```

正式保存成功后会清理一致的恢复记录。

## 模板管理

- 内置模板保存在前端模块中。
- 自定义模板在 local 模式下写入 `system-templates.json`。
- public-stateless 模式下保存到浏览器 localStorage，或通过导出 JSON 迁移。
- 导入 HTML 模板前会清洗危险标签、属性、协议和 CSS，并显示清洗报告。

## 主题色

支持：

```text
默认红、品牌红、清新绿、商务蓝、黑金、自定义颜色
```

色值输入支持 `#RRGGBB` 和 `#RRGGBBAA`。颜色块变化后会更新编码；输入编码后会反向定位颜色块。主题色保存到 localStorage，后续插入模板使用新颜色；已有正文不会自动改变，除非点击“更新正文主题色”。

## 微信兼容检查

复制前流程：

```text
HTML 清洗
→ 微信兼容检查
→ 兼容转换
→ 最终检查
→ 复制
```

检查项包括 flex、grid、gap、position、CSS 变量、class/id 依赖、style 标签、空图片、危险链接和超宽图片等。存在风险时会显示复制报告；安全错误不会允许“仍然复制”。

## HTML 清洗规则

允许标签：

```text
section, p, span, strong, b, i, em, u, s, h1, h2, h3,
blockquote, ul, ol, li, img, br, a
```

允许属性：

```text
style, href, src, alt, title, target, rel, data-width
```

链接协议允许：

```text
https:, http:, mailto:
```

图片协议允许：

```text
https:, http:, data:image/png, data:image/jpeg, data:image/webp, data:image/gif, blob:, /uploads/
```

CSS 仅保留公众号正文常用的安全内联属性，移除定位、脚本 URL、表达式、动画、复杂布局和编辑器内部属性。

## 图片能力

当前实现为浏览器本地能力：

- 输入图片 URL。
- 粘贴图片。
- 拖拽图片。
- 选择本地图片并转换为 Data URL。
- 设置图片说明、宽度、居中。
- 删除选中图片。

未实现服务器图片上传接口，因此没有 `/api/uploads`。
远程图片 URL 允许 `http` 和 `https`。如果编辑器页面部署在 HTTPS 站点上，浏览器或公众号后台仍可能按自身混合内容策略处理 HTTP 图片。

## 数据导入导出

支持：

```text
导出当前 HTML
导出当前纯文本
导出全部草稿
导出全部模板
导出完整备份
导入完整备份
```

完整备份结构：

```json
{
  "version": 1,
  "exportedAt": "",
  "drafts": [],
  "templates": [],
  "settings": {}
}
```

导入前会校验版本和字段，清洗全部 HTML，并在覆盖前自动生成备份。
合并导入不会静默覆盖同 ID 草稿或模板；发生 ID 冲突时会为导入项生成新 ID，并在接口返回中给出重命名数量。

## 数据存储位置

```text
data/drafts/*.json       草稿
data/backups/*.json      完整备份
data/settings.json       本地设置
data/auth/*.json         用户、会话、验证令牌哈希和审计日志
data/membership/*.json   套餐、会员、功能、授权和用量
data/wechat/*.json       公众号加密凭据、授权扩展和加密 Token 缓存
system-templates.json    自定义系统模板
localStorage             临时恢复、浏览器草稿、浏览器模板、主题色
```

## 数据备份

JSON 写入采用：

```text
临时文件
→ 写入并关闭
→ 备份旧文件
→ rename 替换正式文件
```

读取正式 JSON 失败时会尝试读取 `.bak`，并记录简化日志。

## 测试命令

```powershell
npm run check
npm run lint
npm run typecheck
npm test
npm run build
```

或直接：

```powershell
node tests/check-syntax.js
node --test
```

## 常见问题

### 能不能公网启用服务器草稿存储？

不建议。除非在可信内网、本机，或已经由 Nginx、VPN、Basic Auth 等外部访问控制保护。

### 注册成功但收不到邮件？

开发环境默认 `EMAIL_PROVIDER=console`，只记录邮件任务而不会发送。正式环境必须改为 `smtp` 并填写 SMTP 授权码；QQ 邮箱授权码不是 QQ 登录密码。

### 8 位色值是什么意思？

格式为 `#RRGGBBAA`，最后两位 `AA` 表示透明度。原生浏览器颜色选择器只支持 RGB，所以界面会用前 6 位反向定位颜色块，同时保留完整编码。

### Data URL 图片有什么限制？

Data URL 会增加 HTML 和草稿体积，刷新后仍可通过草稿或导出的 HTML 保留，但不适合大量大图。

## 密钥安全

- 不要提交真实的 `.env`、SMTP 授权码、Session Secret、微信公众号 AppID 或 AppSecret。
- `.env.example` 只保留占位说明，真实配置应放在本机或服务器环境变量中。
- 测试用例不要写完整的真实密钥形态；需要模拟微信公众号 AppID 或 AppSecret 时，应在运行时拼接测试值，避免触发 GitHub secret scanning。
- 如果 GitHub 提示已泄露密钥，应立即在对应服务商后台轮换该密钥，再清理仓库代码。

## 当前限制

- 会员数据仍使用 JSON 文件，仅支持单机、单 Node 进程；规模扩大前应迁移到事务数据库。
- 旧版共享草稿和模板尚未迁移为用户私有数据。
- 没有 AI 功能。
- 没有支付和微信公众号 OAuth 授权流程；当前采用管理员在本系统中直接绑定 AppID/AppSecret 的方式。
- 没有服务器图片上传接口。
- 微信后台最终渲染仍受微信公众号编辑器自身规则影响，复制前转换只能尽量提高兼容性。

## Nginx 反向代理示例

示例目标：

```text
https://fuxiaonian.net/wechat-editor/public/
```

需要账号和会员时，建议 Node 进程只监听回环地址并由 HTTPS Nginx 代理：

```env
HOST=127.0.0.1
PORT=8090
APP_BASE_PATH=/wechat-editor/public
APP_PUBLIC_URL=https://fuxiaonian.net/wechat-editor/public/
DEPLOYMENT_MODE=local
SERVER_STORAGE_ENABLED=true
AUTH_ENABLED=true
TRUSTED_ORIGINS=https://fuxiaonian.net
TRUST_PROXY_HEADERS=true
COOKIE_SECURE=true
```

只有在 Node 服务确实位于可信反向代理之后时，才建议设置 `TRUST_PROXY_HEADERS=true`。默认关闭时，限流使用直连 socket 地址，避免客户端伪造 `X-Forwarded-For` 绕过限流。

Nginx 示例：

```nginx
location /wechat-editor/public/ {
    client_max_body_size 4m;

    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

当前实际部署地址 `https://fuxiaonian.net/wechat-editor/public/` 的完整宝塔配置见 [docs/DEPLOYMENT_BAOTA.md](docs/DEPLOYMENT_BAOTA.md)。

不要把项目根目录、`data/` 目录或 `.git/` 目录配置为 Nginx 静态目录。静态资源应由应用仅从 `public/` 提供，或由 Nginx 单独指向经过确认的公开静态目录。
