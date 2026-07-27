# InfiniSynapse 接入边界与契约映射规范

## 1. 系统隔离原则 (Isolation Principles)

> 已提交的静态版本仍保留 BYOK（用户自带 Key）链路；当配置
> `VITE_ANALYSIS_API_URL` 时，生产 live 链路改由 Cloudflare Worker 调用
> InfiniSynapse，供应商 Key 只保存在 Worker Secret 中。

1. **密钥按运行形态隔离**：静态 BYOK 版本中，访客的 Key 只保存在其本人浏览器；Worker live 版本中，比赛 Key 只存在 Cloudflare Secret。两种形态都不得把 Key 写入 URL、日志、console、错误上报、仓库或构建产物。
2. **直连仅限 BYOK 适配层**：浏览器端对供应商的调用统一收敛在 `src/api/infiniSynapseBrowserClient.ts`；UI 组件只使用 `apiClient` 暴露的三态接口（live / replay / mock），不得散落直连代码。
3. **用户个人数据不上传**：除任务 Prompt 中内联的本地计算摘要外，用户工资条数字之外的任何原始文件、`.env`、任务日志一律不上传平台数据源。
4. **服务端形态**：`worker/index.mjs` 是比赛准入修正的主服务端适配层；`server/realRaiseServer.mjs` 只保留为本地开发与自托管备用链路。两者都必须从服务端环境读取 Key。

---

## 2. 现有契约映射 (Existing Contract Mapping)

| 动作 | 浏览器请求路由 | 方法 | 提交 payload / 路由参数 | 响应格式 / SSE 事件 |
| :--- | :--- | :--- | :--- | :--- |
| **创建分析任务** | `/api/real-raise/analysis` | `POST` | `StartAnalysisRequest` (`input`, `calculation`, `locale`, `includeInsight`) | `StartAnalysisResponse` (`taskId`, `status`, `calculation`) |
| **取消分析任务** | `/api/real-raise/analysis/:taskId/cancel` | `POST` | 无 | `{ success: boolean }` |
| **订阅任务进度** | `/api/real-raise/analysis/:taskId/events` | `GET` | EventSource SSE 流 | `AgentTaskEvent` (`started`, `progress`, `insight`, `completed`, `failed`) |

---

## 3. 未知接口防护规则 (Unknown Interface Protection)

### 当前阶段实现入口

- 城市数据回退契约：`src/data/cityBenchmarks.ts` / `docs/CITY_BENCHMARK_CONTRACT.md`
- 供应商端点、SSE 归一化、Prompt 和 workspace 产物契约：`src/api/infiniSynapseContract.ts` / `docs/INFINISYNAPSE_TASK_CONTRACT.md`
- Worker Server API 适配器已实现，但在 Cloudflare 登录、设置 Secret、配置静态站来源并完成一次真实任务之前，不得宣称线上链路已经验证。

1. **零暗猜接口**：严禁在前端推测、虚构或写死未经 `realRaiseContract.ts` 明确定义的后端接口。
2. **Graceful Fallback**：若服务端尚未完成真实 API 对接，前端在 `remoteFeatureEnabled = false` 或 `useMock = true` 模式下回退至确定性计算 + 本地基准 Mock 状态机，绝不引发网页崩溃。
