# BYOK + 回放模式历史归档（不再作为产品入口）

> 2026-07-29：BYOK、自带 Key、模型选择和开发者折叠入口已从产品中退役，
> 不得重新接回 UI。当前用户只看到两条路径：未登录真实回放、登录后 Partner
> 实时模式。本文件仅保留迁移背景和 Replay v2 兼容记录；Worker 的历史评委接口
> 不属于产品入口。

日期：2026-07-26 ｜ 配合其"纯静态 + BYOK + EdgeOne"部署方案，补齐它漏掉的四个点。

## 0. 动手前必读

- **先拉最新代码**：今晚云端会话已写回 16 个文件（工资条模式并入 `App.tsx`/`apiClient.ts`/`styles.css`；服务端新增缓存/降级/静态托管）。基于旧代码改会互相踩掉。
- **别删 Node 后端**：cpolar 备用链路和本地开发试跑都靠它；保留 `render.yaml` 无害。

## 1. 历史三态模式定义（已废弃）

| 模式 | 触发条件 | 数据来源 | 额度消耗 |
| --- | --- | --- | --- |
| `mock` | 无 Key 且无回放包 | 本地模拟状态机（现有） | 零 |
| `replay` | 无 Key，有回放包（**默认态**） | 真实任务存档 JSON | 零 |
| `live` | 用户已填 Key | 浏览器直连 app.infinisynapse.cn | 用户自己的 |

诚实边界：三态在 UI 上必须显式标注，回放绝不冒充实时。

## 2. BYOK 移植的四个关键约束（原方案遗漏）

1. **数据源按账号隔离**：live 模式的 prompt 必须继续内联本地计算结果与来源索引（现 `makePrompt` 逻辑），并加条件话术（见 §5）。任务流程**不得依赖**平台数据源存在，否则评委用自己的 Key 会跑挂。
2. **把服务端两件现成的东西一起搬**（在 `server/realRaiseServer.mjs` 里，直接抄）：
   - 同输入哈希缓存：`stableStringify` + `hashRequest` + `readCache`/`writeCache`（LRU 100）+ `pendingByHash` 进行中去重 → 改存 `localStorage`/内存。BYOK 下这保护的是**用户自己的额度**，必须有。
   - 降级映射：`vendorFailureInfo`（401/403→AUTH_ERROR 不可重试；402/429→额度/频率人话提示；5xx→平台繁忙）。
3. **SSE**：`EventSource` 不能带 Authorization → `fetch` + `ReadableStream`（服务端 `consumeSse` 解析循环可原样搬）。fetch 流没有自动重连：断流时给可读失败 + "重试"按钮即可，不做静默重连（避免重复扣额度）；手机切后台断流属预期，提示用户保持前台。
4. **Key 安全细节**：`<input type="password">`；只存 `localStorage`；提供"清除 Key"按钮；文案"仅保存在你的浏览器本地，绝不上传"；Key 绝不进 URL、日志、console、错误上报。

## 3. 回放模式实现

**数据格式**：`public/replays/{scenarioId}.json`。历史包已升级为
`replay.v2`；完整来源与迁移规则见 [REPLAY_PROVENANCE.md](./REPLAY_PROVENANCE.md)。

```json
{
  "schemaVersion": "replay.v2",
  "scenarioId": "take-home-raise-shrinks",
  "vendorTaskId": "<真实任务ID>",
  "recordedAt": "2026-07-2x",
  "request": {
    "input": {},
    "calculation": {},
    "calculationVersion": "living-cost.v2",
    "cityContext": {},
    "inputMode": "basic"
  },
  "recordedRequest": {
    "input": {},
    "calculation": {},
    "inputMode": "basic"
  },
  "provenance": {
    "vendorArtifacts": {
      "origin": "infinisynapse-task-workspace",
      "integrity": "vendor-original-unaltered",
      "sha256": {}
    },
    "compatibility": {
      "status": "legacy-calculation",
      "recordedContextStatus": "not-recorded",
      "currentContextUsage": "matching-only"
    }
  },
  "events": [ { "type": "started" }, { "type": "progress", "stage": "…", "message": "…", "percent": 10 } ],
  "completed": { "insight": "…", "sources": [], "workspace": { "artifacts": [], "previews": {} } }
}
```

