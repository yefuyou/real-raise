# 哈吉米 / Antigravity 前端接手包：InfiniSynapse 接入边界

更新时间：2026-07-25

## 先说结论

哈吉米就是 Antigravity，使用 Gemini 模型。它负责的是“本项目的前端体验”和按既定方案执行的重复性工作，不是直接写 InfiniSynapse 调用。

官方推荐架构是：

```text
哈吉米前端
    ↓
Real Raise 自己的后端 API
    ↓
服务端 AgentTaskService / InfiniSynapseAdapter
    ↓
InfiniSynapse Server API
```

API Key、`connId`、InfiniSynapse 原始 `taskId`、SSE 长连接都留在服务端。浏览器只拿本项目自己的 `taskId` 和经过整理的进度/结果。

官方依据：

- [Server API Reference](https://infinisynapse.cn/en/docs/InfiniSynapse%20Server%20API%20Reference)
- [Vibe Coding Guide](https://infinisynapse.cn/en/docs/InfiniSynapse%20Vibe%20Coding%20Guide)
- [Existing Product Integration Playbook](https://infinisynapse.cn/en/docs/InfiniSynapse%20Existing%20Product%20Integration%20Playbook)

## 哈吉米现在要做什么

### 已完成的数据底座（Codex 已验收）

- `src/data/officialHistorical.ts`：2021–2025 年国家统计局历史数据契约。
- `src/data/dataContract.ts`：已核验来源登记。
- `docs/DATA_SOURCES_HISTORICAL.md`：来源、三分法与缺失项规则。
- 2024 年城镇八类支出暂不展示；未核验的官方明细不允许自行补齐。
- 前端只能把这些数据作为来源标签、背景对比或解读上下文；核心金额、涨幅和购买力仍以本地 `calculateLivingCost` 为准。

### P0：前端先接“自己的后端契约”

契约类型已经放在 [`src/api/realRaiseContract.ts`](../src/api/realRaiseContract.ts)。哈吉米只需要围绕这些状态做页面：

1. 保留当前本地演示模式，默认不调用远程任务。
2. 增加“生成生活解读”按钮，但受 `remote insight` feature flag 控制。
3. 调用 `POST /api/real-raise/analysis`，提交：
   - 用户输入的工资、房租和支出
   - 本地已经算好的 `LivingCostResult`
   - `locale: zh-CN`
   - `includeInsight: true`
4. 立即展示 `queued / running` 状态和阶段进度。
5. 通过本项目自己的 SSE 路由接收 `progress / insight / artifact / completed / failed` 事件。
6. 支持取消、失败重试和刷新后恢复。
7. 数字卡片始终来自本地 `calculateLivingCost`，AI 文字只能进入“生活解读”区域。

### P1：需要补齐的状态

- 空闲：等待用户点击
- 排队中：已创建本项目任务
- 分析中：显示“正在结合公开数据生成解读”
- 完成：显示 AI 解读和来源
- 失败：显示人话错误，提供重试
- 取消：保留已计算的本地数字，不丢输入
- 额度保护：远程任务关闭时只展示本地计算，不发请求

### P2：结果和来源

如果后端返回 `artifact`，前端可以展示报告预览或下载入口；不要自己拼 InfiniSynapse 文件 URL。文件预览/下载应由后端代理，避免把供应商任务 ID 当成前端权限令牌。

## 后端必须实现的供应商调用顺序

这部分不是哈吉米的写入范围，但前端必须按这个行为来设计等待态：

1. 服务端生成并持久化自己的 `agentTaskId`、供应商 `connId` 和供应商 `taskId`。
2. 先连接 `GET https://app.infinisynapse.cn/api/ai/events?connId=...`，带 `Authorization: Bearer <API Key>`。
3. SSE 建立后，再调用 `POST https://app.infinisynapse.cn/api/ai/message`：

```json
{
  "type": "newTask",
  "taskId": "server-generated-uuid",
  "connId": "server-generated-uuid",
  "chatSettings": { "mode": "act" },
  "text": "这里由服务端组装提示词"
}
```

4. 服务端消费 `message.add`、`message.partial`、`notification` 和 `state.ready`。
5. 出现 `message.ask=completion_result` 或 `message.say=completion_result` 后，读取：
   - `GET /api/ai_task/getTaskWorkspace/:id`
   - `POST /api/ai_task/previewFile`
   - `GET /api/tools/storage/downloadTaskFile/:taskId?path=...`
6. 如果 Agent 请求 `upload_file_to_sandbox`，后端才调用上传接口，再用 `askResponse` 继续。
7. 失败、取消、恢复都要在本项目自己的任务表中留状态。

## 数据源启用顺序

真实数据源接入前，后端需要先：

1. `GET /api/ai_database/list`
2. 找到目标数据源
3. `POST /api/ai_database/enabled`，启用对应 ID
4. 之后才创建 `newTask`

公开市场订阅属于账户/市场服务；订阅完成后仍要回到 Server API 的 `list + enabled`。数据源没有启用时，Agent 看不到它。

## 我们给 Agent 的产品提示词边界

服务端后续组装 prompt 时必须把这些规则写死：

- 所有金额、涨幅和购买力数字以本项目传入的本地计算结果为准。
- 不重新计算、不修改、不四舍五入覆盖本地数字。
- 用户房租优先使用用户输入；官方“居住”类价格只作为背景参照。
- 每个外部统计结论返回来源名称、年份、统计范围。
- 只输出生活成本解释和可执行的预算情景，不给投资、借贷、辞职建议。
- 数据不足时明确说“不足以判断”，不能补造数字。

## 哈吉米禁止事项

- 不在 `src/` 中写 `Authorization: Bearer`。
- 不在浏览器中请求 `https://app.infinisynapse.cn/api/*`。
- 不把 `VITE_*` 当作 API Key 存储位置；Vite 环境变量会进入客户端构建。
- 不直接让用户输入供应商 `taskId`。
- 不在输入变化、滑块拖动或页面刷新时自动创建任务。
- 不把 `message.partial` 当成最终结论；只有收到完成信号后才显示“完成”。
- 不把二进制下载响应按 JSON 解析。
- 不为验证反复点击，远程调用必须有 feature flag、缓存和明确按钮。

## 前端验收标准

- 默认启动仍然是本地演示，不需要 API Key。
- 远程 feature flag 关闭时，网络面板没有 InfiniSynapse 请求。
- 远程任务中可以看到排队、进度、完成、失败、取消五种状态。
- 刷新页面后能用本项目 `taskId` 恢复任务状态。
- 本地数字与 AI 解读分区展示，AI 不能覆盖数字卡片。
- 移动端不出现横向滚动。
- `npm run verify` 和 `npm run build` 通过。
