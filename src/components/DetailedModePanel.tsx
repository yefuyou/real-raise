import React from 'react'
import {
  AlertTriangle,
  Car,
  Check,
  GraduationCap,
  HeartPulse,
  Package,
  RefreshCw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Utensils,
  Zap,
} from 'lucide-react'
import {
  DEFAULT_CATEGORY_CPI_RATES,
  type CategoryKey,
  type DetailedSpendBreakdown,
} from '../api/realRaiseContract'

interface DetailedModePanelProps {
  breakdown: DetailedSpendBreakdown
  otherSpend: number
  onChangeBreakdown: (newBreakdown: DetailedSpendBreakdown) => void
  onSyncTotalToSum: (sumCurrent: number, weightedRate?: number) => void
}

import type { LucideIcon } from 'lucide-react'

export const CATEGORY_CONFIG: Record<
  CategoryKey,
  {
    label: string
    desc: string
    officialTag: string
    icon: LucideIcon
    themeClass: string
  }
> = {
  food: {
    label: '食品与餐饮',
    desc: '伙食费、外卖、食材采购',
    officialTag: '2026H1 CPI -0.2%',
    icon: Utensils,
    themeClass: 'theme-food',
  },
  utilities: {
    label: '水电与生活用品',
    desc: '水电气费、物业、日常消耗品',
    officialTag: '2026H1 CPI +1.9%',
    icon: Zap,
    themeClass: 'theme-utilities',
  },
  transport: {
    label: '交通与通信',
    desc: '地铁、打车、加油、话费网费',
    officialTag: '2026H1 CPI +1.8%',
    icon: Car,
    themeClass: 'theme-transport',
  },
  education: {
    label: '教育与娱乐',
    desc: '培训、书籍、电影、游玩健身',
    officialTag: '2026H1 CPI +1.2%',
    icon: GraduationCap,
    themeClass: 'theme-education',
  },
  medical: {
    label: '医疗保健',
    desc: '药品、体检、医疗保险与保健',
    officialTag: '2026H1 CPI +2.0%',
    icon: HeartPulse,
    themeClass: 'theme-medical',
  },
  other: {
    label: '其他生活杂项',
    desc: '服饰鞋帽、人情往来、零星开支',
    officialTag: '2026H1 CPI +11.6%',
    icon: Package,
    themeClass: 'theme-other',
  },
}

