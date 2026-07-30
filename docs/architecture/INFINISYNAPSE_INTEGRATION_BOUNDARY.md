# InfiniSynapse 接入边界与契约映射规范

> 状态：Active
> 最后核验：2026-07-30
> 当前产品不包含 BYOK 或 Judge；实时任务只走 Partner SSO。实现残留见
> [ADR-0002](../decisions/0002-partner-sso-only-live-path.md) 和最新 Checkpoint。

## 1. 系统隔离原则 (Isolation Principles)

> 当前产品不提供 BYOK（用户自带 Key）入口。生产链路由 Cloudflare Worker
> 调用 InfiniSynapse，供应商 Key 只保存在 Worker Secret 中；未登录用户只播放
> 真实任务回放。

1. **密钥只在服务端**：项目 Key 只存在 Cloudflare Secret，不得写入 URL、日志、console、错误上报、仓库或构建产物。
2. **浏览器不直连供应商**：UI 只使用 `apiClient` 暴露的 Partner 实时和回放路径，不得散落供应商直连代码。
3. **用户个人数据不上传**：除任务 Prompt 中内联的本地计算摘要外，用户工资条数字之外的任何原始文件、`.env`、任务日志一律不上传平台数据源。
4. **服务端形态**：`worker/index.mjs` 是比赛准入修正的主服务端适配层；`server/realRaiseServer.mjs` 只保留为本地开发与自托管备用链路。两者都必须从服务端环境读取 Key。

---

## 2. 现有契约映射 (Existing Contract Mapping)

| 动作 | 浏览器请求路由 | 方法 | 提交 payload / 路由参数 | 响应格式 / SSE 事件 |
| :--- | :--- | :--- | :--- | :--- |
| **创建并订阅分析任务（生产 Worker）** | `/api/analysis` | `POST` | `StartAnalysisRequest`（含 `input`、仅供校验的 `calculation`、`calculationVersion`、`cityContext`、输入模式） | 单请求 SSE；响应头返回任务 ID，事件为 `started`、`progress`、`insight`、`completed`、`failed` |
| **取消生产 Worker 任务** | 浏览器中止当前 `/api/analysis` 请求 | `AbortSignal` | 当前任务 ID | Worker 终止上游连接并释放并发 lease |
| **本地/自托管备用 API** | `/api/real-raise/analysis` 及其子路由 | `POST` / `GET` | 旧 Node 适配器契约 | 仅用于本地开发和自托管，不是当前比赛生产路由 |

`completed` 必须携带 `provenance`，明确正文来源、结构化卡片来源、
确定性计算权威、公式版本、调用模式和用户归因。平台正文不能再被当作
结构化金额的权威来源。

---

## 3. 未知接口防护规则 (Unknown Interface Protection)

### 当前阶段实现入口

- 城市数据回退契约：`src/data/cityBenchmarks.ts` / `docs/data/CITY_BENCHMARK_CONTRACT.md`
- 供应商端点、SSE 归一化、Prompt 和 workspace 产物契约：`src/api/infiniSynapseContract.ts` / `docs/architecture/INFINISYNAPSE_TASK_CONTRACT.md`
- Worker Server API 适配器是生产主链；每次发布仍必须重新核验 Secret、
  Origin、Partner 会话和一笔真实用户任务，历史部署成功不能代替本次验证。

1. **零暗猜接口**：严禁在前端推测、虚构或写死未经 `realRaiseContract.ts` 明确定义的后端接口。
2. **Graceful Fallback**：若服务端暂不可用，前端只回退至带任务 ID 的真实回放；当前输入没有匹配存档时明确提示用户登录或选择预设案例，不进入 Mock 或 BYOK 用户模式。
3. **城市基准不信任客户端**：浏览器提交城市选择和可见上下文，Worker
   必须与服务端可信目录逐字段核对；伪造的 CPI、来源 URL、覆盖层级或
   caveat 必须在创建平台任务前被拒绝。
