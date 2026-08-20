# 微信公众号多账号绑定

## 当前接入方式

当前采用 AppID + AppSecret 直接绑定，适合本项目的私有部署。代码通过 `WechatAccountProvider` 边界调用微信官方接口，后续可以并存接入微信开放平台第三方授权。

使用的官方接口：

- 获取稳定版接口调用凭据：`POST https://api.weixin.qq.com/cgi-bin/stable_token`
- 官方文档：<https://developers.weixin.qq.com/doc/service/api/base/api_getstableaccesstoken>
- 微信 API 服务器 IP 文档：<https://developers.weixin.qq.com/doc/service/api/base/api_getapidomainip>

微信官方说明稳定版 Access Token 最长有效 7200 秒，普通模式在有效期内不会主动刷新，平台会提前约 5 分钟更新。本项目按返回有效期持久化缓存，并提前刷新。

## 生产配置

```dotenv
WECHAT_ENABLED=true
WECHAT_API_BASE_URL=https://api.weixin.qq.com
WECHAT_CREDENTIAL_KEY=<32 字节随机值的 Base64>
WECHAT_CREDENTIAL_KEY_VERSION=1
WECHAT_REQUEST_TIMEOUT_MS=10000
WECHAT_TOKEN_REFRESH_SKEW_SECONDS=300
WECHAT_ACCOUNTS_HARD_MAX=50
```

生成加密密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

密钥只能保存在服务器环境变量或密钥管理系统中，不得提交到 Git，不得和 JSON 数据文件一起公开。轮换时先保留旧版本解密能力，再重新加密数据；当前版本字段保存在密文信封中。

## 绑定步骤

1. 在微信公众平台取得公众号 AppID 和 AppSecret。
2. 把本服务器公网出口 IP 加到公众号接口 IP 白名单。
3. 登录并验证邮箱，确认会员套餐包含 `wechat.account.bind`。
4. 在编辑器顶部打开“公众号”，填写名称、AppID 和 AppSecret。
5. 服务端调用微信官方 `stable_token` 验证，成功后才保存绑定。

AppSecret 使用 AES-256-GCM 认证加密。API 响应只返回脱敏 AppID，不返回 AppSecret、密文、Access Token、IV 或认证标签。

## 数据与隔离

- `data/wechat/accounts.json`：公众号展示信息与加密凭据。
- `data/wechat/access-token-cache.json`：加密后的 Access Token 缓存。
- `data/wechat/authorizations.json`：未来第三方平台授权扩展点。
- 所有用户查询都同时检查 `accountId` 和 `userId`。
- 管理员只能查看脱敏状态；管理员代操作尚未开放。
- JSON 存储模式只允许运行一个 Node 进程。缓存持久化到文件，并在进程内合并同一公众号的并发刷新。

## 常见错误

- `WECHAT_INVALID_APP_ID`：AppID 不正确。
- `WECHAT_INVALID_APP_SECRET`：AppSecret 不正确。
- `WECHAT_IP_NOT_WHITELISTED`：服务器公网 IP 未加入公众号白名单。
- `WECHAT_APP_SECRET_FROZEN`：AppSecret 已在微信公众平台冻结。
- `WECHAT_RATE_LIMITED`：微信接口调用过于频繁。
- `WECHAT_ACCOUNT_NOT_FOUND`：公众号不存在或当前用户无权访问。

原始微信响应、密钥、Token 和堆栈不会返回浏览器。

## 回滚

1. 停止 Node 服务。
2. 恢复部署前的应用目录和 `.env`。
3. 如果需要回退数据，只恢复 `data/wechat/` 的同一时间点备份。
4. 启动服务并检查 `/api/health`、编辑器主页和 WordPress。

关闭 `WECHAT_ENABLED` 可以立即隐藏入口并停止公众号接口使用，不会删除已加密数据。
