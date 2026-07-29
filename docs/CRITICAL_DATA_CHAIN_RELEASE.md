# 关键数据链改造：发布、迁移与回滚包

更新时间：2026-07-29

范围：`codex/critical-data-chain`（基于 Partner SSO 当前候选版本）

本轮策略：只提交 Draft PR，不自动部署生产

## 这次要成立的产品闭环

```text
用户选择城市并输入收入/支出
  → Real Raise 确定性计算
  → Worker 丢弃客户端计算并服务端重算
  → Worker 核验城市基准与公式版本
  → Partner/Judge 发起 InfiniSynapse 任务；未登录则播放 Replay
  → 平台只负责正文、驱动排序、情景解释
  → Real Raise 重建 evidence/manifest
  → completed.provenance 明示任务来源和用户归因
```

验收目标不是“AI 写得更长”，而是：

- 数字只有一个权威；
- 城市选择真的进入分析，且全国回退不会冒充城市原值；
- 平台正文、确定性卡片、实时/回放/Mock 不再混称；
- Partner 用户级 Key、Judge 项目 Key 和回放无归因状态可区分；
- 历史回放可核验，但旧公式不能污染当前下载凭证。

## 变更范围

### 请求与缓存契约

- `StartAnalysisRequest` 新增必填 `calculationVersion=living-cost.v2` 和
  `cityContext`。
- 公式版本、城市、输入模式和模型全部进入请求签名。
- 旧签名缓存自然失效；不做兼容命中，防止跨城市、跨公式串结果。

### 确定性诊断与平台职责

- 新增可勾稽诊断包：到手收入、住房和日常支出三个驱动之和必须精确等于
  月结余变化。
- 工资条扣缴只作为到手收入形成过程，不与到手收入重复相加。
- 提示词只能排序、比较和解释预先计算的情景，不允许自行生成金额。
- Worker 额外生成 `driver-ranking.csv`、`scenario-matrix.csv/json` 与
  `share-summary.md`；平台读取这些权威材料，而不是凭空推演金额。
- 结构化卡片改名并固定为 Real Raise 确定性结果，不再伪装成模型输出。

### 城市与来源

- 浏览器把当前城市选择压缩成小型上下文。
- Worker 用服务端可信目录逐字段核验；伪造 CPI、来源 URL、城市名、
  coverage tier 或 caveat 会在创建平台任务前失败。
- 城市缺值保留全国回退说明和官方来源。

### 产物与执行证明

- `completed` 新增 `provenance`：执行模式、正文来源、结构化数据来源、
  数字权威、公式版本、归因、供应商任务 ID、缓存状态。
- 平台正文保留为 `explanation.md`。
- 默认 `evidence.csv` 与 `analysis-manifest.json` 始终由 Real Raise
  确定性结果生成。
- 平台生成的同名文件另存为 `vendor-original-*`，只供原件核验。

### 认证边界

- Judge 实时任务必须携带由 `/api/judge/session` 签发的短期 Bearer token；
  `X-Real-Raise-Judge: true` 只是模式提示，不是权限凭证。
- Partner SSO 的 `state` 与短期 HttpOnly `__Host-rr_oauth_flow` Cookie
  绑定；缺 Cookie、错配、过期或重放一律拒绝。

### Replay 迁移

- 四个包从 `replay.v1` 升级为 `replay.v2`。
- `recordedRequest` 保存录制时旧公式和真实输入；没有伪造当时不存在的
  城市上下文或版本字段。
- `request` 使用当前公式和受控默认城市，只负责精确匹配。
- 三份供应商原件和正文均锁定 SHA-256。
- UI 显示旧/新值、未录制城市上下文和原件完整性。
- `npm run replays:check` 已进入 `npm run verify`。

## 用户和现网影响

### 正向影响

- 用户能看懂正文来自哪里、数字由谁负责、是否为实时任务以及按谁归因。
- 切换城市或公式后不会误命中旧结果。
- 回放下载的默认证据与当前页面数值一致，历史原件仍可单独核验。

### 可见变化

- 结果区新增执行证明横幅；回放多一条旧口径警告。
- 回放产物增加两个 `vendor-original-*` 下载入口。
- 同样输入在升级后第一次会重新运行或重新匹配，旧缓存不会复用。

### 不发生的变化

- 不迁移数据库或 Durable Object 数据。
- 不改变现有会话 Cookie、Secret、配额、并发或生产域名；仅新增 SSO flow
  绑定 Cookie。
- 不修改用户输入公式界面和主结果卡片布局。
- 本轮不自动部署生产。

## 风险登记

