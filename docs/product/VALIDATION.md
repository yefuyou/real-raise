# Real Raise 验证记录

> 状态：Active
> 最后核验：2026-07-30
> 原则：只记录有证据的结论；“CI 绿”不能替代生产、归因和用户流程验证。

| 待验证问题 | 方法 | 当前证据 | 结论 |
| --- | --- | --- | --- |
| 确定性金额是否自洽 | 领域单测与 Worker 对账 | 计算测试覆盖收入、支出和工资条 | 已有基础证据 |
| 页面是否保留 SSO、模型和回放 | UI 回归 + 代码测试 | 最新 checkpoint 记录三项已恢复 | 需每次发布回归 |
| SSO 是否回到发起登录的 origin | 本地与生产各跑一次授权 | 曾发生本地登录跳生产的回归 | 待双环境复验 |
| Partner 任务是否归因正确 | 全新账号创建任务并查后台 | 仅配置健康不等于归因完成 | 发布前必验 |
| Agent 是否执行而非只规划 | 检查请求 mode 与平台任务 | 已修复显式 Agent 模式 | 需真实任务复验 |
| 回放是否对应当前案例和口径 | manifest 精确匹配 + 语义审计 | replay.v2 已建立 | 新预设加入时重验 |
| 修改输入后报告是否过期 | 完成报告后逐项修改输入 | 当前存在缺少新报告入口的反馈 | 未通过 |
| 平台产物缺失是否诚实降级 | 模拟 artifact 读取失败 | 契约定义了 fallback 状态 | 需 UI 集成验证 |
| 预设案例是否有代表性 | 案例命题评审 + 结果对账 | 用户反馈现有案例设计弱 | 未通过 |

> “用户反馈”两项目前没有原文、渠道、日期或截图，只能视为待补的反馈线索；对应产品行为可以从代码复验，但不能把线索包装成已完成用户研究。详见 [产品旅程](./product-journey.md)。

## VAL-20260730-01 Portfolio 事实审计

- 环境 / commit：Windows，`origin/main` @ `d25bb6b`；默认 Node 18.18.0，Worker dry-run 另用 Node 22.23.1
- 用户类型：本地匿名；生产仅做只读页面与 health 检查
- 输入案例：`comfortable-raise`、`raise-and-fixed-costs`、`take-home-raise-shrinks`
- 操作步骤：
  1. `npm ci`
  2. `npm test`
  3. `npm run verify`
  4. `npm run audit:outputs`
  5. `npm run worker:test`
  6. `npm run server:test`
  7. `npm run build`
  8. Node 22 下 `npm run worker:check`
- 预期：所有命令证据可区分；固定输入在前端、Worker、Replay、CSV、Manifest 一致
- 实际：
  - 三输入出口一致性通过；
  - verify、Worker test、Node server test、build、Node 22 Worker dry-run 通过；
  - Windows `npm test` 为 44 pass / 1 fail，退出码 1，但 runner 仍打印 `ALL 44 ... PASSED`；
  - 同一 commit 的 GitHub Linux/Node 22 CI 在审计前为 success。
- 证据：[仓库事实审计](../engineering/repository-truth-audit.md)、`scripts/auditOutputConsistency.mjs`、GitHub Actions run `30549183266`
- 结论：有条件通过。确定性数字出口已有新鲜证据；跨平台测试、测试汇总文案、生产 deployment identity 和 live 归因尚未达到可信 Release 标准。
- 后续 issue：仓库当前没有 GitHub Issue；应在 Draft PR review 后建立 P0 issue 或合并到第一个 Release milestone。

## 验证记录模板

```markdown
### VAL-YYYYMMDD-NN 标题

- 环境 / commit：
- 用户类型：
- 输入案例：
- 操作步骤：
- 预期：
- 实际：
- 证据：截图、任务 ID、日志或测试名称
- 结论：通过 / 未通过 / 有条件通过
- 后续 issue：
```

没有 commit、环境和证据的口头结论不得写成“已通过”。
