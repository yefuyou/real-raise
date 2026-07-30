# Real Raise Changelog

> 状态：现行
> 记录规则：只记录已经发生的仓库变化、合并和可证明的运行状态；计划留在产品规格或 ADR。

## Unreleased

### Documentation

- 建立文档中心、产品规格、状态机、ADR、Checkpoint、数据资产目录、部署手册和返工复盘。
- 将原来平铺的文档按 `product`、`data`、`architecture`、`operations`、`submission` 和 `archive` 物理重构。
- 将原有平铺文档登记为现行参考、历史快照、交接材料或营销材料。

### Known gaps

- Judge 后端仍存在，尚未按 ADR-0002 删除。
- 预设案例和工资条预设待重做。
- 四个 Replay 待使用当前 Prompt 与上下文重新录制。
- 非破坏式重新分析状态待实现。

## 2026-07-30

### Agent 执行与产品入口恢复

- `df7671f`：显式使用 Agent `act` 模式，补充自动审批与完成恢复，客户端安全超时扩至 10 分钟。
- `234d2ce`：恢复 Partner 模型选择以及登录前后可见的显式回放入口。
- PR [#7](https://github.com/yefuyou/real-raise/pull/7) 在北京时间 2026-07-30 01:01 被合并到 `main`，merge commit `6f66f25`。
- 合并发生时 PR 原本用于 checkpoint 保存；是否部署不能由“已合并”推导。

## 2026-07-29

### 数据链、认证与诊断

- `e575fea`：服务端重算、城市可信目录、诊断包、Replay v2 与产物来源分层。
- `7da9321`：退役浏览器 BYOK 产品入口。
- `eee6cf3`：SSO flow 与浏览器绑定、Judge token 安全门禁、`diagnosis.v2` 诊断上下文和产物状态。
- `e0b77b6`：把模型选择文档标为历史；随后发现产品模型选择也被误删，于 7 月 30 日恢复。
- PR #5 合入 Partner SSO；PR #6 的 base 为 `codex/partner-sso`，曾造成“GitHub 显示 merged，但主分支未得到预期数据链”的拓扑误判，后由 PR #7 汇总进入 `main`。

## 2026-07-28

### Partner SSO

- `a43d0d3`：加入 InfiniSynapse Partner SSO。
- `001ac50`：本地认证请求改走配置的 API。
- `fa14c15`、`7b138f1`：尝试隔离 Partner 与 Judge 模式。
- `8cbb014`：对齐部署分析和认证流程。
- `e7fe8ea`：保存阶段性 checkpoint。

## 2026-07-27

### 工资条、回放与服务端

- PR #3 / `bdeafcb`：加入工资条估算、BYOK 和四个真实任务回放。
- `a5cf54a`：加入 Cloudflare Server API 适配层。
- `73cf542`、`227397c`：修复测试配置和 Node 类型依赖。

## 2026-07-26

### MVP 与首次发布

- `931963e`：Real Raise MVP。
- `a5e589c`：发布当时已有实现。
- 完成第一批确定性计算、城市/官方数据、演示材料和部署准备。
