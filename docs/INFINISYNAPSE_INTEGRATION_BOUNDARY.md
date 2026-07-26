# InfiniSynapse 接入边界与契约映射规范

## 1. 系统隔离原则 (Isolation Principles)

> 2026-07 起项目采用 BYOK（用户自带 Key）+ 纯静态部署，红线随之更新。
> 旧红线"前端禁止直连供应商"的理由是保护服务端持有的密钥；BYOK 下不存在服务端密钥，该禁令不再适用。

1. **任何人的 Key 都不经过我们**：本项目没有自有服务器。访客的 API Key 只保存在其本人浏览器的 `localStorage`（`src/api/apiKeyStore.ts`），由浏览器直连 `app.infinisynapse.cn`；Key 绝不进入 URL、日志、console、错误上报或构建产物（`dist/`）。
2. **直连仅限 BYOK 适配层**：浏览器端对供应商的调用统一收敛在 `src/api/infiniSynapseBrowserClient.ts`；UI 组件只使用 `apiClient` 暴露的三态接口（live / replay / mock），不得散落直连代码。
3. **用户个人数据不上传**：除任务 Prompt 中内联的本地计算摘要外，用户工资条数字之外的任何原始文件、`.env`、任务日志一律不上传平台数据源。
4. **可选服务端形态**：`server/realRaiseServer.mjs` 保留为"自托管 + 服务端统一持 Key"的可选部署（本地开发与 cpolar 备用链路）。该形态下沿用旧规则：Key 仅存服务端环境变量。

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
- 当前仍未把供应商密钥或真实调用写入浏览器端；真实 Server API 适配器必须在独立服务端完成。

1. **零暗猜接口**：严禁在前端推测、虚构或写死未经 `realRaiseContract.ts` 明确定义的后端接口。
2. **Graceful Fallback**：若服务端尚未完成真实 API 对接，前端在 `remoteFeatureEnabled = false` 或 `useMock = true` 模式下回退至确定性计算 + 本地基准 Mock 状态机，绝不引发网页崩溃。
