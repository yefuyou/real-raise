# Real Raise 仓库事实审计

> 审计基线：`origin/main` @ `d25bb6b49e0827c5b72f13b3bfd400b228847778`
> 审计分支：`codex/portfolio-evidence-audit`
> 观察日期：2026-07-30（Asia/Shanghai）
> 范围：代码、测试、脚本、配置、Git/GitHub、公开部署、公开 B 站视频与现有文档

## 1. 结论先行

Real Raise 不是“只有页面的概念 Demo”。它有可运行的 React 产品、确定性工资/生活结余计算、Cloudflare Worker、Partner SSO、真实 Agent 适配、四个历史任务 Replay、证据产物和 CI。

它也还不是一个已经完成工程接管的长期产品。当前最重要的事实是：

1. **Observed**：核心金额在前端计算，Worker 会忽略客户端传入的 `calculation` 并复算；模型收到冻结后的诊断上下文，不能直接覆盖页面核心金额。
2. **Observed**：前端与 Worker 各自保存了一份 `calculateLivingCost` 实现。三组固定输入目前完全一致，但“一个业务口径、两份实现”仍是漂移风险，不能称为单一计算源。
3. **Observed**：Mock 只在显式测试/注入路径启用，当前产品 UI 不会把 Mock 冒充实时 Agent；但实时启动失败且服务端允许 fallback 时，客户端会自动尝试精确 Replay。
4. **Observed**：Cloudflare Worker 的生产实时链路没有结果缓存、任务查询或刷新恢复；这些能力只存在于备用 Node 服务的内存实现，README 曾把两条链路混写。
5. **Observed**：Partner SSO 的 state、HttpOnly Cookie、一次性本地 handoff、服务端保存用户 API Key 等边界有代码和 Worker 自动化测试；本轮没有发起新的真实 Agent 任务，因此生产归因与供应商任务结果仍是 **Unverified**。
6. **Observed**：`npm test` 在 Windows 工作树连续两次以 1 退出，但仍打印 `ALL 44 AUTOMATED TESTS PASSED`；失败来自 CRLF 敏感的源码字符串断言。GitHub Linux/Node 22 对同一 commit 通过。这既是跨平台测试缺陷，也是“最终绿字不能替代退出码”的直接证据。
7. **Observed**：生产站在本轮审计中被其他流程连续部署，bundle 从 `index-h6kgnEya.js` 变为 `index-BoM-81Hq.js`，且二者都不等于本审计分支基于 `origin/main` 的 `index-DXL9MzXF.js`。没有 commit SHA 的部署标签，生产与 Git 主线的对应关系无法确认。
8. **Observed**：仓库有 8 个 PR、GitHub Actions 和最近成功 CI；没有 Issue、tag、GitHub Release、GitHub Deployment 或 Environment 记录。

本文使用以下证据标签：

| 标签 | 含义 |
| --- | --- |
| **Observed** | 已从代码、Git、测试退出码、运行日志、公开 API 或部署检查确认 |
| **Inferred** | 代码结构支持该判断，但本轮没有执行对应的真实外部流程 |
| **Unverified** | 缺少可复核的原始证据，或外部状态无法与 commit 对齐 |
| **Historical** | Git/归档证明过去存在，不代表当前产品仍采用 |

## 2. 仓库与 GitHub 基线

### 2.1 仓库构成

**Observed**

- 147 个 tracked files。
- 主要文件类型：65 个 Markdown、28 个 TypeScript、12 个 TSX、11 个 MJS、10 个 JSON。
- 技术主线是 React 18 + TypeScript + Vite 6 + Cloudflare Worker/Wrangler 4。
- 默认分支：`main`。
- 首个 commit：`931963e`（2026-07-26，`Initial Real Raise MVP`）。
- 审计时 `origin/main`：`d25bb6b`（2026-07-30，合并 PR #8）。
- 无 tag。

本机长期存在多个 worktree/分支。原工作树 `D:\webproject\Real-Raise` 在审计开始时有用户未提交内容，因此本轮使用独立工作树 `D:\webproject\Real-Raise-portfolio-audit`，没有覆盖原改动。

### 2.2 PR、Issue、Release 与 CI

**Observed**

