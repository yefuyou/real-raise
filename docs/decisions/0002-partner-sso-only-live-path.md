# ADR-0002：实时任务只走 Partner SSO

> 状态：已接受
> 决策日期：2026-07-29
> 实现状态：部分完成

## 背景

产品先后出现浏览器 BYOK、项目方 Judge Key 和 Partner 用户 Key。多条路径造成密钥边界、归因、额度、文案和状态机持续漂移。

## 决定

- 产品不提供 BYOK。
- 产品不提供 Judge 前端或 Judge 后端实时路径。
- 未登录用户只使用本地算表和明确标注的真实任务回放。
- 实时分析只允许 Partner SSO 登录用户使用个人归因与额度。
- 模型选择属于 Partner 实时任务，不与 BYOK/Judge 绑定。

## 当前差距

前端已不挂载 Judge，但 Worker 仍保留 `/api/judge/session`、Judge token、项目 Key 分支、配额、Secret 和 Rate Limiter。该差距必须以单独代码改动完整删除，不能继续用“前端隐藏”代替。

## 后果

- 产品路径减少，归因更清晰。
- 评审仍可通过回放核验历史真实 Task ID。
- 移除 Judge 时必须同时改 Worker、契约、配置、测试和部署 Secret，不能只删组件。
