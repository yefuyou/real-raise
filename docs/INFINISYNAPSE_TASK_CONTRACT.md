# InfiniSynapse 真实任务契约

更新时间：2026-07-29
实现：`src/api/realRaiseContract.ts`、`worker/core.mjs`、
`worker/infiniSynapse.mjs`

## 责任边界

```text
浏览器
  → Real-Raise 自有后端
    → InfiniSynapse Server API
      → SSE 进度 + Task Workspace 产物
```

生产 Worker 的 Partner/Judge 模式下，浏览器永远不持有 InfiniSynapse
API Key，也不直接调用供应商域名。静态站仍保留显式 BYOK 备用模式，
用户 Key 只存在其当前浏览器。工资、扣缴、分类支出、结余和情景计算由
Real Raise 的确定性逻辑负责；InfiniSynapse 负责解释、排序、比较已给定
情景并产出报告正文。

## 一次真实任务的生命周期

1. 后端接收 `StartAnalysisRequest`，拒绝未知字段，校验
   `calculationVersion`，并用可信目录核验 `cityContext`。
2. 后端忽略浏览器提交的 `calculation`，用 `input` 重新计算金额和诊断包，
   再生成自己的 `agentTaskId`。
3. 后端先建立供应商 SSE，再发送 `newTask`。
4. 后端把供应商 SSE 转为 `AgentTaskEvent`。部分消息只能是进度，不能直接成为最终结论。
5. 任务结束后，后端读取 Task Workspace。
6. `explanation.md` 保留平台正文；平台生成的 evidence/manifest 另存为
   `vendor-original-*`，默认 `evidence.csv` 和 `analysis-manifest.json` 必须
   由 Real Raise 按服务端重算结果重新封装。
7. `completed.provenance` 明示正文来源、数字权威、公式版本、任务 ID 和归因模式后才能发给浏览器。

## 产物契约

真实任务优先整理为三个小产物：

| 文件 | 用途 | 最低要求 |
| --- | --- | --- |
| `analysis-manifest.json` | 当前权威任务与口径清单 | 任务 ID、城市、期间、来源、计算版本、执行/归因模式 |
| `evidence.csv` | 证据行 | 来源名称、年份、范围、类别、数值、是否回退 |
| `explanation.md` | 面向用户的解释 | 解释收入/扣缴/日常支出贡献，不能覆盖本地数字 |
| `vendor-original-*` | 平台历史/实时原件 | 只作完整性和任务核验，不冒充当前确定性证据 |

二进制文件走下载接口，不把文件内容塞进 JSON。浏览器只接收 Real-Raise 自有后端转译后的来源和产物元数据。

## Prompt 硬边界

- 不重算或修改本地计算结果。
- 用户实际输入高于宏观基准。
- 城市历史值不能标成当前值；城市缺项必须写“已回退全国基准”。
- 每个引用带年份与统计范围。
- 不编造缺失城市数据，不以安徽省代替合肥。
- 不输出投资、借贷、辞职等个性化金融建议。

## 当前实现状态

Cloudflare Worker、Partner SSO、Judge 会话、BYOK、Replay 和 Mock 均有
独立执行模式。生产发布仍以 `docs/CRITICAL_DATA_CHAIN_RELEASE.md` 的
门禁为准；任何模式都必须在 UI 明示来源，不能把回放或本地模板冒充实时
平台任务。
