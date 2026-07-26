import React, { useState } from 'react'
import { Database, ExternalLink, FileText, HelpCircle, Info, MapPin } from 'lucide-react'
import {
  HISTORICAL_CPI,
  HISTORICAL_INCOME_BENCHMARKS,
} from '../data/officialHistorical'
import { verifiedDataSources } from '../data/dataContract'
import { HEFEI_2024_CPI, HEFEI_2024_CPI_SOURCE } from '../data/hefei2024'

export const HistoricalComparisonSection: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number>(2025)

  const selectedIncomeRecords = HISTORICAL_INCOME_BENCHMARKS.filter(
    (item) => item.year === selectedYear
  )
  const selectedCpiRecords = HISTORICAL_CPI.filter(
    (item) => item.year === selectedYear
  )

  return (
    <div className="historical-comparison-card panel-subcard">
      <div className="subcard-header">
        <div className="title-group">
          <span className="subcard-icon">
            <Database size={16} />
          </span>
          <h3>国家统计局历史基准对比 (2021–2025)</h3>
        </div>
        <div className="year-selector" role="tablist" aria-label="选择历史基准年份">
          {[2025, 2024, 2023, 2022, 2021].map((year) => (
            <button
              key={year}
              className={`year-tab ${selectedYear === year ? 'active' : ''}`}
              onClick={() => setSelectedYear(year)}
              type="button"
              role="tab"
              aria-selected={selectedYear === year}
            >
              {year} 年
            </button>
          ))}
        </div>
      </div>

      <div className="three-tier-legend">
        <span className="tier-badge verified" title="官方已核验公开原值">
          <FileText size={12} /> 已核验官方原值 (verified)
        </span>
        <span className="tier-badge derived" title="依据 CPI 与消费结构加权派生">
          <Info size={12} /> 派生估算值 (derived)
        </span>
        <span className="tier-badge user-input" title="用户在页面手动输入的数值">
          <HelpCircle size={12} /> 用户实际输入 (user-input)
        </span>
      </div>

      <div className="macro-grid">
        <div className="macro-col">
          <h4>{selectedYear} 年居民收支大盘 (元/人/年)</h4>
          <div className="table-responsive">
            <table className="macro-table">
              <thead>
                <tr>
                  <th>范围</th>
                  <th>人均可支配收入</th>
                  <th>收入中位数</th>
                  <th>人均消费支出</th>
                </tr>
              </thead>
              <tbody>
                {selectedIncomeRecords.map((rec) => (
                  <tr key={rec.scope}>
                    <td className="scope-name">
                      {rec.scope === 'national' ? '全国' : rec.scope === 'urban' ? '城镇' : '农村'}
                    </td>
                    <td>{rec.disposableIncome.toLocaleString('zh-CN')} 元</td>
                    <td>{rec.disposableIncomeMedian !== null ? `${rec.disposableIncomeMedian.toLocaleString('zh-CN')} 元` : <span className="missing-tag">未单独公布</span>}</td>
                    <td>{rec.consumptionExpenditure.toLocaleString('zh-CN')} 元</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="macro-col">
          <h4>{selectedYear} 年 CPI 同比变化概览 (%)</h4>
          <div className="cpi-chips-grid">
            {selectedCpiRecords.slice(0, 9).map((cpi) => (
              <div className="cpi-chip" key={cpi.category}>
                <span className="cpi-label">{cpi.label}</span>
                <span className={`cpi-val ${cpi.annualYoYPercent > 0 ? 'up' : cpi.annualYoYPercent < 0 ? 'down' : 'flat'}`}>
                  {cpi.annualYoYPercent > 0 ? `+${cpi.annualYoYPercent}%` : `${cpi.annualYoYPercent}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="city-card-box">
        <div className="city-card-header">
          <span className="city-name-tag">
            <MapPin size={13} /> 合肥市 2024 年城市 CPI 官方基准卡
          </span>
          <span className="city-source-label">
            来源：
            <a
              href={HEFEI_2024_CPI_SOURCE.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link-inline"
            >
              广州统计年鉴 2025 <ExternalLink size={11} />
            </a>
          </span>
        </div>
        <div className="cpi-chips-grid">
          {HEFEI_2024_CPI.map((cpi) => (
            <div className="cpi-chip" key={cpi.category}>
              <span className="cpi-label">{cpi.label}</span>
              <span className={`cpi-val ${cpi.yoyRate > 0 ? 'up' : cpi.yoyRate < 0 ? 'down' : 'flat'}`}>
                {cpi.yoyRate > 0 ? `+${cpi.yoyRate}%` : `${cpi.yoyRate}%`}
              </span>
            </div>
          ))}
        </div>
        <p className="city-card-note">
          * 注：此数据为合肥市 2024 年官方全量 CPI 城市样本，非 2026H1 预测；未单独公布 2026H1 的城市数据继续自动回退至全国基准。
        </p>
      </div>

      <p className="macro-footnote">
        * 官方数据登记总数：<strong>{verifiedDataSources.length}</strong> 条。个人输入与本地算表结果始终优先，上方全国/城市统计基准仅作为背景对照。
      </p>
    </div>
  )
}
