# InfiniSynapse 服务端接入边界与契约映射规范

## 1. 系统隔离原则 (Isolation Principles)

1. **绝对禁令**：浏览器前端（React UI）**禁止**直接连接或调用 InfiniSynapse 供应商的任何 API。
2. **单一归口**：浏览器端仅且只能同本项目自行部署的服务端（`RealRaiseBackend`）通信。通信路由统一由 `src/api/realRaiseContract.ts` 中的 `REAL_RAISE_BACKEND_ROUTES` 约束。
3. **安全隔离**：任何供应商 API Key、Token 或授权凭证仅允许保存在服务端环境变量中，绝不可打入前端打包产物（`dist/`）。

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
