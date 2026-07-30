# Real Raise 文档中心

> 状态：现行入口
> 最后核验：2026-07-30
> 维护规则：任何产品、状态、数据或发布判断，先从本页进入；不要仅凭 `docs/` 根目录中的旧文件名判断其是否仍然有效。

## 先读这些入口

| 你要回答的问题 | 唯一入口 |
| --- | --- |
| 当前仓库、测试、生产与公开证据到底是什么 | [仓库事实审计](./engineering/repository-truth-audit.md) |
| 一次请求怎样从输入走到 Agent、Replay、CSV 与页面 | [真实请求生命周期](./engineering/request-lifecycle.md) |
| 产品现在要解决什么、明确不做什么 | [产品规格](./product/PRODUCT_SPEC.md) |
| 产品为何从购买力走向生活余量 | [产品旅程](./product/product-journey.md) |
| 关键产品决策、备选方案与重新考虑条件 | [产品决策日志](./design/decision-log.md) |
| 项目做对、做错了什么，能力证据是什么 | [2026 年 7 月总复盘](./retrospective/2026-07-real-raise-retrospective.md) |
| 登录、回放、实时任务、重新分析如何流转 | [产品状态机](./product/STATE_MACHINES.md) |
| 用户怎样走完整条路径 | [用户流程](./product/USER_FLOW.md) |
| 金额和比例到底怎么算 | [计算规则](./product/CALCULATION_RULES.md) |
| 为什么做出某个重大决定 | [决策记录（ADR）](./decisions/README.md) |
| 2026-07-30 01:15 的中间状态是什么 | [时间点 Checkpoint](./checkpoints/2026-07-30-baseline.md) |
| 数据文件、城市覆盖和来源分别在哪里 | [数据资产目录](./data/README.md) |
| 历史上改过什么 | [Changelog](../CHANGELOG.md) |

在开始开发前，再读：

- [文档治理规则](./DOCUMENTATION_GOVERNANCE.md)
- [2026 年 7 月返工复盘](./retrospectives/REWORK_REVIEW_2026-07.md)
- [旧文档分类与迁移索引](./archive/README.md)
- [现行部署运行手册](./operations/DEPLOYMENT.md)

## 文档类型与职责

| 类型 | 回答什么 | 不回答什么 |
| --- | --- | --- |
| 事实审计 | 某个 commit 下代码、测试、生产与证据是什么 | 永久产品目标 |
| 产品规格 | 目标用户、需求、产品边界、验收 | 当前代码是否已经做到 |
| 状态机 | 状态、事件、转移、可见动作、不变量 | 具体组件怎么写 |
| ADR | 为什么选择或放弃一条路线 | 每次小改动 |
| 技术契约 | 请求、版本、字段、产物、数据边界 | 产品目标是否合理 |
| Changelog | 某个时间点实际改了什么 | 下一步计划 |
| Checkpoint | 某一时刻 Git、运行环境和证据快照 | 永久决策 |
| Runbook | 如何验证、发布、回滚 | 产品需求 |
| Archive | 历史方案与过程证据 | 当前执行依据 |
| Portfolio 复盘 | 问题、决策、证据、结果与教训 | 新功能需求 |

## “当前事实”和“目标状态”如何区分

本项目曾多次把计划、代码和生产环境混称为“当前版本”。从现在开始：

- **目标状态**以产品规格、状态机和已接受 ADR 为准。
- **仓库状态**以最新事实审计为准；Checkpoint 只证明它标注时间的快照。
- **生产状态**只能由运行时健康检查、实际页面和部署记录证明。
- **历史原因**去 Changelog、ADR 和 Retrospective 查。
- 文档与代码冲突时，不静默选一边：在 Checkpoint 中登记漂移，再决定修代码还是修文档。

## 当前产品一句话

Real Raise 是一个关于“涨薪后的生活余量”的个人收入诊断应用，采用“确定性计算 + Agent 解释”的分层：

1. Real Raise 负责工资、扣缴、生活支出、结余和情景金额。
2. InfiniSynapse 负责排序、比较、敏感性判断和报告表达。
3. 未登录用户可看明确标注的真实任务回放。
4. 登录用户通过 Partner SSO 使用个人归因和个人额度生成实时报告。
5. BYOK 和 Judge 都不是目标产品路径；Judge 后端代码仍在，但 2026-07-30 本轮生产健康检查显示未配置。
6. 当前 Worker 没有结果缓存或刷新恢复，不能用备用 Node 服务的能力替代生产事实。

## 目录

```text
docs/
├─ README.md                     # 本入口
├─ DOCUMENTATION_GOVERNANCE.md  # 文档维护规则
├─ product/                     # 产品规格、流程、规则、界面、验证、问题
├─ design/                      # 产品级决策日志
├─ engineering/                 # 仓库事实与真实请求生命周期
├─ data/                        # 数据字典、来源、城市研究和覆盖
├─ architecture/                # 平台任务、SSO、Replay 与权威边界
├─ operations/                  # 发布、部署、验收与回滚
├─ submission/                  # 比赛报名与传播材料
├─ decisions/                   # ADR
├─ checkpoints/                 # 可复现的中间状态
├─ retrospectives/              # 错误与返工复盘
├─ retrospective/               # Portfolio 项目总复盘
└─ archive/                     # 旧文档分类索引
```

根目录 `CHANGELOG.md` 记录版本变化。`docs/` 根目录只保留入口、治理规则和少量兼容路标；兼容文件不得继续承载需求。历史材料的现行性必须以 [归档索引](./archive/README.md) 为准。

## 当前真相源

| 领域 | 当前权威文档 |
| --- | --- |
| 仓库、测试、GitHub 与生产事实 | [engineering/repository-truth-audit.md](./engineering/repository-truth-audit.md) |
| 请求生命周期与运行边界 | [engineering/request-lifecycle.md](./engineering/request-lifecycle.md) |
| 产品演进时间线 | [product/product-journey.md](./product/product-journey.md) |
| 产品级决策 | [design/decision-log.md](./design/decision-log.md) |
| Portfolio 总复盘 | [retrospective/2026-07-real-raise-retrospective.md](./retrospective/2026-07-real-raise-retrospective.md) |
| 产品定位与范围 | [product/PRODUCT_SPEC.md](./product/PRODUCT_SPEC.md) |
| 用户流程 | [product/USER_FLOW.md](./product/USER_FLOW.md) |
| 计算口径 | [product/CALCULATION_RULES.md](./product/CALCULATION_RULES.md) |
| 页面和交互 | [product/INTERFACE_DESIGN.md](./product/INTERFACE_DESIGN.md) |
| 产品状态机 | [product/STATE_MACHINES.md](./product/STATE_MACHINES.md) |
| 验证证据 | [product/VALIDATION.md](./product/VALIDATION.md) |
| 已知问题 | [product/KNOWN_ISSUES.md](./product/KNOWN_ISSUES.md) |
| 数据字段与来源 | [data/README.md](./data/README.md) |
| 平台接入边界 | [architecture/INFINISYNAPSE_INTEGRATION_BOUNDARY.md](./architecture/INFINISYNAPSE_INTEGRATION_BOUNDARY.md) |
| 发布和回滚 | [operations/DEPLOYMENT.md](./operations/DEPLOYMENT.md) |
| 发布验收 | [operations/RELEASE_CHECKLIST.md](./operations/RELEASE_CHECKLIST.md) |
