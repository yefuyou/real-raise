import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Database,
  MapPin,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { DEMO_SCENARIOS } from './data/demoScenarios'
import {
  calculateLivingCost,
  formatMoney,
  formatRate,
  type ScenarioInput,
} from './domain/livingCost'
import { InsightSection } from './components/InsightSection'
import { HistoricalComparisonSection } from './components/HistoricalComparisonSection'
import { CityBenchmarkSection } from './components/CityBenchmarkSection'
import { SourceDrawer } from './components/SourceDrawer'
import { DetailedModePanel } from './components/DetailedModePanel'
import { CITY_DIRECTORY } from './data/cityBenchmarks'
import {
  DEFAULT_CATEGORY_CPI_RATES,
  type CategoryKey,
  type DetailedSpendBreakdown,
  type SourceReference,
} from './api/realRaiseContract'

const initialInput = DEMO_SCENARIOS[0].input

function createDetailedBreakdown(totalSpend: number): DetailedSpendBreakdown {
  const weights: Record<CategoryKey, number> = {
    food: 0.30,
    utilities: 0.15,
    transport: 0.15,
    education: 0.15,
    medical: 0.10,
    other: 0.15,
  }
  const result = {} as DetailedSpendBreakdown
  ;(Object.keys(weights) as CategoryKey[]).forEach((key) => {
    const cur = Math.round(totalSpend * weights[key])
    const rate = DEFAULT_CATEGORY_CPI_RATES[key]
    result[key] = {
      currentAmount: cur,
      cpiRate: rate,
      nextAmount: Math.round(cur * (1 + rate)),
    }
  })
  return result
}

const initialBreakdown = createDetailedBreakdown(initialInput.otherSpend)

