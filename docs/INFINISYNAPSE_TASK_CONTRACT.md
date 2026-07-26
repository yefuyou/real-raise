# InfiniSynapse 真实任务契约

更新时间：2026-07-26
实现草案：`src/api/infiniSynapseContract.ts`

## 责任边界

```text
浏览器
  → Real-Raise 自有后端
    → InfiniSynapse Server API
      → SSE 进度 + Task Workspace 产物
```

浏览器永远不持有 InfiniSynapse API Key，也不直接调用供应商域名。工资、扣缴、分类支出、结余和情景计算由本地确定性逻辑负责；InfiniSynapse 只负责读取已启用的官方数据源、解释结果、标注来源并产出报告。

## 一次真实任务的生命周期

1. 后端接收 `StartAnalysisRequest`，生成自己的 `agentTaskId` 和输入哈希。
2. 后端查询并启用需要的数据源；没有启用数据源时任务不得进入真实分析。
3. 后端先建立 `GET /api/ai/events?connId=...` SSE，再发送 `POST /api/ai/message` 的 `newTask`。
4. 后端把供应商 SSE 转为 `AgentTaskEvent`。`message.partial` 和 `message.add` 只能是进度，不能直接成为最终结论。
5. 任务结束后，后端读取 `getTaskWorkspace`，再按需 preview/download 产物。
6. 只有 workspace 读取成功、来源和产物完成校验后，后端才发送自有 `completed` 事件。
7. 相同输入哈希直接返回缓存结果，取消、刷新和重连不重复扣额度。

## 产物契约

真实任务优先整理为三个小产物：

| 文件 | 用途 | 最低要求 |
| --- | --- | --- |
| `analysis-manifest.json` | 任务与口径清单 | 任务 ID、城市、期间、输入哈希、来源、计算版本 |
| `evidence.csv` | 证据行 | 来源名称、年份、范围、类别、数值、是否回退 |
| `explanation.md` | 面向用户的解释 | 解释收入/扣缴/日常支出贡献，不能覆盖本地数字 |

二进制文件走下载接口，不把文件内容塞进 JSON。浏览器只接收 Real-Raise 自有后端转译后的来源和产物元数据。

## Prompt 硬边界

- 不重算或修改本地计算结果。
- 用户实际输入高于宏观基准。
- 城市历史值不能标成当前值；城市缺项必须写“已回退全国基准”。
- 每个引用带年份与统计范围。
- 不编造缺失城市数据，不以安徽省代替合肥。
- 不输出投资、借贷、辞职等个性化金融建议。

## 当前实现状态

当前仓库还没有供应商密钥或可部署服务端，因此这份契约先提供：

- 官方端点和请求边界；
- SSE 事件归一化函数；
- Prompt 构造函数；
- workspace 产物命名和验收规则。

真正的 Server API 适配器应在自有服务端落地，不应为了让前端“看起来接上了”而把供应商调用写入 React 或 Vite 客户端。
