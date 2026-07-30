# Real Raise 部署与回滚手册

> 状态：现行运行手册
> 最后核验：2026-07-30
> 生产 URL：`https://plain-wind-ae46.yefuyou2333.workers.dev/`

## 1. 当前部署形态

同一个 Cloudflare Worker 托管：

- Vite 静态资源；
- `/health`；
- Partner SSO；
- `/api/analysis`。

生产 URL 是比赛与宣传入口，发布不得改变 URL。

当前运行时仍报告 `judgeAccessConfigured: true`。这属于已登记的实现漂移，不是允许继续使用 Judge 的产品决定。删除 Judge 前不得先删除其 Secret 或配置，否则可能让当前 Worker 进入半迁移状态。

## 2. 发布授权

以下动作必须分别获得明确确认：

- commit；
- push；
- merge；
- 写入或删除 Secret；
- deploy；
- 切换 `LIVE_ANALYSIS_ENABLED`；
- 回滚。

“改好”“开起来看看”“保存 checkpoint”不能自动解释为全部发布授权。

## 3. 发布前检查

Wrangler 4 需要 Node 22+。确认运行时后执行：

```bash
npm ci
npm test
npm run verify
npm run worker:test
npm run server:test
npm run build
npm run worker:check
git diff --check
```

还必须确认：

- 工作树中没有来历不明的未提交改动；
- 目标 commit 与要发布的源代码完全一致；
- `ALLOWED_ORIGINS` 包含生产 Origin；本地 Origin 只用于开发；
- Partner SSO 回调、return Origin 和 Cookie 配置一致；
- 前端与 Worker 同批发布；
- Replay audit 通过；
- 文档 Checkpoint 已写明目标 commit。

## 4. Secret 边界

现行 Partner SSO 需要：

```text
INFINI_PARTNER_CLIENT_ID
INFINI_PARTNER_CLIENT_SECRET
```

仓库、日志、命令参数和文档不得记录值。

当前部署的 Judge/项目 Key Secret 是历史实现残留。只有 Judge 后端删除 PR 合并并完成 canary 后，才可在单独获批的部署操作中删除：

```text
INFINISYNAPSE_API_KEY
JUDGE_ACCESS_CODE
JUDGE_TOKEN_SECRET
```

## 5. Canary

同一提交至少验证：

1. `/health` 正常。
2. 未登录本地算表正常。
3. 未登录 Replay 精确命中和无命中状态正常。
4. 全新 Partner 用户登录并回到正确 Origin。
5. 平台默认、Flash、Pro 至少验证允许的代表路径。
6. 实时任务明确进入 Agent act 模式。
7. 平台后台归因到正确用户。
8. 输入变化后报告状态符合状态机。
9. 360px、768px、桌面可完成主流程。
10. 日志不含工资、Prompt、Cookie、Authorization 或 Secret。

## 6. 发布后记录

Checkpoint 必须补充：

- production commit；
- Cloudflare deployment/version ID；
- 发布时间；
- 健康检查；
- Partner Task ID 与归因证据；
- Replay 验证结果；
- 回滚点。

没有 deployment ID 时，只能写“生产可访问”，不能写“某 commit 已部署”。

## 7. 回滚

触发条件：

- SSO 无法回到正确 Origin；
- Partner 任务归因错误；
- 实时任务进入 plan 而不执行；
- 模型选择或 Replay 消失；
- 正文与确定性数字冲突；
- 大量 400/401/429 或任务超时；
- 前端与 Worker 版本不一致。

回滚要求：

1. 选择一个已验证的前端 + Worker 同版本。
2. 不只回滚静态资源或只回滚 Worker。
3. 必要时关闭 Live，保留本地算表和明确标注的 Replay。
4. 不改写或删除供应商 Replay 原件。
5. 回滚后立即创建新 Checkpoint 和 Changelog 条目。