export const DetailedModePanel: React.FC<DetailedModePanelProps> = ({
  breakdown,
  otherSpend,
  onChangeBreakdown,
  onSyncTotalToSum,
}) => {
  const currentSum = Object.values(breakdown).reduce((a, b) => a + (b?.currentAmount || 0), 0)
  const nextSum = Object.values(breakdown).reduce((a, b) => a + (b?.nextAmount || 0), 0)
  const totalDelta = nextSum - currentSum
  const weightedRate = currentSum > 0 ? totalDelta / currentSum : 0
  const isMatch = Math.abs(currentSum - otherSpend) < 1

  const handleCategoryChange = (
    key: CategoryKey,
    field: 'currentAmount' | 'cpiRate' | 'nextAmount',
    valueStr: string
  ) => {
    const rawVal = Number(valueStr.replace(/,/g, ''))
    const val = Number.isFinite(rawVal) ? rawVal : 0
    const prevItem = breakdown[key] || {
      currentAmount: 0,
      cpiRate: DEFAULT_CATEGORY_CPI_RATES[key],
      nextAmount: 0,
    }

    let updatedItem = { ...prevItem }

    if (field === 'currentAmount') {
      updatedItem.currentAmount = val >= 0 ? val : 0
      updatedItem.nextAmount = Math.round(updatedItem.currentAmount * (1 + updatedItem.cpiRate))
    } else if (field === 'cpiRate') {
      updatedItem.cpiRate = val / 100
      updatedItem.nextAmount = Math.round(updatedItem.currentAmount * (1 + updatedItem.cpiRate))
    } else if (field === 'nextAmount') {
      updatedItem.nextAmount = val >= 0 ? val : 0
      if (updatedItem.currentAmount > 0) {
        updatedItem.cpiRate = (updatedItem.nextAmount - updatedItem.currentAmount) / updatedItem.currentAmount
      }
    }

    onChangeBreakdown({
      ...breakdown,
      [key]: updatedItem,
    })
  }

  return (
    <div className="detailed-mode-panel-fancy">
      {/* Header section */}
      <div className="fancy-detailed-header">
        <div className="header-title-badge">
          <div className="icon-glow-wrap">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h3>详细模式：六类日常支出拆解与 CPI 动态覆盖</h3>
            <p className="detailed-subtitle">
              默认自动导入国家统计局 2025 分类 CPI 基准，支持按个人实际情况单独调试与覆盖预估
            </p>
          </div>
        </div>
      </div>

      {/* 6 Category Cards Grid */}
      <div className="category-cards-grid">
        {(Object.keys(CATEGORY_CONFIG) as CategoryKey[]).map((key) => {
          const cfg = CATEGORY_CONFIG[key]
          const IconComp = cfg.icon
          const item = breakdown[key] || {
            currentAmount: 0,
            cpiRate: DEFAULT_CATEGORY_CPI_RATES[key],
            nextAmount: 0,
          }
          const delta = item.nextAmount - item.currentAmount
          const isUp = delta > 0
          const isDown = delta < 0

          return (
            <div key={key} className={`category-card ${cfg.themeClass}`}>
              {/* Top Header of Card */}
              <div className="card-top-bar">
                <div className="category-title-group">
                  <span className="cat-icon-avatar">
                    <IconComp size={16} />
                  </span>
                  <div>
                    <h4 className="cat-name">{cfg.label}</h4>
                    <span className="cat-desc-text">{cfg.desc}</span>
                  </div>
                </div>
                <span className="official-cpi-pill">{cfg.officialTag}</span>
              </div>

              {/* 3 Metric Column Fields */}
              <div className="cat-inputs-row">
                <div className="metric-input-box">
                  <label htmlFor={`cat-cur-${key}`} className="input-label-sm">
                    当前月支出
                  </label>
                  <div className="fancy-input-field">
                    <input
                      id={`cat-cur-${key}`}
                      type="number"
                      min="0"
                      step="50"
                      value={item.currentAmount || ''}
                      onChange={(e) => handleCategoryChange(key, 'currentAmount', e.target.value)}
                      placeholder="0"
                      inputMode="numeric"
                      aria-label={`${cfg.label} 当前月支出`}
                    />
                    <span className="field-currency">元</span>
                  </div>
                </div>

                <div className="metric-input-box">
                  <label htmlFor={`cat-cpi-${key}`} className="input-label-sm">
                    预估 CPI
                  </label>
                  <div className={`fancy-input-field cpi-field ${item.cpiRate > 0 ? 'rate-up' : item.cpiRate < 0 ? 'rate-down' : ''}`}>
                    <input
                      id={`cat-cpi-${key}`}
                      type="number"
                      step="0.1"
                      value={Number((item.cpiRate * 100).toFixed(1))}
                      onChange={(e) => handleCategoryChange(key, 'cpiRate', e.target.value)}
                      aria-label={`${cfg.label} 预估 CPI 涨幅`}
                    />
                    <span className="field-currency">%</span>
                  </div>
                </div>

                <div className="metric-input-box highlight-box">
                  <label htmlFor={`cat-next-${key}`} className="input-label-sm">
                    下阶段预估
                  </label>
                  <div className="fancy-input-field">
                    <input
                      id={`cat-next-${key}`}
                      type="number"
                      min="0"
                      step="50"
                      value={item.nextAmount || ''}
                      onChange={(e) => handleCategoryChange(key, 'nextAmount', e.target.value)}
                      placeholder="0"
                      inputMode="numeric"
                      aria-label={`${cfg.label} 下阶段预估月支出`}
                    />
                    <span className="field-currency">元</span>
                  </div>
                </div>
              </div>

              {/* Bottom Delta Indicator */}
              <div className="card-bottom-summary">
                <span className="summary-label">月开支变动:</span>
                <span className={`delta-tag ${isUp ? 'delta-up' : isDown ? 'delta-down' : 'delta-zero'}`}>
                  {isUp && <TrendingUp size={12} />}
                  {isDown && <TrendingDown size={12} />}
                  {delta > 0 ? `+${delta} 元/月` : delta < 0 ? `${delta} 元/月` : '持平 (0 元)'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Validation & Sync Bar */}
      <div className={`fancy-sum-bar ${isMatch ? 'status-match' : 'status-mismatch'}`}>
        <div className="sum-metrics-wrap">
          <div className="status-icon-bubble">
            {isMatch ? <Check size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div className="sum-text-group">
            <div className="sum-title-line">
              <span>分类当前合计: <strong>{currentSum.toLocaleString('zh-CN')} 元</strong></span>
              <span className="divider">•</span>
              <span>下阶段预计合计: <strong>{nextSum.toLocaleString('zh-CN')} 元</strong></span>
              <span className="divider">•</span>
              <span className="weighted-tag">
                综合涨跌幅: <strong>{(weightedRate * 100).toFixed(2)}%</strong>
                ({totalDelta >= 0 ? `+${totalDelta}` : totalDelta} 元)
              </span>
            </div>
            {!isMatch && (
              <p className="mismatch-warning-text">
                分类当前合计 ({currentSum.toLocaleString('zh-CN')} 元) 与上方基本设置中的“其他月支出” ({otherSpend.toLocaleString('zh-CN')} 元) 存在 <strong>{Math.abs(currentSum - otherSpend).toLocaleString('zh-CN')} 元</strong> 偏差
              </p>
            )}
          </div>
        </div>

        {!isMatch && (
          <button
            type="button"
            className="btn-fancy-sync"
            onClick={() => onSyncTotalToSum(currentSum, weightedRate)}
          >
            <RefreshCw size={14} className="spin-on-hover" />
            一键同步总额 ({currentSum.toLocaleString('zh-CN')} 元)
          </button>
        )}
      </div>
    </div>
  )
}
