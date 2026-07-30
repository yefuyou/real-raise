# InfiniSynapse 诊断任务契约

> 状态：Active
> 契约版本：`diagnosis.v2`
> 最后核验：2026-07-30
> 真相源范围：实时 Agent 任务的输入包、执行边界、产物状态和审计字段

## 1. 责任边界

```text
浏览器输入
→ Real Raise Worker 校验并重新计算
→ diagnosis.v2 上下文包
→ InfiniSynapse Agent 解释、比较、排序
→ 平台正文与供应商产物
→ Worker 封装确定性凭证和 provenance
→ 浏览器按产物状态展示
```

- Real Raise 负责工资、扣缴、支出、结余、驱动金额和情景金额。
- InfiniSynapse 负责驱动排序、基准比较、敏感性判断和报告表达。
- 浏览器不得持有 Partner API Key，也不得直连供应商。
- 产品实时路径只有 Partner SSO；未登录和已登录用户均可使用精确回放。
- BYOK 与 Judge 不属于本契约。

## 2. `diagnosis.v2` 上下文包

任务只允许由 Worker 构造。浏览器提交的计算值仅供发现篡改，不能成为权威输入。

```text
task_goal
input_snapshot
deterministic_calculation
diagnostic_packet
driver_ranking
scenario_matrix
payslip_context
city_context
methodology_and_boundaries
source_index
provenance
```

| 模块 | 责任 |
| --- | --- |
| `task_goal` | 固定回答：真正留下多少、被什么抵消、最敏感变量是什么 |
| `input_snapshot` | 脱敏后的用户输入和输入模式 |
| `deterministic_calculation` | 当前/下一阶段金额、结余、比例与计算版本 |
| `diagnostic_packet` | 可对账的核心结论候选 |
| `driver_ranking` | Real Raise 预计算的驱动金额，不接受模型自造数字 |
| `scenario_matrix` | Real Raise 预计算的基准、保守和压力情景 |
| `payslip_context` | 工资条实际值、估算标识和未来账户边界 |
| `city_context` | 城市、期间、覆盖层级、回退和 caveat |
| `methodology_and_boundaries` | 指标定义、禁止重算、非金融建议边界 |
| `source_index` | `source_id`、年份、范围、URL 和可信层级 |
| `provenance` | Prompt、上下文、计算、输入签名和执行归因 |

在供应商 Workspace 上传接口未完成真实契约验证前，不把 JSON 内联上下文宣传成“已上传文件”。

## 3. 固定任务目标

Agent 必须回答：

1. 这次涨薪每月、每年真正留下多少；
2. 哪三个因素对结余影响最大；
3. 扣缴、住房和日常支出分别抵消多少；
4. 用户与适用城市/全国基准相比有哪些可解释差异；
5. 哪个变量最敏感，结论在哪个场景下会逆转；
6. 保持原生活余量至少需要多少收入；
7. 哪些结论证据不足。

## 4. Prompt 硬边界

- 不重算、修改或补齐 Real Raise 金额。
- 用户实际输入高于宏观平均。
- 城市历史值不能标成当前值；缺项必须写明全国回退。
- 所有宏观结论携带 `source_id`、年份与统计范围。
- 养老和公积金不得笼统描述为“消失”。
- 不编造城市数据，不以省级数据冒充城市。
- 不输出投资、借贷、辞职或消费指令。
- 证据不足时必须明确写“证据不足”。

Prompt 只能在一个共享模块维护。任何旧 Prompt 只能作为 replay 历史原件，不允许双轨继续演进。

## 5. 生命周期

1. Worker 接收请求，拒绝未知字段并核验版本。
2. Worker 用可信目录核验 `city_context`，用领域逻辑重新计算。
3. Worker 生成 `inputSignature` 和完整 `diagnosis.v2` 包。
4. Worker 显式创建 Agent/Act 任务，不得落入 Plan-only。
5. Worker 转译供应商 SSE 为产品事件。
6. 任务完成后读取平台正文和可用供应商产物。
7. Worker 生成 Real Raise 权威凭证并封装产物状态。
8. `completed` 只有在状态与来源完整时才能发送。

## 6. 产物与权威

| 文件 | 生成方 | 权威范围 |
| --- | --- | --- |
| `explanation.md` | InfiniSynapse | 叙述正文 |
| `evidence.csv` | Real Raise | 当前来源与数值证据 |
| `driver-ranking.csv` | Real Raise | 驱动金额与排序输入 |
| `scenario-matrix.csv` | Real Raise | 确定性情景 |
| `analysis-manifest.json` | Real Raise | 版本、签名、归因和状态 |
| `vendor-original-*` | InfiniSynapse | 供应商原件，仅审计 |

`analysis-manifest.json` 至少记录：

```text
promptVersion
contextVersion
calculationVersion
taskGoal
sourceIds
inputSignature
executionMode
attribution
artifactStatus
vendorTaskId
generatedAt
```

## 7. 产物状态

| 状态 | 定义 | 页面文案边界 |
| --- | --- | --- |
| `verified` | 平台正文和要求的任务证据已读取，确定性凭证完整 | 可称平台报告已完成 |
| `stream-fallback` | 只有事件流正文，平台文件未完整读取 | 必须说明不是完整平台产物 |
| `deterministic-only` | 只有 Real Raise 凭证 | 不得显示为 AI 报告 |
| `failed-retryable` | 平台任务结束但必要证据不可得 | 显示失败并允许重试 |

读取产物失败不能被吞掉后继续伪装 `verified`。

## 8. 报告透明度

普通用户可展开“本次分析上下文”摘要：

- Prompt 和上下文版本；
- 用户目标；
- 使用的数据模块；
- 计算版本；
- 城市、期间和覆盖层级；
- `source_id`；
- 回放或 Partner 实时模式；
- 平台正文与确定性数字的边界。

评审/开发调试可以查看脱敏 Prompt 原文，但不得展示 Key、Secret、Cookie、凭证或无关内部信息。

## 9. 验收

- Prompt 快照包含全部必需模块且不含密钥。
- Worker 重算与浏览器计算一致，篡改请求被拒绝。
- 请求显式使用 Agent/Act。
- 全新 Partner 用户任务完成并归因正确。
- 模型选择不会影响回放可用性。
- 平台产物缺失时状态准确降级。
- manifest 可从任务 ID 追到输入签名、公式、Prompt 和来源。
