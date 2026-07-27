# 你的涨薪，消失在到手之前了吗？

## Real Raise · 真实涨薪

> 把税前工资、个税、社保公积金和生活支出拆开，看清真正到手的变化。

`确定性计算 + AI 解释分离` · `33/33 自动化断言通过` · `TypeScript 严格检查` · `每个数字带官方来源`

<p align="center">
  <img src="./docs/assets/real-raise-hero.png" alt="Real Raise 将收入变化拆成扣缴、生活支出和可支配结余" width="100%" />
</p>

Real Raise 是一个面向中国职场人的个人收入诊断工具。它不只问"工资涨了多少"，而是继续追问：

```text
税前收入
  ↓ 扣除个税、社保、公积金（养老与公积金单独标注为"未来账户积累"，不称为消失）
真正到手
  ↓ 扣除日常生活支出（按 2026H1 官方 CPI 估算，可手动调整）
可支配结余
```

---

## 30 秒评委路径

1. 打开页面 → 收入区切到**工资条模式** → 点**填入示例**
2. 看"涨薪去哪儿了（税前 → 到手）"瀑布：个税、社保公积金、未来账户各拿走多少
3. 看月/年结余变化与"维持原生活需月入"
4. 点 **AI 解读**：真实 InfiniSynapse 任务产出带来源的解释与三份可下载产物（explanation.md / evidence.csv / analysis-manifest.json）

## 为什么做它

工资条上的涨幅，不等于银行卡里真正多出来的钱。个税、社保、公积金改变当月到手；食品、交通、医疗、教育等日常支出，又决定最后能留下多少。Real Raise 把这些放进一条可核对的链路：

> **收入变化 → 扣缴变化 → 到手变化 → 生活成本变化 → 可支配结余变化**

**所有核心金额由本地确定性公式计算。模型只负责解释、对比和生成情景，不负责改数字。**

## 功能一览

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 到手模式 | 直接填两期到手收入，最快出结论 | ✅ |
| 工资条模式 | 税前 + 个税/养老/医疗/失业/公积金/其他扣缴分开输入，本地算出到手与"税前 → 到手"瀑布 | ✅ |
| 一键估算扣缴 | 按国家统一月度个税公式 + 通用比例预填（标注"估算"、可覆盖），并可按用户当前实际费率推算下一阶段 | ✅ |
| 六类支出详细模式 | 食品/水电/交通/教育/医疗/其他，按 2026H1 分类 CPI 单独调整 | ✅ |
| 城市价格基准卡 | 北京/上海/深圳 2026H1、合肥 2024 已核验样本；缺失城市诚实回退全国基准，绝不插值冒充 | ✅ |
| 历史基准对比 | 2021–2025 官方收入、消费与 CPI（含"官方未公布"字段的如实展示） | ✅ |
| AI 解读（Mock） | 本地模拟状态机，零额度、免登录体验完整流程 | ✅ |
| AI 解读（真实链路） | SSE 进度流 + Task Workspace 三产物 + 同输入哈希缓存 + 401/429/5xx 可读降级 | ✅ 本地后端就绪 |
| BYOK + 真实回放 | 纯静态部署：用户 Key 仅存自己浏览器；无 Key 可看真实任务存档回放（任务 ID 可在平台后台核验） | ✅ 三个预设 + 一个工资条回放已接入 |
| Cloudflare Server API 适配层 | 服务端 Secret、固定 Prompt、请求校验、60 秒限速、每日硬上限、并发保险丝 | 🟡 代码与本地校验完成，待 Cloudflare 授权和真实链路盖章 |

## 数据与模型原则

**数字由确定性公式负责**：核心计算在 [`src/domain/livingCost.ts`](./src/domain/livingCost.ts) 与 [`src/domain/salarySlip.ts`](./src/domain/salarySlip.ts)。平台返回的文字不能覆盖本地数字。

**四分法标注**：`verified` 官方核验原值 ｜ `derived` 派生估算 ｜ `user-input` 用户输入 ｜ `forecast` 显式标注假设的情景预测。

**2026 CPI 使用边界**：截至 2026-07，国家统计局公布到 6 月（1–6 月全国 CPI 同比 +1.0%）。项目将 2026H1 八类 CPI 作为观察基准而非官方预测，用户可手动调整。

