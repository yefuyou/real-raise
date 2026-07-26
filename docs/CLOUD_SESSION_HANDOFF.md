# 云端会话交接：2026-07-26 晚间改动清单

本轮由云端 Cowork 会话完成并写回。基线为当日 15:54 磁盘状态（与写回前核对过 mtime 一致，无冲突）。

## 改动内容

### 1. 工资条模式（新功能，P0）

- **新增** `src/domain/salarySlip.ts`：确定性计算——到手 = 税前 − 扣缴合计；输出两期扣缴合计/到手、个税变化、社保公积金变化、未来账户变化（养老+公积金单列）、留存率（税前无增长为 null）、负到手标记。不含任何城市比例估算。
- **新增** `src/components/PayslipPanel.tsx`：7 项 × 两期输入网格、示例（标注虚构）/清空按钮、扣缴合计与到手只读行、负到手告警。
- `src/App.tsx`：收入区新增"直接填到手 / 工资条模式"切换；工资条模式下两期到手自动写回主计算链路；新增"涨薪去哪儿了（税前 → 到手）"瀑布卡（含未来账户口径与留存率）；**修正诊断链 02 卡**——原先显示 `下期收入/本期收入` 比值却标注"扣缴与实际到手"，现在到手模式显示真实收入变化幅度、工资条模式显示真实扣缴变化；预设案例/重置会切回到手模式避免脱节。
- `src/api/realRaiseContract.ts`：`StartAnalysisRequest` 新增可选 `incomeInputMode` / `payslipSummary`（向后兼容）。
- `src/api/apiClient.ts`：Mock 解读与结构化 Insight 在工资条模式下输出扣缴驱动因素与未来账户口径。
- `server/realRaiseServer.mjs`（makePrompt）：有工资条摘要时向 prompt 注入一行上下文，并硬性要求"养老公积金计入未来账户，不得称为消失"。

### 2. 服务端缓存与降级（P0，保额度）

- 同输入哈希（键排序稳定序列化 + sha256）完成缓存，LRU 上限 100：命中直接回放 `started → completed(cached: true)`，**零供应商调用**。
- 进行中去重：同输入任务运行中时复用同一 taskId，防双击双扣。
- 供应商 HTTP 状态映射为可读降级：401/403 → `AUTH_ERROR`（不可重试）；402/429 → `QUOTA_OR_RATE_LIMIT`；5xx → `VENDOR_UNAVAILABLE`。

### 3. 单服务部署改造（P1）

- server 静态托管 `dist/`：SPA 回退、`/assets/` 长缓存、目录穿越防护；`GET /api/health` 健康探针。
- `PORT` 环境变量存在时自动监听 `0.0.0.0`（Render/Railway），本地仍 `127.0.0.1:8787`。
- **新增** `render.yaml`（Blueprint 一键部署）；`docs/DEPLOYMENT.md` 更新为单服务同源方案与实际步骤。

### 4. 测试

- `src/tests/runTests.ts` 新增测试组 8（4 项：示例精确对齐与恒等式、留存率、负到手、Mock 注入）。**云端实测 22/22 全过**。
- `scripts/test-real-raise-server.mjs` 新增：缓存命中零供应商调用、不同输入绕过缓存、/api/health、429 降级映射、静态托管/SPA 回退/穿越防护/缺 Key 503。**云端实测全过**。

### 5. 文档与材料

- `README.md`：状态表与功能列表更新为工资条模式已完成（城市规则估算仍标注为下一阶段）。
- `docs/SUBMISSION_MATERIALS.md`、`docs/VIDEO_SCRIPT_PACK.md`、`docs/WEIBO_POSTS.md`：报名材料、视频脚本、微博文案（比赛运营用）。

## 回归风险评估

- 到手模式默认体验零改动（收入 fieldset 默认 net 分支 = 原结构）。
- 契约字段全部为可选新增，旧请求不受影响。
- 服务端对外接口不变，仅新增行为。

## 你们机器上的最终验收（云端环境装不了 npm 依赖，请跑一次）

```bash
npm run verify        # TS 类型检查（云端已用桩尽力检查，此为权威口径）
npm run test          # 22 项断言（云端已全过，应一致）
npm run server:test   # 服务端集成测试（云端已全过）
npm run build         # 产出 dist/，单服务部署需要它
```

随后手工过一遍：默认页面与原来一致 → 切工资条模式 → 填示例 → 看 02 卡与"涨薪去哪儿了"瀑布 → Mock 解读含扣缴解释。

## 下一步（按冲刺计划）

1. 7/28：`.env.local` 配 Key 后 `npm run server` + `npm run dev` 真实试跑一次，录屏留证。
2. 7/29：Render Blueprint 部署（详见 DEPLOYMENT.md），置保活探针。
3. 7/30：提交 gallery + 发布 CSDN 博文与微博（docs 里文案齐备）。
