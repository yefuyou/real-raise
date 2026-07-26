import React, { useState } from 'react'
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Info,
  MapPin,
  ShieldAlert,
} from 'lucide-react'
import {
  CITY_DIRECTORY,
  resolveCityBenchmarkSet,
  type CityCoverageTier,
} from '../data/cityBenchmarks'

interface CityBenchmarkSectionProps {
  selectedCityCode?: string
  onSelectCity?: (cityCode: string) => void
}

export const CityBenchmarkSection: React.FC<CityBenchmarkSectionProps> = ({
  selectedCityCode: propCityCode,
  onSelectCity,
}) => {
  const [internalCityCode, setInternalCityCode] = useState<string>('340100')
  const activeCityCode = propCityCode || internalCityCode

  const citySet = resolveCityBenchmarkSet(activeCityCode, '2026H1')

  const handleCityChange = (code: string) => {
    setInternalCityCode(code)
    if (onSelectCity) onSelectCity(code)
  }

  return (
    <div className="city-benchmark-panel panel-subcard">
      <div className="subcard-header">
        <div className="title-group">
          <span className="subcard-icon">
            <MapPin size={16} />
          </span>
          <div>
            <h3>所选城市消费价格基准卡</h3>
            <p className="subcard-subtitle">公开统计核验依据 · 绝不插值或编造缺失城市数据</p>
          </div>
        </div>
      </div>

      {/* Main City Card Display */}
      <div className="city-detail-card">
        <div className="city-card-top">
          <div className="city-identity">
            <h4 className="city-title">{citySet.cityName} 消费价格基准卡</h4>
          </div>

          <div className="city-meta-group">
            <span className="meta-item">
              基准期间：<strong>{citySet.period === '2026H1' ? '2026 年上半年' : citySet.period}</strong>
            </span>
          </div>
        </div>

        {/* Fallback & Data Policy Notice Banner */}
        {activeCityCode !== 'national' && citySet.fallbackCategoryCount > 0 && (
          <div className="fallback-notice-banner">
            <ShieldAlert size={16} className="notice-icon" />
            <div className="notice-content">
              <p>
                {activeCityCode === '340100'
                  ? '合肥当前分类数据未完整公开，缺失类别暂参考全国 2026 年上半年基准。'
                  : `${citySet.cityName}当前分类数据未完整公开，缺失类别暂参考全国 2026 年上半年基准。`}
              </p>
            </div>
          </div>
        )}

        {/* Category Breakdown Table */}
        <div className="city-categories-grid">
          {citySet.records.map((res) => {
            const rec = res.record
            if (!rec) return null
            const isFallback = res.usedFallback
            return (
              <div
                key={res.category}
                className={`city-cpi-chip ${isFallback ? 'is-fallback' : 'is-city'}`}
              >
                <div className="chip-head">
                  <span className="chip-label">{rec.label}</span>
                </div>
                <div className="chip-body">
                  <strong
                    className={`cpi-rate ${
                      rec.yoyRate > 0 ? 'up' : rec.yoyRate < 0 ? 'down' : 'flat'
                    }`}
                  >
                    {rec.yoyRate > 0 ? `+${rec.yoyRate}%` : `${rec.yoyRate}%`}
                  </strong>
                  <span className="index-val">指数 {rec.value}</span>
                </div>
                <div className="chip-foot">
                  <a
                    href={rec.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip-source-link"
                    title={rec.sourceName}
                  >
                    {rec.sourceName.slice(0, 14)}... <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            )
          })}
        </div>

      </div>

      <p className="subcard-footnote">
        * 依据声明：住房支出为个人可选固定维度，城市居住类 CPI
        仅作价格参照，不替代用户实际房租/房贷；缺失城市分类时自动回退全国 2026H1 同比基准。
      </p>
    </div>
  )
}