| 项目 | 审计结果 |
| --- | --- |
| Pull Requests | 8 个；#1、#2、#3、#5、#6、#7、#8 已合并，#4 关闭未合并 |
| Issues | 0 个公开 Issue |
| Tags | 0 |
| GitHub Releases | 0 |
| GitHub Deployments | 0 |
| GitHub Environments | 0 |
| GitHub Actions | 已存在 `.github/workflows/ci.yml`，使用 Node 22 与 `npm ci` |

审计前最近一次 main CI 是 [run 30549183266](https://github.com/yefuyou/real-raise/actions/runs/30549183266)，对 `d25bb6b` 依次执行 `npm ci`、test、verify、worker:test、server:test、build、worker:check，结论为 success。本审计分支把 `audit:outputs` 加入同一 CI。历史上 PR #4 的 Cloudflare adapter 流程出现过两次 CI failure，之后才通过。

**Historical**

- PR #2 的描述曾写测试超时、没有新鲜结果。
- PR #3 声称 33/33。
- PR #5 声称 39/39。
- PR #6、#7、#8 又分别声称 43、45、46 项。当前 `runTests.ts` 实际只有 45 个 `runTest` 调用。这些 PR 文案只能作为当时的开发记录，不能作为当前覆盖率事实。
- PR #6 以 `codex/partner-sso` 而非 main 为 base，之后通过 #7 才把相关链路带回主线。这是多 worktree/多 Agent 协作造成的分支事实漂移实例。

## 3. 技术栈与运行入口

| 层 | 当前实现 | 主要文件 |
| --- | --- | --- |
| UI | React 18、TSX、CSS、Lucide icons | `src/App.tsx`、`src/components/*` |
| 构建 | TypeScript、Vite 6 | `tsconfig*.json`、`vite.config.ts` |
| 确定性计算 | 工资条与生活结余计算 | `src/domain/salarySlip.ts`、`src/domain/livingCost.ts` |
| 数据 | 全国/城市 CPI、收入与支出静态数据 | `src/data/*` |
| 浏览器任务适配 | live / replay / mock 路由 | `src/api/apiClient.ts` |
| 生产服务 | Cloudflare Worker + Assets + Durable Objects + Rate Limiter | `worker/index.mjs`、`wrangler.jsonc` |
| Agent 适配 | InfiniSynapse SSE、ACT mode、workspace 读取 | `worker/infiniSynapse.mjs` |
| 生产权威计算/产物 | Worker 复算、诊断包、CSV/Manifest | `worker/core.mjs` |
| 备用服务 | Node HTTP/SSE/in-memory cache | `server/realRaiseServer.mjs`、`render.yaml` |
| Replay | 四个供应商历史任务包装为 `replay.v2` | `public/replays/*`、`scripts/replayAudit.mjs` |
| CI | GitHub Actions / Node 22 | `.github/workflows/ci.yml` |

### 3.1 命令

```bash
npm ci
npm run dev
npm test
npm run verify
npm run audit:outputs
npm run worker:test
npm run server:test
npm run build
npm run worker:check
```

其他入口：

```bash
npm run server       # 备用 Node 服务，不是已确认的当前生产路径
npm run worker:dev   # 本地 Cloudflare Worker
npm run replays:check
```

### 3.2 运行时版本

**Observed**

- lockfile 的 209 个 `resolved` 主机均为 `registry.npmjs.org`；未发现 `registry.npmmirror.com`。旧镜像固定问题当前已不存在。
- 本机默认 Node `v18.18.0`、npm `9.8.1`。`npm ci` 成功，但 Wrangler、Miniflare 等依赖明确要求 Node 22+。
- GitHub CI 使用 Node 22。
- 通过临时 Node `v22.23.1` 执行 `worker:check` 成功。

因此仓库的可支持开发基线应写成 Node 22+；Node 18 只能算“不受支持但部分脚本仍可运行”。

## 4. 本轮实际验证结果

执行时间均为 2026-07-30，工作树基于 `d25bb6b`。

| 命令 | 环境 | 退出码 | 结果 |
| --- | --- | ---: | --- |
| `npm ci` | Node 18 | 0 | 安装 103 packages；出现 Node engine 警告 |
| `npm test` | Node 18 / Windows | 1 | 44 pass、1 fail；连续复现两次 |
| `npm run verify` | Node 18 | 0 | TS 校验与 4 个 replay.v2 审计通过 |
| `npm run worker:test` | Node 18 | 0 | 17 组 Worker/SSO/Judge/Agent/产物检查通过 |
| `npm run server:test` | Node 18 | 0 | 6 组备用 Node 服务集成检查通过 |
| `npm run build` | Node 18 | 0 | Vite 构建成功，1606 modules |
| `npm run worker:check` | Node 18 | 1 | Wrangler 拒绝 Node 18 |
| `npm run worker:check` | Node 22.23.1 | 0 | Worker dry-run 成功，bindings 可解析 |
| `npm run audit:outputs` | Node 18 | 0 | 3 个固定输入跨确定性出口一致 |

### 4.1 `npm test` 的真实故障

失败用例：

```text
12.5 运行状态矩阵：本地隐藏 SSO，产品不暴露 Judge/BYOK 入口
```

断言没有渲染组件，而是用 `String.includes()` 检查 `InsightSection.tsx` 中一段包含 `\n` 的源码。Windows checkout 使用 CRLF，因此源码行为正确，静态字符串断言仍失败；Linux CI 使用 LF，故同一 commit 通过。

更严重的是测试运行器：

```ts
console.log(`ALL ${passedCount} AUTOMATED TESTS PASSED`)
```

无论是否发生失败都会执行。失败会设置 `process.exitCode = 1`，所以 CI 没有被假绿绕过；但终端最后的文案确实会误导人工阅读。本轮日志中先输出 `ALL 44 ... PASSED`，随后才在 stderr 出现第 45 项 FAIL。

另一个覆盖率错觉是用例 4.2。它只对一个测试内临时对象执行 localStorage set/get；现行产品代码反而主动删除旧的 `real_raise_active_task`，因此它不能证明真实任务刷新恢复。

### 4.2 三个固定输入出口回归

脚本：`scripts/auditOutputConsistency.mjs`

验证出口：

- `src/domain/livingCost.ts` 前端公式；
- `worker/core.mjs` Worker 公式；
- Worker `validateAnalysisRequest()` 复算；
- `replay.v2` 的当前请求；
- 浏览器生成的 `evidence.csv` 与 `analysis-manifest.json`；
- Worker 生成的 `evidence.csv` 与 `analysis-manifest.json`。

| 场景 | 收入 | 月结余变化 | 年结余变化 | 结余变化 / 当前收入 | 保本月入 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `comfortable-raise` | 11,000 → 13,000 | 1,841.1554 | 22,093.8647 | 16.7378% | 11,158.8446 |
| `raise-and-fixed-costs` | 9,500 → 12,500 | 1,345.3586 | 16,144.3029 | 14.1617% | 11,154.6414 |
| `take-home-raise-shrinks` | 8,000 → 8,400 | -49.0372 | -588.4461 | -0.6130% | 8,449.0372 |

**Observed**：上述出口完全一致。
**Unverified**：本轮没有为这三个输入重新执行真实 InfiniSynapse Agent。Replay 中的供应商正文和原始三产物仍来自 2026-07-26 的旧公式/未记录 Prompt，不能当作当前模型输出一致性证明。

## 5. 真实请求生命周期

完整文件级说明见 [request-lifecycle.md](./request-lifecycle.md)。摘要如下：

```text
App 输入与校验
  → src/domain/* 本地确定性计算
  → StartAnalysisRequest
  → apiClient 选择 live / replay / mock
  → serverAnalysisClient POST /api/analysis
  → worker/index.mjs 鉴权、限流、额度租约
  → worker/core.mjs 严格校验并重新计算
  → worker/infiniSynapse.mjs 创建 ACT Agent 任务
  → 读取 workspace、保留供应商原件、封存权威数值产物
  → SSE completed / failed
  → InsightSection 展示来源、provenance 与下载入口
```

### 5.1 数字在哪里冻结

**Observed**

1. 页面先用 `src/domain/livingCost.ts` 计算即时结果。
2. live 请求携带 input、客户端 calculation、`living-cost.v2`、城市上下文与可选工资条摘要。
3. Worker 的 `validateAnalysisRequest()` 丢弃客户端 calculation，使用 `worker/core.mjs` 的重复公式复算。
4. Agent prompt 明确要求只解释 `deterministic_calculation` 与 `diagnostic_packet`，不得重算。
5. `sealAuthoritativeArtifacts()` 会把供应商可能生成的同名数字文件改名为 `vendor-original-*`，再用 Worker 数字覆盖正式 evidence/manifest/scenario 文件。
6. UI 的核心卡片继续使用本地 calculation；模型正文没有写回核心结果对象的接口。

**Inferred risk**

- 两份公式目前一致，但不是共享模块。
- Worker 只验证 `payslipSummary` 字段范围，没有原始工资条字段可供重算。攻击者可伪造进入 prompt 的扣缴解释，但不能改变 Worker 根据净收入与支出复算的核心结余。
- Worker 与浏览器的默认模型签名规则不同：Worker 总会把 `platform-default` 放入签名，浏览器默认选择时省略该字段。live provenance 与前端 Replay 匹配签名可能不一致。

### 5.2 产物事实

当前存在三种“产物数量”：

1. **Historical**：供应商原始任务要求 `explanation.md`、`evidence.csv`、`analysis-manifest.json` 三份核心文件。
2. **Observed**：Worker 封存后实际可返回 explanation、evidence、manifest、driver ranking、scenario CSV、scenario JSON、share summary，共七类文件。
3. **Observed**：Worker manifest 的 `artifactContract` 只列六项，漏掉 `scenario-matrix.json`；浏览器 manifest 列七项。

因此 README 过去的“三份产物”只适用于供应商核心原件，不是当前 UI 的完整下载契约。

## 6. Live、Replay、Mock、Judge 与备用 Node 服务

| 模式 | 当前入口 | 数字权威 | 是否调用供应商 | 用户可辨识性 | 缓存/恢复 |
| --- | --- | --- | --- | --- | --- |
| Partner live | UI 登录后显式按钮 | Worker 复算 | 是 | provenance 显示 `partner-live` | Worker 无结果缓存；刷新即失去前端任务 |
| Replay | UI 显式按钮；live preflight 失败也可能精确 fallback | 当前本地 calculation + 历史供应商正文 | 否 | 显示历史任务 ID、录制日期、旧口径警告 | 内存 Map；刷新后需重新匹配 |
| Mock | 仅 `useMock` 显式注入与测试 | 本地 calculation | 否 | 当前产品 UI 无入口 | 内存 |
| Judge | UI 不挂载；Worker 后端代码仍在 | Worker 复算 | 是 | 仅后端兼容路径 | 签名短时 token |
| Node server | `npm run server` / `render.yaml` | **信任客户端 calculation** | 是 | 不属于已确认生产路径 | 内存任务 + 同输入缓存；重启全失 |

### 6.1 fallback

`apiClient.startAnalysis()` 在 server-live 启动阶段收到带 `fallbackAllowed` 的 `ServerAnalysisUnavailable` 后，会尝试按请求签名精确命中 Replay：

- 命中：直接返回 Replay task，最终 provenance 会明确显示 Replay。
- 未命中：把原错误抛给 UI。
- 不会自动切换到 Mock。

这解决了“Mock 偷偷冒充成功”的高风险担忧，但仍有产品透明度问题：用户点击的是 live，若精确 Replay 存在，中间没有单独确认步骤。

### 6.2 缓存

**Observed**

- `worker/index.mjs` 没有结果 cache；`buildCompletedProvenance()` 的 `cached` 参数在生产 Worker 主链没有被设为 true。
- `server/realRaiseServer.mjs` 有最多 100 条的内存结果缓存与 pending 去重。
- Replay fetch 使用浏览器 `cache: no-cache`。

所以“生产 live 有同输入缓存”没有证据。

### 6.3 任务恢复、继续与取消

**Observed**

- `serverAnalysisClient.ts`、`replayClient.ts` 的任务和产物都保存在页面内存 Map。
- `InsightSection` 启动时删除旧的 `real_raise_active_task`。
- 刷新会丢失 live/replay 的当前任务、SSE Response 与下载对象。
- Worker 没有 `GET task`、resume 或 continue 路由。
- 备用 Node server 有 GET、cancel、continue 路由，但生产 Worker 与 UI 没有完成这条闭环。
- 页面 unmount 会 abort 当前 live stream；供应商 cancel 是 best effort。
- 重新分析会先清空旧报告，再开始新任务。失败时不能回到旧报告。

结论：当前“刷新恢复”“同 Task 追问复用上下文”均未实现。

## 7. SSO、Partner API Key 与隔离边界

### 7.1 已确认实现

**Observed from code and Worker tests**

- `/api/auth/infini/start` 创建随机 flow id 与 state，把 flow 存入 Durable Object。
- 浏览器获得 `__Host-rr_oauth_flow`，属性包含 HttpOnly、Secure、SameSite。
- callback 同时要求 flow cookie 与 state；consume 后删除，不能重放。
- Partner token exchange 在 Worker 内进行，并请求用户 API Key。
- 用户资料与 API Key 存在 `AuthSessionStore` Durable Object；`/api/auth/me` 不返回 Key。
- 生产同源浏览器只持有不透明 session cookie。
- localhost 跨源开发走两分钟一次性 handoff code，换取不透明 session id，存于 `sessionStorage`；仍不是 Partner API Key。
- analysis 与 logout 检查 Origin；允许的 return origin 必须在配置中，且只接受公开 origin 或 loopback。
- Partner 用量按用户 id 进入 `UsageGuard`，默认日限额 20、并发 1。

### 7.2 当前生产快照

2026-07-30 23:51（Asia/Shanghai）读取：

```json
{
  "ok": true,
  "service": "real-raise-api",
  "liveEnabled": true,
  "judgeAccessConfigured": false,
  "partnerSsoConfigured": true
}
```

当前页面存在已认证 Partner UI，说明至少有既存会话可被 `/api/auth/me` 识别；为避免消耗额度，本轮没有点击生成实时报告，也没有重新跑 OAuth callback。

因此：

- SSO 配置与已登录会话识别：**Observed**。
- 新登录流程、callback 与 logout 的生产端到端：**Unverified**（自动化 Worker 测试通过）。
- 新建 Agent task 是否归因到当前 Partner user key：**Unverified**。
- Partner API Key 未进入仓库/前端 bundle：代码与自动化层面 **Observed**；生产 Secret 值本轮未读取，也不应读取。

### 7.3 剩余风险

- `UsageGuard` 租约 TTL 为 4 分钟，Agent 总超时可达 10 分钟；长任务可能在结束前释放并发占位。
- Worker 日志包含 request id、vendor task id、模式、归因、版本与城市，但不记录一个可安全关联的用户/session hash。定位单用户跨请求问题能力有限。
- SSO 对核心“算清生活余量”不是必要条件。根据本轮 Portfolio 决策，它应冻结为已实现但非继续扩展的比赛驱动能力。

## 8. 生产部署事实

生产入口：[plain-wind-ae46.yefuyou2333.workers.dev](https://plain-wind-ae46.yefuyou2333.workers.dev/)

**Observed**

- 根页面与 `/health` 返回 200。
- 同一 Cloudflare Worker 同时提供静态 Assets 与 API。
- Wrangler 能列出部署历史，但 GitHub 没有 Deployment/Environment 记录。
- 2026-07-30 当天新增四次无 tag、无 message 的部署：
  - `f70f2316-ed37-4607-96f0-9d9b7628fb71`
  - `528aa474-69a5-40ed-b92d-63cb9c5ebff9`
  - `e58bfa9d-b11c-4da6-b83c-918fb26e36c2`
  - `34fc5380-54bc-4c79-8b83-1f09f92ad42a`
  - 2026-07-30 23:51 页面引用 `index-h6kgnEya.js`；2026-07-31 00:10 再查已引用 `index-BoM-81Hq.js`。
- 本审计从 `d25bb6b` 构建得到 `index-DXL9MzXF.js`，与线上不相同。

**Unverified**

- 当前线上版本对应哪个 commit/worktree。
- 哪个流程触发了本轮审计期间的四次部署。
- 最新无 message 部署是否通过了与 CI 相同的 test/build gate。

`render.yaml` 是备用 Node 托管方案，使用 `npm install`，不是已经证明的当前生产配置。

## 9. 公开传播证据

**Observed**

- B 站视频：[BV13r3c6WE28](https://www.bilibili.com/video/BV13r3c6WE28)
- 标题：`real raise 计算真实涨薪对购买力提升的计算器`
- 发布时间：2026-07-27 23:24（Asia/Shanghai）
- 2026-07-30 23:51 快照：16 播放，0 弹幕、0 评论、0 收藏、0 投币、0 分享、0 点赞。

这证明项目确实公开发布过视频，不足以证明产品获得了有效用户验证。

**Unverified**

- 微博、抖音的实际帖子 URL 与指标。
- 比赛作品长廊条目、票数与排名。
- 第一批反馈原文、提交者、日期和后续决定。

仓库只有传播脚本和文案，不能反推实际发布。

## 10. README 不准确或证据不足的声明

本轮已在根 README 修正最直接的事实错误。审计前状态如下：

| 旧声明/素材 | 审计结论 |
| --- | --- |
| “默认本地开发使用 Mock” | 错。没有 server URL 时默认是 Replay-only；Mock 需显式 `useMock` |
| “在线可使用存档回放、Mock 演示” | 错。当前 UI 无 Mock 入口 |
| “AI 真实链路：三份产物、缓存” | 混写。三份是供应商历史核心产物；Worker 封存更多文件；生产 Worker 无结果缓存 |
| “Worker 保留短时会话仅兼容历史” | 表述不精确。Judge 后端仍在代码，但当前 health 显示未配置；Partner session 是现行 live 所需 |
| “当前生产仍存在 Judge 配置” | 旧 Checkpoint 曾观察为 true；本轮 health 为 false，应带时间戳 |
| `product-overview.png` 是“真实界面” | 图片确实来自 UI，但已过期，仍显示 BYOK/Judge/Mock 文案 |
| `worker/core.mjs` 负责签名会话与限流 | 错位。这些主要在 `worker/index.mjs`；core 负责校验、复算、prompt/产物 |
| 页面、Worker、Replay、CSV 共用一个结果 | 结果目前一致，但存在前端/Worker两份公式、浏览器/Worker两套产物构造器，不应描述为物理单源 |

## 11. 当前风险清单

### P0：影响“可信交付”

1. **测试结尾可误报 ALL PASSED**：必须按 failure count 输出，且源码断言需行尾无关或改为行为/AST 测试。
2. **生产部署身份不可追溯**：部署必须携带 commit SHA、CI run 与说明，并形成 Release。
3. **刷新任务不可恢复**：文档与产品不能继续声称恢复已完成；若长期保留 live，需建立持久任务查询。
4. **重复权威实现**：前端与 Worker 两份生活结余公式需要共享纯模块或建立强制跨实现 contract test。

### P1：影响可维护性和用户理解

1. live preflight 失败可自动切 Replay，虽有最终 provenance，但缺少明确的降级确认。
2. 新任务开始前清空旧报告，失败时丢失可用结果。
3. Worker/browser artifact contract 6/7 项不一致。
4. 默认模型字段进入签名的规则不一致。
5. Worker 不复算工资条摘要。
6. Node server 与 Worker 两套后端能力差异很大，`render.yaml` 容易让维护者误选。
7. Judge 组件与后端代码仍在，虽不挂 UI，增加理解与攻击面。

### P2：冻结而非继续开发

登录/注册扩展、排行榜、历史记录、更多城市、PWA、开放 API、泛化 AI 建议。除非有可归档的真实用户反馈和明确 ROI，不应在可信收尾前恢复。

## 12. 接管判定

当前可以诚实声称：

> Real Raise 已经完成从生活问题到公开 Demo 的产品闭环，并建立了“确定性计算、Agent 解释”的可审计雏形；本轮已证明主要数值出口一致，也明确定位了测试误导、任务不可恢复、生产身份缺失与重复实现等接管缺口。

当前不能声称：

- 生产就是最新 main；
- live Agent 有缓存或刷新恢复；
- 三个固定输入已用当前 Prompt 重新跑过真实 Agent；
- SSO 与用户 Key 归因已在本轮生产端到端复验；
- 微博/抖音发布和用户反馈已被仓库证据确认；
- 所有自动化测试在本机全绿。
