# Replay 证据来源与迁移规则

日期：2026-07-29

## 为什么是 `replay.v2`

四个历史任务录制于旧版购买力指标：

```text
(1 + 收入增长率) / (1 + 总支出增长率) - 1
```

当前产品采用：

```text
月结余变化 / 当前到手收入
```

录制完成后，历史回放包曾只更新 `request.calculation.realPurchasingPowerRate`
和请求签名，没有同步供应商生成的 `explanation.md`、`evidence.csv` 与
`analysis-manifest.json`。这会让当前请求和历史产物看起来属于同一口径。

`replay.v2` 不修改供应商原始报告，而是把两个事实分开保存：

- `request`：当前页面用于精确命中回放的请求。使用 `living-cost.v2`，并包含默认
  合肥 `2026H1` 上下文。
- `recordedRequest`：当时实际录制所依据的旧请求。它保留旧购买力数值，且不伪造
  当时不存在的 `calculationVersion` 或 `cityContext`。

## Provenance 约束

`provenance.vendorArtifacts` 必须声明：

- `origin = infinisynapse-task-workspace`
- `integrity = vendor-original-unaltered`
- 对 `completed.insight`、`explanation.md`、`evidence.csv`、
  `analysis-manifest.json` 保存 SHA-256

这些哈希保护的是供应商原件。人工修订不得继续标为
`vendor-original-unaltered`，也不得替换原件后重算哈希冒充历史平台输出。

`provenance.compatibility` 必须声明：

- 录制计算版本与当前计算版本
- 唯一允许变化的字段
- 历史任务没有城市上下文
- 当前合肥上下文只用于受控匹配，不代表供应商当时分析过合肥数据
- 面向用户的旧口径提示

因此 UI 会显示“历史真实任务存档（旧口径）”，并同时展示旧值与当前值。

下载文件也必须分层：

- `explanation.md`：历史供应商报告原文，页面明确标为历史正文。
- `evidence.csv` / `analysis-manifest.json`：Real Raise 根据当前 `request`
  与 `living-cost.v2` 重新生成的当前权威凭证。
- `vendor-original-evidence.csv` /
  `vendor-original-analysis-manifest.json`：历史供应商原件，只用于核验，
  不能继续作为当前数字凭证。

## 自动化发布门禁

运行：

```bash
npm run replays:check
```

以下任一情况都会失败：

- 包仍是未标注的 `replay.v1`
- 当前请求签名不可复算
- `request` 与 `recordedRequest` 有未声明差异
- 当前或旧公式不能从各自输入复算
- evidence 或 manifest 与录制口径不一致
- 供应商原件内容不符合保存的 SHA-256
- manifest 没有暴露 schema、原件完整性或兼容状态

`npm run verify` 已包含该门禁。

## 迁移与重新录制

历史 v1 包的一次性迁移命令：

```bash
npm run replays:migrate
```

它只添加双请求、来源声明、原件哈希和当前匹配签名，不改写供应商原始产物。

下一次真实重新录制应直接使用当前完整请求。新的供应商任务若已经接收
`living-cost.v2` 和城市上下文，应录成新的 schema 状态，不得继续标为
`legacy-calculation`。在新录制完成并通过同等审计前，当前四个旧任务保留兼容警示。
