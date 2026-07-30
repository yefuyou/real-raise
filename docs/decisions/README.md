# 决策记录（ADR）

> 状态：现行索引
> 最后核验：2026-07-30

| ADR | 决定 | 状态 | 实现状态 |
| --- | --- | --- | --- |
| [0001](./0001-deterministic-core-agent-layer.md) | 确定性计算内核 + Agent 分析层 | 已接受 | 已实现，仍需持续审计 |
| [0002](./0002-partner-sso-only-live-path.md) | 实时任务只走 Partner SSO；退役 BYOK 与 Judge | 已接受 | BYOK 已退役；Judge 后端待删除 |
| [0003](./0003-versioned-replay-provenance.md) | 回放必须版本化并保留供应商原件 | 已接受 | v2 包装已实现；当前 Prompt 重录待办 |
| [0004](./0004-stable-production-url-and-origin-bound-sso.md) | 生产 URL 不变；SSO 回到发起 Origin | 已接受 | 生产 URL 已稳定；本地回跳需回归 |
| [0005](./0005-partner-model-selection.md) | 模型选择只属于登录用户实时任务 | 已接受 | 已恢复 |
| [0006](./0006-documentation-as-project-memory.md) | 文档作为项目记忆系统 | 已接受 | 本轮建立 |

## 状态含义

- **已接受**：目标产品必须遵守。
- **已取代**：保留历史原因，但不再执行。
- **提议中**：尚未成为约束。
- **实现状态**不能替代决策状态：代码偏离已接受 ADR 时，应登记为 implementation gap。