function App() {
  const [input, setInput] = useState<ScenarioInput>(initialInput)
  const [selectedCityCode, setSelectedCityCode] = useState<string>('340100')
  const [activeBenchmarkTab, setActiveBenchmarkTab] = useState<'current' | 'history'>('current')
  const [inputMode, setInputMode] = useState<'basic' | 'detailed'>('basic')
  const [detailedBreakdown, setDetailedBreakdown] = useState<DetailedSpendBreakdown>(initialBreakdown)
  const [isDirty, setIsDirty] = useState(false)
  const [remoteFeatureEnabled, setRemoteFeatureEnabled] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeSources, setActiveSources] = useState<SourceReference[]>([])
  const resultRef = useRef<HTMLElement>(null)

  const result = useMemo(() => calculateLivingCost(input), [input])
  const isImproving = result.realPurchasingPowerRate > 0
  const isFlat = result.realPurchasingPowerRate === 0
  const resultTone = isFlat ? 'neutral' : isImproving ? 'positive' : 'negative'

  const updateField = (field: keyof ScenarioInput, value: string) => {
    const numericValue = Number(value.replace(/,/g, ''))
    const newOtherSpend = field === 'otherSpend' ? (Number.isFinite(numericValue) ? numericValue : 0) : input.otherSpend

    setInput((current) => ({
      ...current,
      [field]: Number.isFinite(numericValue) ? numericValue : 0,
    }))

    if (field === 'otherSpend' && newOtherSpend > 0) {
      setDetailedBreakdown(createDetailedBreakdown(newOtherSpend))
    }

    setIsDirty(true)
  }

  const handleSyncTotalToSum = (sumCurrent: number, weightedRate?: number) => {
    setInput((prev) => ({
      ...prev,
      otherSpend: sumCurrent,
      otherInflationRate: typeof weightedRate === 'number' && Number.isFinite(weightedRate) ? Number(weightedRate.toFixed(4)) : prev.otherInflationRate,
    }))
    setIsDirty(true)
  }

  const applyScenario = (scenario: ScenarioInput) => {
    setInput(scenario)
    setDetailedBreakdown(createDetailedBreakdown(scenario.otherSpend))
    setIsDirty(false)
  }

  const reset = () => {
    setInput(initialInput)
    setDetailedBreakdown(initialBreakdown)
    setInputMode('basic')
    setIsDirty(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsDirty(false)
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resultRef.current?.focus({ preventScroll: true })
  }

  const handleOpenSources = (sources: SourceReference[]) => {
    setActiveSources(sources)
    setIsDrawerOpen(true)
  }

  return (
    <main className="app-shell">
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">01 / 购买力真实算表</p>
          <h1><span className="hero-title-part">你的涨薪，</span><em>消失在到手之前了吗？</em></h1>
          <p className="hero-description">
            先把税前工资、个税与社保公积金拆开，再看生活支出之后真正能留下多少钱。
          </p>
          <div className="hero-note">
            <span className="note-line" />
            <span>先算清楚，再决定要不要庆祝。</span>
          </div>
        </div>
        <div className="hero-stamp">
          <span>工资 × 扣缴</span>
          <strong>真正到手</strong>
          <span>个人化计算器</span>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="input-panel panel" onSubmit={submit} aria-labelledby="input-heading">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">01 / 输入你的变化</p>
              <h2 id="input-heading">下一阶段会过得更松，还是更紧？</h2>
            </div>
            <button className="reset-button" type="button" onClick={reset} aria-label="重置所有输入">
              <RotateCcw size={14} /> 重置
            </button>
          </div>

          {/* Mode Switch Tabs */}
          <div className="input-mode-tabs" role="tablist" aria-label="输入精细度模式">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'basic'}
              className={`mode-tab ${inputMode === 'basic' ? 'active' : ''}`}
              onClick={() => setInputMode('basic')}
            >
              基础模式
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'detailed'}
              className={`mode-tab ${inputMode === 'detailed' ? 'active' : ''}`}
              onClick={() => setInputMode('detailed')}
            >
              <SlidersHorizontal size={14} /> 详细模式（六类拆解）
            </button>
          </div>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>收入</span>
              <span className="field-unit">到手收入 / 月</span>
            </legend>
            <div className="field-row">
              <MoneyField id="current-income" name="currentIncome" label="现在" value={input.currentIncome} onChange={(value) => updateField('currentIncome', value)} />
              <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
              <MoneyField id="next-income" name="nextIncome" label="下一阶段预计" value={input.nextIncome} onChange={(value) => updateField('nextIncome', value)} />
            </div>
          </fieldset>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>住房支出（可选维度）</span>
              <span className="field-unit">固定支出 / 月</span>
            </legend>
            <div className="field-row">
              <MoneyField id="current-rent" name="currentRent" label="现在" value={input.currentRent} onChange={(value) => updateField('currentRent', value)} />
              <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
              <MoneyField id="next-rent" name="nextRent" label="下一阶段预计" value={input.nextRent} onChange={(value) => updateField('nextRent', value)} />
            </div>
          </fieldset>

          <fieldset className="field-group field-group-last">
            <legend className="field-group-title">
              <span>日常生活支出</span>
              <span className="field-unit">不含住房 / 月</span>
            </legend>
            <MoneyField id="other-spend" name="otherSpend" label="现在每月大约" value={input.otherSpend} onChange={(value) => updateField('otherSpend', value)} full />
            <label className="rate-field">
              <span id="other-inflation-label">日常支出预计变化</span>
              <span className="rate-input-wrap">
                <input
                  id="other-inflation"
                  name="otherInflationRate"
                  type="number"
                  min="-50"
                  max="100"
                  step="0.01"
                  value={(input.otherInflationRate * 100).toFixed(2)}
                  onChange={(event) => updateField('otherInflationRate', String(Number(event.target.value) / 100))}
                  aria-labelledby="other-inflation-label"
                  aria-describedby="other-inflation-hint"
                  inputMode="decimal"
                />
                <span aria-hidden="true">%</span>
              </span>
            </label>
            <p className="field-hint" id="other-inflation-hint">默认基于 2026 年上半年已公布 CPI 与消费结构派生，可手动调整；这不是全年或下一年度官方预测。</p>

            {inputMode === 'detailed' && (
              <DetailedModePanel
                breakdown={detailedBreakdown}
                otherSpend={input.otherSpend}
                onChangeBreakdown={(newBd) => {
                  setDetailedBreakdown(newBd)
                  setIsDirty(true)
                }}
                onSyncTotalToSum={handleSyncTotalToSum}
              />
            )}
          </fieldset>

          <fieldset className="field-group field-group-last">
            <legend className="field-group-title">
              <span>所在城市</span>
              <span className="field-unit">参考 CPI 价格基准</span>
            </legend>
            <div className="city-select-row">
              <label htmlFor="user-city-select" className="city-select-label">
                <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                选择城市：
              </label>
              <select
                id="user-city-select"
                className="city-select-input"
                value={selectedCityCode}
                onChange={(e) => setSelectedCityCode(e.target.value)}
              >
                <option value="national">全国</option>
                {CITY_DIRECTORY.map((city) => (
                  <option key={city.cityCode} value={city.cityCode}>
                    {city.cityName}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <button className="primary-button" type="submit">
            <Sparkles size={17} />
            {isDirty ? '查看最新结果' : '重新查看结果'}
          </button>
          <p className="form-status" aria-live="polite">
            {isDirty ? '输入已修改，结果会在点击按钮后定位到最新摘要。' : '结果已根据当前输入实时更新。'}
          </p>

          <div className="scenario-strip" aria-labelledby="scenario-heading">
            <span className="scenario-label" id="scenario-heading">试试预设案例</span>
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                className="scenario-button"
                type="button"
                key={scenario.id}
                onClick={() => applyScenario(scenario.input)}
                aria-label={`${scenario.label}：${scenario.note}`}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </form>

        <section className={`result-panel panel ${resultTone}`} ref={resultRef} tabIndex={-1} aria-labelledby="result-heading">
          <div className="panel-heading result-heading">
            <div>
              <p className="section-kicker">02 / 先看结论</p>
              <h2 id="result-heading">你的下一阶段账本</h2>
            </div>
            <div className="result-icon" aria-hidden="true"><BarChart3 size={19} /></div>
          </div>

          <div className="headline-result" aria-live="polite" aria-atomic="true">
            <span>{isFlat ? '真实购买力预计持平' : isImproving ? '真实购买力预计上升' : '真实购买力预计下降'}</span>
            <strong>{formatRate(Math.abs(result.realPurchasingPowerRate))}</strong>
            <p>
              {isFlat
                ? '收入和生活支出的变化大致抵消，先把扣缴、固定支出与日常支出拆开看。'
                : isImproving
                ? '涨薪跑赢了你的生活支出变化，这部分才是可以放心花掉的钱。'
                : '名义工资虽然上涨，但生活支出涨得更快，先别急着把它当成真正的涨薪。'}
            </p>
          </div>

          {/* AI Insight Section (Moved to #2 right after main conclusion) */}
          <InsightSection
            requestPayload={{
              input,
              calculation: result,
              locale: 'zh-CN',
              includeInsight: true,
              inputMode,
              detailedBreakdown: inputMode === 'detailed' ? detailedBreakdown : undefined,
            }}
            onOpenSources={handleOpenSources}
            remoteFeatureEnabled={remoteFeatureEnabled}
            onToggleRemoteFeature={setRemoteFeatureEnabled}
          />

          {/* 4-Step Visual Explanation Chain ("到手收入诊断链") */}
          <div className="explanation-chain-container">
            <div className="chain-title-row">
              <h3>到手收入与购买力诊断链</h3>
              <span className="chain-badge">确定性链式追踪</span>
            </div>

            <div className="chain-steps-grid">
              <div className="chain-step-card step-1">
                <span className="step-num">01</span>
                <span className="step-name">名义加薪变化</span>
                <strong className="step-val">{formatSignedMoney(result.raiseIncrease)}</strong>
                <p className="step-desc">到手月收入变动额</p>
              </div>

              <div className="chain-step-card step-2">
                <span className="step-num">02</span>
                <span className="step-name">扣缴与实际到手</span>
                <strong className="step-val">
                  {input.currentIncome > 0
                    ? `${((input.nextIncome / input.currentIncome) * 100).toFixed(1)}%`
                    : '100%'}
                </strong>
                <p className="step-desc">你的涨薪，消失在到手之前了吗？</p>
              </div>

              <div className="chain-step-card step-3">
                <span className="step-num">03</span>
                <span className="step-name">日常六类 CPI 贡献</span>
                <strong className="step-val">
                  {formatSignedMoney(-(result.nextOtherSpend - input.otherSpend))}
                </strong>
                <p className="step-desc">日常六类消费价格涨跌变动</p>
              </div>

              <div className="chain-step-card step-4">
                <span className="step-num">04</span>
                <span className="step-name">可支配结余变化</span>
                <strong className={`step-val ${result.monthlyRemainderChange >= 0 ? 'good' : 'bad'}`}>
                  {formatSignedMoney(result.monthlyRemainderChange)}
                </strong>
                <p className="step-desc">每月实际自由支配净结余</p>
              </div>
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="每月结余变化" value={formatSignedMoney(result.monthlyRemainderChange)} tone={result.monthlyRemainderChange >= 0 ? 'up' : 'down'} />
            <Metric label="每年结余变化" value={formatSignedMoney(result.annualRemainderChange)} tone={result.annualRemainderChange >= 0 ? 'up' : 'down'} />
            <Metric label="到手收入增加" value={formatSignedMoney(result.raiseIncrease)} tone={result.raiseIncrease >= 0 ? 'up' : 'down'} />
            <Metric label="维持原生活需月入" value={formatMoney(result.breakEvenIncome)} tone="neutral" />
          </div>

          <div className="waterfall-card">
            <div className="card-title-row">
              <h3>结余变化从哪里来</h3>
              <span className="mini-caption">每月 / 元</span>
            </div>
            <WaterfallRow label="工资上涨" value={result.raiseIncrease} tone="good" />
            <WaterfallRow
              label={result.rentIncrease >= 0 ? '住房支出增加' : '住房支出减少'}
              value={-result.rentIncrease}
              tone={result.rentIncrease >= 0 ? 'bad' : 'good'}
            />
            <WaterfallRow
              label={result.nextOtherSpend >= input.otherSpend ? '其他支出增加' : '其他支出减少'}
              value={-(result.nextOtherSpend - input.otherSpend)}
              tone={result.nextOtherSpend >= input.otherSpend ? 'bad' : 'good'}
            />
            <div className="waterfall-total">
              <span>最终月结余变化</span>
              <strong className={result.monthlyRemainderChange >= 0 ? 'number-good' : 'number-bad'}>
                {formatSignedMoney(result.monthlyRemainderChange)}
              </strong>
            </div>
          </div>

          {/* Unified Price Benchmark Panel with Tab Switcher */}
          <div className="price-benchmark-container panel-subcard">
            <div className="benchmark-tab-bar" role="tablist" aria-label="价格基准切换">
              <button
                type="button"
                role="tab"
                id="tab-current-city"
                aria-controls="panel-current-city"
                aria-selected={activeBenchmarkTab === 'current'}
                className={`benchmark-tab-btn ${activeBenchmarkTab === 'current' ? 'active' : ''}`}
                onClick={() => setActiveBenchmarkTab('current')}
              >
                <MapPin size={14} /> 当前城市
              </button>
              <button
                type="button"
                role="tab"
                id="tab-history-ref"
                aria-controls="panel-history-ref"
                aria-selected={activeBenchmarkTab === 'history'}
                className={`benchmark-tab-btn ${activeBenchmarkTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveBenchmarkTab('history')}
              >
                <Database size={14} /> 历史参考
              </button>
            </div>

            <div
              id="panel-current-city"
              role="tabpanel"
              aria-labelledby="tab-current-city"
              hidden={activeBenchmarkTab !== 'current'}
              className="tab-panel-content"
            >
              <CityBenchmarkSection selectedCityCode={selectedCityCode} onSelectCity={setSelectedCityCode} />
            </div>

            <div
              id="panel-history-ref"
              role="tabpanel"
              aria-labelledby="tab-history-ref"
              hidden={activeBenchmarkTab !== 'history'}
              className="tab-panel-content"
            >
              <HistoricalComparisonSection />
            </div>
          </div>
        </section>
      </section>

      <SourceDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        sources={activeSources}
      />

      <footer className="footer-note">
        <span><ShieldCheck size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> REAL RAISE · 确定性计算底座 + 公开统计 Mock 解读</span>
        <span>所有金额与计算结果基于个人输入，不构成专业财务建议。</span>
      </footer>
    </main>
  )
}


function MoneyField({ id, name, label, value, onChange, full = false }: { id: string; name: string; label: string; value: number; onChange: (value: string) => void; full?: boolean }) {
  return (
    <label className={`money-field ${full ? 'full' : ''}`}>
      <span id={`${id}-label`}>{label}</span>
      <span className="money-input-wrap">
        <input
          id={id}
          name={name}
          type="number"
          min="0"
          step="100"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          aria-labelledby={`${id}-label`}
        />
        <span aria-hidden="true">元</span>
      </span>
    </label>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={`metric-value ${tone}`}>
        {tone === 'up' && <ArrowUpRight size={17} aria-hidden="true" />}
        {tone === 'down' && <ArrowDownRight size={17} aria-hidden="true" />}
        {value}
      </strong>
    </div>
  )
}

function WaterfallRow({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' }) {
  const max = 2000
  const width = Math.min(Math.max(Math.abs(value) / max * 100, value === 0 ? 0 : 5), 100)
  return (
    <div className="waterfall-row" role="img" aria-label={`${label}：${formatSignedMoney(value)}`}>
      <span>{label}</span>
      <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${width}%` }} /></div>
      <strong className={tone === 'good' ? 'number-good' : 'number-bad'}>{formatSignedMoney(value)}</strong>
    </div>
  )
}

function formatSignedMoney(value: number) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-CN')} 元`
}

export default App
