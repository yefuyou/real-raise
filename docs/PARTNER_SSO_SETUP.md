# Real Raise × InfiniSynapse Partner SSO

当前实现采用 InfiniSynapse 官方 Partner SSO 授权码流程：

1. 浏览器访问 `/api/auth/infini/start`。
2. Worker 使用服务端 `X-Client-Id` / `X-Client-Secret` 创建登录会话并跳转到平台 `entryUrl`。
3. 平台回调 `/api/auth/infini/callback?code=...&state=...`。
4. Worker 一次性消费 `state`，用 `code` 换取平台用户资料，并请求 `withApiKey: true`。
5. Partner API Key 只存 Durable Object；浏览器只拿到 `HttpOnly` 的不透明会话 Cookie。
6. `/api/auth/me` 只返回 `id`、昵称、头像和 `canRunAnalysis`；`/api/auth/logout` 使会话失效。

官方参考：[InfiniSynapse Partner SSO Integration Guide](https://infinisynapse.cn/zh/docs/InfiniSynapse%20Partner%20SSO%20Integration%20Guide)

## 平台后台注册

在 `https://app.infinisynapse.cn/tasks` 登录后：

`设置 → 第三方接入 → 创建接入应用`

建议填写：

- 应用名称：`Real Raise`
- 回调域名白名单：`plain-wind-ae46.yefuyou2333.workers.dev`
- 本地调试需要时再加入：`localhost`、`127.0.0.1`
- Webhook：第一版留空

创建后只会展示一次 `clientId` / `clientSecret`。不要把值发到聊天、写入仓库或前端构建产物。

## Worker Secret

使用 Cloudflare Secret 注入，不写入 `wrangler.jsonc`：

```text
INFINI_PARTNER_CLIENT_ID
INFINI_PARTNER_CLIENT_SECRET
```

本地 Worker 可复制 `.dev.vars.example` 为 `.dev.vars` 后填写；`.dev.vars` 已被忽略。正式配置前先运行：

```text
npm run worker:test
npm run server:test
npm test
```

再用 Node.js 22+ 执行：

```text
wrangler deploy --dry-run
```

## 不能跳过的验收

- 未登录用户仍可本地计算、Replay、Mock。
- 登录回调的 `state` 缺失、错误、过期或重放都会被拒绝。
- `/api/auth/me` 和前端产物不包含 Partner API Key。
- 真实分析使用登录用户的 Partner API Key；旧评委口令模式仍可回退。
- 退出登录后会话失效，不会替用户删除平台 API Key。
- 本地联调必须使用 `credentials: include`，否则跨域访问远端 Worker 时不会带上 HttpOnly Cookie。

当前只完成代码和本地验证，尚未注册平台应用、写入真实 Secret 或部署。
