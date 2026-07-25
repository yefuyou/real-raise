const fs = require('fs')
const path = require('path')

// Read and parse officialHistorical compiled JS from dist-test
const distHistoricalPath = path.resolve(__dirname, '../dist-test/data/officialHistorical.js')
if (!fs.existsSync(distHistoricalPath)) {
  console.error('Please compile ts first')
  process.exit(1)
}

const {
  HISTORICAL_CPI,
  HISTORICAL_INCOME_BENCHMARKS,
  HISTORICAL_SPENDING,
} = require(distHistoricalPath)

const outputDir = path.resolve(__dirname, '../src/data/exports')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// 1. income_benchmarks.csv
const incomeHeaders = [
  'year',
  'scope',
  'disposableIncome',
  'disposableIncomeNominalGrowthPercent',
  'disposableIncomeRealGrowthPercent',
  'disposableIncomeMedian',
  'consumptionExpenditure',
  'consumptionExpenditureNominalGrowthPercent',
  'sourceUrl',
]

const incomeRows = HISTORICAL_INCOME_BENCHMARKS.map((r) => [
  r.year,
  r.scope,
  r.disposableIncome,
  r.disposableIncomeNominalGrowthPercent ?? '',
  r.disposableIncomeRealGrowthPercent ?? '',
  r.disposableIncomeMedian ?? '',
  r.consumptionExpenditure,
  r.consumptionExpenditureNominalGrowthPercent ?? '',
  `"${r.sourceUrl}"`,
].join(','))

fs.writeFileSync(
  path.join(outputDir, 'income_benchmarks.csv'),
  [incomeHeaders.join(','), ...incomeRows].join('\n'),
  'utf-8'
)

// 2. spending_8_categories.csv
const spendingHeaders = ['year', 'scope', 'category', 'label', 'annualAmount', 'sourceUrl']
const spendingRows = HISTORICAL_SPENDING.map((r) => [
  r.year,
  r.scope,
  r.category,
  `"${r.label}"`,
  r.annualAmount,
  `"${r.sourceUrl}"`,
].join(','))

fs.writeFileSync(
  path.join(outputDir, 'spending_8_categories.csv'),
  [spendingHeaders.join(','), ...spendingRows].join('\n'),
  'utf-8'
)

// 3. cpi_historical.csv
const cpiHeaders = ['year', 'scope', 'category', 'label', 'annualYoYPercent', 'sourceUrl']
const cpiRows = HISTORICAL_CPI.map((r) => [
  r.year,
  r.scope,
  r.category,
  `"${r.label}"`,
  r.annualYoYPercent,
  `"${r.sourceUrl}"`,
].join(','))

fs.writeFileSync(
  path.join(outputDir, 'cpi_historical.csv'),
  [cpiHeaders.join(','), ...cpiRows].join('\n'),
  'utf-8'
)

console.log('✓ Successfully generated 3 clean CSV export files in src/data/exports/')