- **录制**：演示账号真实跑一次，把收到的归一化事件流与 completed 载荷序列化落盘。做法任选：dev-only"导出回放"按钮（最简单，前端把事件数组 JSON.stringify 下载），或 node 脚本走后端跑。
- **播放**：`apiClient` 增加 replay 分支，按事件序列定时回放（间隔可压缩至 2 倍速），completed 后产物照常可预览/下载。
- **UI 标注**（必须）：旧任务显示
  `历史真实任务存档（旧口径） · 任务 ID {vendorTaskId} · 录制于 {recordedAt}`，
  同时明确原报告数值、当前页面数值以及历史任务没有城市上下文。
- 4 条回放：3 个预设案例 + 1 个工资条示例案例。录制时同步录屏（视频素材两用），并把 4 个任务 ID 汇总进提交材料。

## 4. 历史 Key 输入 UI（已删除）

旧版本曾在 InsightSection 增加折叠区；该入口现已删除，不得恢复：

- Key 输入框 + 保存/清除；无 Key 时显示指引文案：

> 这段是旧版本文案，仅用于说明迁移前状态；当前页面不显示 Key 输入、评委入口或 BYOK 指引。

当前替代文案：未登录查看真实任务回放；登录后使用 Partner 账号生成实时报告。
页面不提供 API Key 输入、评委模式、模型选择或 Mock 模式入口。

## 5. prompt 条件话术（加到 makePrompt 移植版）

> 若当前账号已启用官方统计数据源（income_benchmarks / spending_8_categories / cpi_historical），可查询核对基准数并在引用中注明数据源名称；否则以下方内联官方来源索引为准。不得联网检索，不得重算或修改本地计算结果。

## 6. 文档更新（随本次改动一并提交）

- `INFINISYNAPSE_INTEGRATION_BOUNDARY.md`：红线从"前端禁止直连"改为"**任何人的 Key 都不经过我们**——无自有服务器，Key 仅存用户浏览器；用户个人数据（工资条数字之外的原始文件）永不上传平台数据源"。
- `DEPLOYMENT.md`：主推 EdgeOne Pages 静态；Node 后端降级为"本地开发与 cpolar 备用链路"。
- ~~README.md~~ **README 由 Cowork 端专责维护，Code 端请勿改动此文件**（2026-07-26 晚已发生一次覆写事故：基于旧底稿整文件重写抹掉了他人更新。改任何文件前必须先拉磁盘最新版本，逐段修改而非整文件重写）。

## 7. 验收清单

- [ ] 无 Key 首次打开 → 默认回放态，完整看到进度流 + 解释 + 三产物下载，标注清晰
- [ ] 填 Key → 真实任务成功；同输入第二次秒回（缓存），平台后台只产生一条任务
- [ ] 拔网线/模拟 429 → 人话错误提示，可一键切回放
- [ ] Key 清除后回到回放态；localStorage 里除 Key 与缓存外无敏感数据
- [ ] 工资条模式在三态下均正常（payslipSummary 进 prompt/回放请求快照）
- [ ] `npm run verify && npm run test && npm run build` 全绿

---

## 附录 A：平台数据源上传步骤（用户人肉，10 分钟）

1. 登录 app.infinisynapse.cn → 【数据源】→ 新建 → 上传 `src/data/exports/income_benchmarks.csv`；同法上传 `spending_8_categories.csv`、`cpi_historical.csv`。数据源命名与文件名一致（prompt 话术按名引用）。
2. 【知识库】→ 新建 → 上传 `docs/DATA_DICTIONARY.md`（可加 `DATA_SOURCES_2025.md`、`DATA_SOURCES_HISTORICAL.md`）→ **绑定**到上述数据源。
3. 只传这些公开官方数据。用户工资条、.env、任务日志一律不传。
4. 传完在平台上确认新用户积分余额，记录单次任务消耗（第一次真实任务后看扣费记录）。
