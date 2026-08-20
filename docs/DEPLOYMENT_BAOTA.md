# 宝塔面板部署说明

下面按当前站点地址说明：

```text
网站：https://fuxiaonian.net
编辑器：https://fuxiaonian.net/wechat-editor/public/
项目目录：/www/wwwroot/fuxiaonian.net/wechat-editor
Node 内部端口：8090
```

会员 Cookie 在生产环境必须使用 HTTPS。请确保 `fuxiaonian.net` 已启用有效证书，再继续下面配置。

## 1. 上传和安装

把项目放到：

```text
/www/wwwroot/fuxiaonian.net/wechat-editor
```

在宝塔终端执行：

```bash
cd /www/wwwroot/fuxiaonian.net/wechat-editor
npm ci --omit=dev
```

`node_modules` 不需要从本地上传，服务器会根据 `package-lock.json` 安装。

## 2. 创建生产环境配置

在宝塔文件管理中进入项目目录，新建或编辑 `.env`。不要把下面的占位值原样使用：

```env
HOST=127.0.0.1
PORT=8090
NODE_ENV=production

APP_PUBLIC_URL=https://fuxiaonian.net/wechat-editor/public/
APP_BASE_PATH=/wechat-editor/public
DEPLOYMENT_MODE=local
SERVER_STORAGE_ENABLED=true
ALLOW_UNAUTHENTICATED_REMOTE_STORAGE=false

TRUSTED_ORIGINS=https://fuxiaonian.net
TRUST_PROXY_HEADERS=true

AUTH_ENABLED=true
REGISTRATION_ENABLED=true
ALLOW_UNVERIFIED_LOGIN=true
SESSION_SECRET=这里换成至少32位的随机字符串
COOKIE_SECURE=true
SESSION_TTL_HOURS=12
REMEMBER_SESSION_TTL_DAYS=30
EMAIL_VERIFICATION_TTL_HOURS=24
PASSWORD_RESET_TTL_MINUTES=30

ADMIN_EMAILS=你的管理员邮箱

EMAIL_PROVIDER=smtp
EMAIL_FROM_NAME=傅小念的编辑器
EMAIL_FROM_ADDRESS=你的QQ邮箱
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的QQ邮箱
SMTP_PASS=你的QQ邮箱SMTP授权码

AUTOMATION_GUARD_PROVIDER=none
REGISTER_RATE_LIMIT_PER_HOUR=5
LOGIN_RATE_LIMIT_PER_15_MINUTES=10
EMAIL_RATE_LIMIT_PER_HOUR=5
PASSWORD_RESET_RATE_LIMIT_PER_HOUR=5

WECHAT_ENABLED=true
WECHAT_API_BASE_URL=https://api.weixin.qq.com
WECHAT_CREDENTIAL_KEY=这里换成32字节随机值的Base64
WECHAT_CREDENTIAL_KEY_VERSION=1
WECHAT_REQUEST_TIMEOUT_MS=10000
WECHAT_TOKEN_REFRESH_SKEW_SECONDS=300
```

生成 `SESSION_SECRET`：

```bash
openssl rand -base64 48
```

把命令输出的一整行填到 `SESSION_SECRET=` 后面。不要把它发给别人，也不要提交到 Git。

生成微信公众号凭据加密密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把输出填到 `WECHAT_CREDENTIAL_KEY=` 后面。该密钥丢失后已绑定的 AppSecret 无法解密，必须和 `.env` 一起安全备份。

QQ 邮箱中的 `SMTP_PASS` 不是 QQ 登录密码。请进入 QQ 邮箱设置，开启 SMTP 服务并生成“授权码”，把授权码填进去。`SMTP_USER` 和 `EMAIL_FROM_ADDRESS` 通常填写同一个完整 QQ 邮箱地址。

`ADMIN_EMAILS` 填站点所有者邮箱。注册并验证后，该账号会自动显示“管理后台”入口；后台会在新页面打开。该账号不能被其他管理员冻结或降级。

## 3. 配置 Node 项目

在宝塔安装“Node.js 版本管理器”，然后添加 Node 项目：

```text
项目目录：/www/wwwroot/fuxiaonian.net/wechat-editor
启动文件：server.js
运行用户：www
Node 版本：20 或更高
端口：8090
```

只启动一个 Node 进程。当前会员数据使用 JSON 文件，不能使用 PM2 cluster 或多个实例共同写入同一个 `data/`。

启动后在服务器终端检查：

```bash
curl http://127.0.0.1:8090/wechat-editor/public/api/health
```

看到包含 `"status":"ok"` 的 JSON，说明 Node 服务正常。

## 4. 配置 Nginx

在宝塔中打开现有站点 `fuxiaonian.net` 的 Nginx 配置，在同一个 `server` 块内加入下面的子路径反向代理，不需要新建子域名站点：

```nginx
location /wechat-editor/public/ {
    proxy_pass http://127.0.0.1:8090;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_redirect off;
    client_max_body_size 2m;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
}
```

这条精确的子路径代理规则会把编辑器请求交给 Node 服务，WordPress 其余路径保持原样。

保存配置。宝塔会检查 Nginx 语法；通过后重载 Nginx。

## 5. 完整检查

依次检查：

```text
https://fuxiaonian.net/wechat-editor/public/api/health
https://fuxiaonian.net/wechat-editor/public/
```

然后在页面中：

1. 点击“登录 / 注册”。
2. 用 `ADMIN_EMAILS` 中的邮箱注册。
3. 检查邮箱并点击验证链接。
4. 登录后打开“管理后台”，确认它在新页面显示。
5. 再注册一个普通账号，并由管理员开通专业会员。
6. 测试忘记密码邮件。
7. 在公众号平台把服务器公网 IP 加入接口白名单，再测试公众号绑定。

## 常见错误

`502 Bad Gateway`：Node 项目没有启动，或不是监听 `127.0.0.1:8090`。先运行内部 `curl`。

`EADDRINUSE 8090`：8090 已被其他进程占用。不要重复启动项目；先在宝塔 Node 项目列表检查是否已经运行。

页面能打开但登录接口 404：`.env` 中 `APP_BASE_PATH` 不是 `/wechat-editor/public`，或者 Nginx 没有使用上面的 `^~` 规则。

登录成功后马上掉线：公网地址没有使用 HTTPS，或 `APP_PUBLIC_URL`、`COOKIE_SECURE` 配置不正确。

收不到邮件：检查 `EMAIL_PROVIDER=smtp`、QQ SMTP 授权码、发件邮箱，并查看 Node 项目日志中的错误码。日志不会打印密码或验证令牌。

启动时报 `APP_PUBLIC_URL 必须使用 HTTPS`：生产环境安全检查正常生效，请先给网站开启 SSL，再把地址改为 `https://`。

## 备份与回滚

升级前备份：

```bash
cd /www/wwwroot/fuxiaonian.net/wechat-editor
tar -czf /www/backup/wechat-editor-data-$(date +%F-%H%M).tar.gz data .env
```

回滚时停止 Node 项目，恢复旧代码和 `package-lock.json`，执行 `npm ci --omit=dev`，再启动。不要删除 `data/auth/`、`data/membership/` 和 `data/wechat/`，它们包含用户、会员、公众号加密凭据和审计数据。
