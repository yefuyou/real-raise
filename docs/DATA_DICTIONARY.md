# Real Raise 数据字典与开放数据包说明 (Data Dictionary)

更新时间：2026-07-25  
版本：v1.0  
关联导出文件目录：`src/data/exports/`

---

## 一、 数据三分法架构 (Three-Tier Data Architecture)

为了保证计算结果可信、透明且符合个人实际情景，本项目严格采用三分法数据分层：

| 数据分层标记 | 名称 | 定义与来源 | 作用与优先级 |
| :--- | :--- | :--- | :--- |
| **`verified`** | 已核验官方原值 | 直接采自国家统计局官方新闻发布稿与统计公报表 1、表 2 的公开数据。 | 权威宏观对比基准，供用户参照对比。 |
| **`derived`** | 派生估算值 | 依据官方 CPI 与城镇居民八类消费支出结构加权派生的日常支出变动率。 | 当用户未填写具体分类涨幅时作为推算依据。 |
| **`user-input`** | 用户实际输入 | 用户在网页端填写的收入、扣缴、住房/固定支出与日常月开支。 | **最高优先级**！个人输入覆盖任何宏观代理值。 |

---

## 二、 导出的三份 CSV 数据包说明

所有导出文件均为标准 UTF-8 编码 CSV 格式，位于 `src/data/exports/` 目录：

### 1. `income_benchmarks.csv`（居民收支总额与增长率基准）

- **描述**：2021–2025 年全国、城镇、农村居民人均可支配收入、中位数、消费支出及名义/实际同比增速。
- **字段定义**：
  - `year`: 统计年份 (2021–2025)
  - `scope`: 统计范围 (`national` 全国 | `urban` 城镇 | `rural` 农村)
  - `disposableIncome`: 人均可支配收入（元/人/年）
  - `disposableIncomeNominalGrowthPercent`: 可支配收入名义同比增速 (%)
  - `disposableIncomeRealGrowthPercent`: 可支配收入实际同比增速 (%)
  - `disposableIncomeMedian`: 人均可支配收入中位数（元/人/年，若官方未单独公布则为空/null）
  - `consumptionExpenditure`: 人均消费支出总额（元/人/年）
  - `consumptionExpenditureNominalGrowthPercent`: 消费支出名义同比增速 (%)
  - `sourceUrl`: 国家统计局官方发布 URL

### 2. `spending_8_categories.csv`（八大类消费支出明细）

- **描述**：居民八大类消费结构明细金额（食品烟酒、衣着、居住、生活用品及服务、交通通信、教育文化娱乐、医疗保健、其他用品及服务）。
- **字段定义**：
  - `year`: 统计年份 (2021–2025)
  - `scope`: 统计范围 (`national` 全国 | `urban` 城镇)
  - `category`: 支出类别标识符 (`food`, `clothing`, `residence`, `household_goods`, `transport_communication`, `education_culture`, `medical_healthcare`, `other_goods_services`)
  - `label`: 支出类别中文标签
  - `annualAmount`: 年人均支出金额（元/人/年）
  - `sourceUrl`: 国家统计局官方发布 URL

### 3. `cpi_historical.csv`（CPI 历史同比价格指数）

- **描述**：2021–2025 年全国居民消费价格指数 (CPI) 总变动及八大类价格年度同比涨跌幅 (%)。
- **字段定义**：
  - `year`: 统计年份 (2021–2025)
  - `scope`: 统计范围 (`national`)
  - `category`: 类别标识符 (`overall` CPI 总指数 | 8 分项类别)
  - `label`: 中文标签（如“全国 CPI 总涨幅”、“食品烟酒类 CPI”）
  - `annualYoYPercent`: 全年同比涨跌幅 (%)
  - `sourceUrl`: 国家统计局官方发布 URL

---

## 三、 权威来源 Canonical URL 汇总表

| 年份 | 发布主题 | 国家统计局 Canonical 链接 |
| :--- | :--- | :--- |
| **2025** | 2025 年居民收入和消费支出情况 | `https://www.stats.gov.cn/sj/zxfb/202601/t20260120_1958434.html` |
| **2025** | 2025 年居民消费价格主要数据 | `https://www.stats.gov.cn/sj/zxfb/202601/t20260120_1958433.html` |
| **2024** | 2024 年居民收入和消费支出情况 | `https://www.stats.gov.cn/sj/zxfb/202501/t20250117_1958321.html` |
| **2023** | 2023 年居民收入和消费支出情况 | `https://www.stats.gov.cn/sj/zxfb/202401/t20240117_1946622.html` |
| **2022** | 2022 年居民收入和消费支出情况 | `https://www.stats.gov.cn/sj/zxfb/202301/t20230117_1892095.html` |
| **2021** | 2021 年居民收入和消费支出情况 | `https://www.stats.gov.cn/sj/zxfb/202201/t20220117_1826439.html` |

---

## 四、 城市 CPI 扩展包

城市原值不混入全国三份基础 CSV，而由 `src/data/cityBenchmarks.ts` 按城市、期间、类别解析：

- 合肥 `340100`：2024 年完整城市分类样本，`A-history`；
- 上海 `310000`：2026H1 综合 CPI 与 202606 月度八类样本，按期间区分，`B-current`；
- 北京 `110000`：2026H1 综合 CPI 与八类分类值已核验；
- 深圳 `440300`：2026H1 综合 CPI 与八类分类值已核验；
- 其他首批城市：先有目录和待核验状态，当前类别值回退全国 2026H1，不填估算数字。

城市 CPI 仅用于解释日常支出压力；用户实际住房、交通、扣缴和分类支出优先。详情见 `docs/CITY_BENCHMARK_CONTRACT.md`。

## 五、 特殊数据异常与校正口径说明

1. **2024 年城镇八类支出缺失说明**：
   - 官方 2024 年新闻发布稿仅公布了全国八类消费支出明细（表 2），未单独公布城镇八类分类金额。
   - 本项目恪守“不盲想数据”原则，坚决不凭空推算写死城镇八类，因此 2024 年城镇八类支出在数据集中显式置为空缺。

2. **2022 年 1 元舍入差异说明**：
   - 2022 年全国八类分项金额加总为 24,539 元，而官方发布稿表 1 显示的总消费支出为 24,538 元。
   - 这是官方统计公布时四舍五入造成的 1 元自然舍入差，自动化测试中已建立 `abs(sum8 - total) <= 1` 的浮点容错规则。

3. **2025 年农村中位数缺失说明**：
   - 2025 年官方通报中未单独提及农村居民可支配收入中位数，对应字段显式标记为 `null`，拒绝伪造。
