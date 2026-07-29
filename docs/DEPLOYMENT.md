# 比赛部署：现有静态站 + 受限 Cloudflare Worker

## 目标

不迁移已经提交的静态站，只把实时分析链路改成：

```text
现有静态页面
  → plain-wind-ae46.yefuyou2333.workers.dev/api/analysis
  → 服务端 Secret
  → InfiniSynapse Server API
```

工资、住房、日常支出和购买力继续由浏览器中的确定性公式计算。Worker 会重新核算关键结果后再生成固定 Prompt；浏览器提交的 `calculation` 不被信任。

## 已实现的安全边界

- Worker Secret 保存 `INFINISYNAPSE_API_KEY`，不进入 GitHub、构建产物或浏览器。
- `JUDGE_ACCESS_CODE` 只用于评委解锁，验证后签发短时会话；`JUDGE_TOKEN_SECRET` 用于签名会话。两者同样只存 Worker Secret。
- `/api/analysis` 强制验证评委会话；只配置 CORS 不能代替身份认证。
- 只接受结构化金额；拒绝自由 Prompt、任意模型、文件上传和未知字段。
- 请求体上限 20 KB，金额和通胀率都有范围校验。
- CORS 只允许 `ALLOWED_ORIGINS` 中的现有静态站。
- Cloudflare Rate Limiting：同一来源每 60 秒最多 1 次。
- InfiniSynapse 长任务默认最多运行 10 分钟（`ANALYSIS_TIMEOUT_MS=600000`，部署环境可在 1–15 分钟范围内调节）。
- Durable Object 硬保险丝：北京时间每天最多 10 次真实调用，同时最多 1 个任务。
- Worker 不保存工资输入或分析结果；Durable Object 只保存日期、调用数和短期 lease。
- 达到限速、每日上限或 Live 关闭时，前端优先进入真实存档回放，再进入本地演示。
- 日志只记录 `requestId`、结果和耗时，不记录 Key、工资、Prompt、Authorization 或完整平台响应。

## 本地检查

Cloudflare Wrangler 4 需要 Node.js 22 或更高版本。现有 Vite 应用仍可使用当前 Node 版本。

```bash
npm ci
npm run worker:test
npm run verify
npm run worker:check
```

本地 Worker 联调时复制 `.dev.vars.example` 为 `.dev.vars`，只在本机填 Key：

```bash
npm run worker:dev
```

`.dev.vars` 已被 `.gitignore` 排除。

## 首次部署

1. 登录 Cloudflare：

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

2. 在 `wrangler.jsonc` 中把 `ALLOWED_ORIGINS` 改为真实静态站 Origin。保留本地 Origin 仅用于开发。

3. 保持 `LIVE_ANALYSIS_ENABLED=false`，先部署骨架：

   ```bash
   npm run worker:deploy
   ```

4. 确认准确 Worker 后再录入三个 Secret；命令会从标准输入读取，不要把值放进命令参数：

   ```bash
   npx wrangler secret put INFINISYNAPSE_API_KEY
   npx wrangler secret put JUDGE_ACCESS_CODE
   npx wrangler secret put JUDGE_TOKEN_SECRET
   ```

   `JUDGE_ACCESS_CODE` 使用单独的长口令，只发给评委；`JUDGE_TOKEN_SECRET` 使用密码管理器生成的至少 32 字节随机值，不与前两者复用。

5. 访问：

   ```text
   https://plain-wind-ae46.yefuyou2333.workers.dev/health
   ```

   应返回 `ok: true`、`liveEnabled: false` 且 `judgeAccessConfigured: true`。

6. 把 `LIVE_ANALYSIS_ENABLED` 改为 `true` 后重新部署。

7. 构建静态站时配置：

   ```text
   VITE_ANALYSIS_API_URL=https://plain-wind-ae46.yefuyou2333.workers.dev
   ```

   未配置这个变量的构建继续保留 replay / mock 路径，便于本地回滚；生产构建应指向同一个 Worker URL。

## 最终盖章

只运行一条真实任务：

1. 浏览器 Network 只请求自己的 `/api/analysis`，没有 InfiniSynapse Key。
2. 未输入评委口令时真实分析按钮不可点击；错误口令无法换取会话。
3. 正确口令解锁后，Worker 返回 `started → progress → completed`。
4. 页面能下载 `explanation.md`、`evidence.csv`、`analysis-manifest.json`。
5. `analysis-manifest.json` 内有本次 `vendorTaskId`。
6. InfiniSynapse 后台能查到相同任务。
7. Worker Logs 不包含工资、Prompt、评委口令、会话令牌或 API Key。
8. 把 task ID、后台截图和 30 秒录屏加入报名材料。

## 紧急回滚

最快的止损方式：

```json
"LIVE_ANALYSIS_ENABLED": "false"
```

重新部署 Worker 后，新请求不再消耗 InfiniSynapse 额度，静态站自动使用回放/演示。若怀疑 Key 泄露，再到平台轮换 Key，并重新执行 `wrangler secret put`。

## 每次发布都必须重新确认

仓库文档不记录 Secret，也不把某次成功部署当作永久事实。每次发布前都要
从 Cloudflare 与 InfiniSynapse 的实际环境重新确认：

- Wrangler 当前身份和目标 Worker 正确；
- `ALLOWED_ORIGINS`、Partner SSO 回调和生产站 Origin 一致；
- Secret 已配置且日志中没有泄露；
- 一个全新 Partner 用户能登录、发起实时任务并在平台后台完成用户级归因；
- `completed.provenance` 与下载的 `analysis-manifest.json` 一致；
- 当前回放明确显示旧口径兼容提示，不冒充实时任务。

本次关键数据链改造默认只提交 Draft PR，不自动部署；具体上线和回滚门槛见
`docs/CRITICAL_DATA_CHAIN_RELEASE.md`。
