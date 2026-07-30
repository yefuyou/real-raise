# InfiniSynapse 首次上传与真实任务清单（历史）

## 第一批可上传文件

先上传这三份已经有字段说明和来源登记的 UTF-8 CSV：

1. `src/data/exports/income_benchmarks.csv`
   - 2021–2025 全国/城镇/农村居民收入与消费总额。
2. `src/data/exports/spending_8_categories.csv`
   - 2021–2025 全国/城镇八类消费结构；2024 城镇缺失保持为空，不补造。
3. `src/data/exports/cpi_historical.csv`
   - 2021–2025 全国 CPI 总体与八类年度同比。

城市数据暂不把目录当作事实数据：

- 合肥原值在 `src/data/hefei2024.ts`，上海原值在 `src/data/shanghai2026.ts`；
- 解析与回退由 `src/data/cityBenchmarks.ts` 统一完成；
- 真正上传前应从该契约生成一次带 `cityCode / period / category / value / scope / coverage / sourceUrl` 的标准化 `city_cpi_benchmarks.csv`，不能由前端手工拼接。

## 首次真实任务的固定输入

不要把用户每次拖动滑块都发给平台。第一次真实验证只用一个固定案例：

- 城市：合肥 `340100`
- 请求期间：`2026H1`
- 合肥分类数据：缺失，按类别回退全国 2026H1
- 用户实际数字：来自本地 `LivingCostResult`
- 详细分类：使用已通过本地校验的六类明细

任务目标只有一个：让 Agent 解释“收入变化 → 扣缴/到手 → 日常分类 CPI 贡献 → 可支配结余”，并对每个官方统计结论给出年份、范围和来源。

## 额度保护

- 前端开发默认 `useMock = true`。
- 真实调用只有一个明确按钮触发。
- 相同输入用 hash 缓存，刷新和重试不重复创建供应商任务。
- 滑块、输入框、城市选择不会直接触发真实任务。
- 任务失败时可以保留本地计算结果，不重算、不重新上传全部文件。

## 验收产物

服务端完成一次真实任务后，必须能从 workspace 整理出：

- `analysis-manifest.json`
- `evidence.csv`
- `explanation.md`

缺少 workspace 或来源证据时，任务只能标记为 failed/retryable，不能伪装成 completed。