**城市三档口径**：有已核验分类数据 → 显示城市基准并标明期间与来源；只有综合 CPI → 仅作价格背景；缺失 → 回退全国基准并明确提示。住房支出永远以用户输入优先。

## InfiniSynapse 集成

InfiniSynapse 是解释层，不是计算器：读取官方统计数据、解释结果为何升降、对比全国/城市基准、输出带年份与统计范围的引用。

- **当前已部署形态**：纯静态 BYOK——体验者填自己的 Key（仅存浏览器 localStorage）；无 Key 时，三个预设案例与一个工资条录制输入可播放**真实任务存档回放**，任务 ID 可在平台后台核验。
- **比赛准入补丁**：`worker/` 已实现 Cloudflare Worker 服务端适配层。生产构建配置 `VITE_ANALYSIS_API_URL` 后，Live 改为“静态站 → Worker → InfiniSynapse”，Key 只存在 Worker Secret；限流或达到每日硬上限时回放降级。该链路仍需完成 Cloudflare 登录、部署和一次真实任务核验，完成前不宣称已经上线。
- **本地备用形态**：保留 Node 后端用于开发与现场备用；同输入哈希缓存与进行中去重保护额度，供应商异常映射为可读降级提示。
- 官方统计基准双轨：演示账号登记为**平台数据源 + 知识库**（含数据口径字典）；BYOK 实时任务采用 prompt 内联来源索引，保证任意账号可复现。

## 本地运行

```bash
npm install
npm run dev          # 前端（Mock 模式零额度）
npm run server       # 可选：真实链路后端（.env.local 配 INFINISYNAPSE_API_KEY）
npm run test         # 33 项自动化断言（含四个真实回放包完整性与命中校验）
npm run server:test  # 后端集成测试（含缓存与降级断言，不消耗额度）
npm run worker:test  # Worker 输入边界与每日保险丝（不调用真实平台）
npm run worker:check # Wrangler 干跑；需要 Node.js 22+
npm run verify && npm run build
```

## 部署

保留现有静态站 URL，只新增 `workers.dev` 后端并通过 `VITE_ANALYSIS_API_URL` 切换 Live 请求；不迁移前端、不购买域名。详见 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [PROJECT_PLAN](./docs/PROJECT_PLAN.md) / [NEXT_STAGE_PLAN](./docs/NEXT_STAGE_PLAN.md) | 产品定位、边界与阶段计划 |
| [BYOK_REPLAY_SPEC](./docs/BYOK_REPLAY_SPEC.md) | BYOK + 真实回放三态实施方案 |
| [PAYSLIP_UX_SPEC](./docs/PAYSLIP_UX_SPEC.md) | 工资条一键估算与版面改造方案 |
| [INFINISYNAPSE_TASK_CONTRACT](./docs/INFINISYNAPSE_TASK_CONTRACT.md) / [INTEGRATION_BOUNDARY](./docs/INFINISYNAPSE_INTEGRATION_BOUNDARY.md) | 平台任务契约与隔离边界 |
| [CITY_BENCHMARK_CONTRACT](./docs/CITY_BENCHMARK_CONTRACT.md) / [DATA_DICTIONARY](./docs/DATA_DICTIONARY.md) | 城市数据契约与数据口径字典 |
| [DEPLOYMENT](./docs/DEPLOYMENT.md) / [DEMO_RELEASE_CHECKLIST](./docs/DEMO_RELEASE_CHECKLIST.md) | 部署与发布检查清单 |
| [SUBMISSION_MATERIALS](./docs/SUBMISSION_MATERIALS.md) / [VIDEO_SCRIPT_PACK](./docs/VIDEO_SCRIPT_PACK.md) / [WEIBO_POSTS](./docs/WEIBO_POSTS.md) | 参赛提交、视频脚本与传播材料 |

## 安全边界

不会提交或上传：InfiniSynapse API Key 及任何 Secret；`.env` 文件；用户工资条、银行流水与个人扣缴明细；未脱敏任务日志；没有来源、年份和统计范围的数字。平台数据源仅登记国家统计局公开数据。

## 比赛

本项目参加 [InfiniSynapse × CSDN Vibe Coding 泛数据分析应用开发大赛](https://infinisynapse.cn/contest/vibe-coding)。

比赛演示不做宏观数据大屏，而是在 30 秒内让用户看懂：

> **这次涨薪，经过扣缴和生活支出之后，真正留在我手里的还有多少？**