| 严重度 | 风险 | 影响 | 控制措施 |
| --- | --- | --- | --- |
| 高 | 前端和 Worker 的可信城市目录未来发生漂移 | 合法请求被拒绝，实时分析降级 | 发布前覆盖全国、北京、上海、深圳和一个回退城市；新增城市时同步更新并跑 Worker 门禁 |
| 高 | Partner SSO 登录成功但任务没有使用用户级 Key | 注册/活跃无法归因 | 真实冒烟必须核对 `provenance.attribution=partner-user-key`、vendorTaskId 和平台后台用户 |
| 高 | 平台正文引用旧值或自行重算 | 用户看到正文与卡片冲突 | 正文与证据分层；默认 evidence/manifest 由 Real Raise 重建；人工冒烟比较关键金额 |
| 中 | `replay.v2` 静态包或哈希损坏 | 回放停止并明确报错 | CI 执行签名、语义、原件哈希和负向篡改审计，不降级 Mock |
| 中 | 新必填字段与旧静态资源混发 | Worker 返回 400，实时不可用 | 前端与 Worker 必须同批 canary；不得只更新一侧 |
| 中 | 结果区信息增多影响移动端可读性 | 用户难以理解或按钮换行 | 发布前检查 360px、768px、桌面三档截图 |
| 低 | 旧 Node 自托管适配器没有采用新 Worker 路由 | 本地备用链行为不同 | 明确标为非生产备用；`server:test` 保持通过，后续单独统一 |

## 迁移步骤

1. 不触碰数据库、Cookie、Secret 或 Durable Object。
2. 前端与 Worker 作为同一个发布单元构建；旧前端不能单独指向新 Worker。
3. 静态 Replay 包随前端发布；部署前运行 `npm run replays:check`。
4. 保留供应商原件哈希和 `recordedRequest`，禁止为“看起来一致”重写旧产物。
5. 部署后旧浏览器缓存若继续发送旧请求，应收到明确 400；刷新静态资源后恢复。

## 分阶段发布

### 合并前

- `npm test`
- `npm run verify`
- `npm run worker:test`
- `npm run server:test`
- `npm run build`
- `npm run worker:check`
- `git diff --check`

### Canary / 温热阶段

1. 保持现网不变，在预览或独立 Worker 环境部署同一提交。
2. 用全国、北京、上海、深圳、合肥各跑一笔；确认城市值/回退状态和来源。
3. 分别验证 Partner、Judge 和 Replay；Judge 必须覆盖无 token/假 token/过期 token；Mock 只在自动化测试中验证，不作为用户路径。
4. 检查 360px、768px、桌面结果区和全部下载文件。
5. 使用全新 Partner 账号：登录 → 创建真实任务 → SSE 完成 → 下载清单 →
   平台后台核对用户与任务归因。

### 生产阶段

只有 Canary 全绿后才允许发布。前端和 Worker 应在同一变更窗口内上线，
随后立即重跑 Partner 真实任务和 Replay 降级路径。观察 Worker 400/401/429、
任务完成率、耗时和供应商配额；日志不得包含工资、Key、Cookie 或 Prompt。

## 回滚

触发条件：

- 合法城市请求持续返回 400；
- Partner 任务不是 `partner-user-key`；
- 正文与确定性证据出现关键金额冲突；
- 真实任务完成率明显下降；
- 前端/Worker 版本混发且无法立即补齐。

操作：

1. 先将 `LIVE_ANALYSIS_ENABLED=false`，停止新真实调用，让前端进入已标注的
   Replay，保护配额和用户；Mock 只作为自动化测试态存在。
2. 回滚前端与 Worker 到同一个上一版本提交，不能只回滚一侧。
3. 若只出现回放包损坏，可回滚静态前端；不要改写或删除供应商原件。
4. 若怀疑 Key 或会话泄露，轮换对应 Secret，并使现有会话失效。
5. 回滚后验证健康检查、回放旧口径提示和本地确定性计算。

可恢复性：本轮没有数据库迁移；代码和静态包均可按 Git 提交恢复。

## 沟通模板

发布前：

> Real Raise 将更新分析数据链：金额继续由确定性公式负责，平台负责解释；
> 结果会新增实时/回放、计算版本和用户归因证明。发布窗口内不迁移账户或数据。

发布成功：

> 数据链改造已上线。已用全新 Partner 用户完成真实任务和后台归因核验，
> 城市回退、证据下载及 Replay 降级均通过。公式版本为 living-cost.v2。

回滚：

> 实时分析已暂时关闭并回退到明确标注的存档/演示模式；本地计算不受影响。
> 正在处理前端与 Worker 契约或归因异常，不会消耗新的平台额度。

## 当前决策

**代码进入 Draft PR：GO WITH CONDITIONS。**

已满足：Judge token 端到端门禁、SSO flow 绑定、Replay 原件审计、驱动排名与
情景矩阵产物、前端测试、Worker 测试、Node 备用服务测试和生产构建。

**生产部署：NO-GO。**

在以下证据补齐前保持不部署：

- `npm run worker:check` 在目标 Wrangler 环境通过；
- 预览环境五类城市与四种运行模式通过；
- 全新 Partner 用户的真实任务在 InfiniSynapse 后台确认用户级归因；
- 移动端结果区和产物下载完成人工验收。
