# Real Raise 历史文档索引

> 状态：Active Index
> 最后核验：2026-07-30
> 规则：本目录只解释过去发生了什么，不作为当前实现依据。

当前产品、数据、架构和发布判断一律从 [文档中心](../README.md) 进入。归档文档中的日期、按钮、模式、公式、URL 和部署状态可能已经失效。

## 历史产品与 UX

| 文档 | 历史阶段 | 当前替代 |
| --- | --- | --- |
| [PROJECT_PLAN_2026-07-26.md](./PROJECT_PLAN_2026-07-26.md) | 早期总策划与 Agent 分工 | [产品规格](../product/PRODUCT_SPEC.md) |
| [NEXT_STAGE_PLAN_2026-07-26.md](./NEXT_STAGE_PLAN_2026-07-26.md) | 到手收入诊断阶段计划 | [用户流程](../product/USER_FLOW.md) |
| [ANALYSIS_DIMENSIONS_2026-07-26.md](./ANALYSIS_DIMENSIONS_2026-07-26.md) | 旧分析维度 | [计算规则](../product/CALCULATION_RULES.md) |
| [PAYSLIP_UX_SPEC_2026-07-26.md](./PAYSLIP_UX_SPEC_2026-07-26.md) | 工资条与 BYOK 同期实施稿 | [计算规则](../product/CALCULATION_RULES.md)、[界面设计](../product/INTERFACE_DESIGN.md) |
| [CITY_PICKER_UX_2026-07-26.md](./CITY_PICKER_UX_2026-07-26.md) | 城市选择器局部设计 | [界面设计](../product/INTERFACE_DESIGN.md) |
| [CITY_SELECTION_UX_2026-07-26.md](./CITY_SELECTION_UX_2026-07-26.md) | 城市选择交互提案 | [界面设计](../product/INTERFACE_DESIGN.md) |
| [HOME_LAYOUT_UX_2026-07-26.md](./HOME_LAYOUT_UX_2026-07-26.md) | 首页布局提案 | [界面设计](../product/INTERFACE_DESIGN.md) |

## 已废弃或已替代的技术路线

| 文档 | 说明 | 当前替代 |
| --- | --- | --- |
| [BYOK_REPLAY_SPEC.md](./BYOK_REPLAY_SPEC.md) | BYOK 已退出产品；仅保留历史 | [接入边界](../architecture/INFINISYNAPSE_INTEGRATION_BOUNDARY.md) |
| [INFINISYNAPSE_MODEL_SELECTION_2026-07-26.md](./INFINISYNAPSE_MODEL_SELECTION_2026-07-26.md) | 供应商接口调研快照 | [模型选择 ADR](../decisions/0005-partner-model-selection.md) |
| [DEPLOYMENT_JUDGE_PHASE_2026-07-27.md](./DEPLOYMENT_JUDGE_PHASE_2026-07-27.md) | 以 Judge 为主的旧部署方案 | [部署运行手册](../operations/DEPLOYMENT.md) |
| [DEMO_RELEASE_CHECKLIST_JUDGE_PHASE.md](./DEMO_RELEASE_CHECKLIST_JUDGE_PHASE.md) | Judge 阶段比赛清单 | [现行发布清单](../operations/RELEASE_CHECKLIST.md) |
| [REAL_API_TRIAL.md](./REAL_API_TRIAL.md) | 早期 API 实验记录 | [任务契约](../architecture/INFINISYNAPSE_TASK_CONTRACT.md) |
| [INFINISYNAPSE_UPLOAD_MANIFEST.md](./INFINISYNAPSE_UPLOAD_MANIFEST.md) | 首次上传实验清单 | [任务契约](../architecture/INFINISYNAPSE_TASK_CONTRACT.md) |

## Session 与 Agent 交接

- [ANTIGRAVITY_HANDOFF.md](./ANTIGRAVITY_HANDOFF.md)
- [CLOUD_SESSION_HANDOFF_2026-07-26.md](./CLOUD_SESSION_HANDOFF_2026-07-26.md)
- [HAJIMI_FRONTEND_HANDOFF.md](./HAJIMI_FRONTEND_HANDOFF.md)
- [HAJIMI_TEST_REVIEW.md](./HAJIMI_TEST_REVIEW.md)
- [NEXT_MORNING_HANDOFF_2026-07-26.md](./NEXT_MORNING_HANDOFF_2026-07-26.md)

这些文件可用于追溯返工原因，但其中的待办不能直接转成当前任务。开始新开发应先查 [已知问题](../product/KNOWN_ISSUES.md) 和最新 [Checkpoint](../checkpoints/2026-07-30-baseline.md)。

## 兼容路径

以下 `docs/` 根目录文件只保留旧链接，不含现行需求：

- `CITY_BENCHMARK_CONTRACT.md`
- `CITY_PICKER_UX.md`
- `NEXT_STAGE_PLAN.md`
- `PAYSLIP_UX_SPEC.md`

如果兼容文件与 Active 文档冲突，以 Active 文档为准。
