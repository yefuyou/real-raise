import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  RotateCcw,
  Sparkles,
  ShieldCheck,
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
import { SourceDrawer } from './components/SourceDrawer'
import type { SourceReference } from './api/realRaiseContract'

const initialInput = DEMO_SCENARIOS[0].input

function App() {
  const [input, setInput] = useState<ScenarioInput>(initialInput)
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
    setInput((current) => ({
      ...current,
      [field]: Number.isFinite(numericValue) ? numericValue : 0,
    }))
    setIsDirty(true)
  }

  const applyScenario = (scenario: ScenarioInput) => {
    setInput(scenario)
    setIsDirty(false)
  }

  const reset = () => {
    setInput(initialInput)
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
      <header className="topbar">
        <a className="brand" href="#top" aria-label="涨薪还剩多少？首页">
          <span className="brand-mark">R</span>
          <span className="brand-title">涨薪还剩多少？</span>
          <span className="brand-version">v1.0 MVP</span>
        </a>
        <div className="topbar-actions">
          <label className="toggle-feature" title="切换本地纯算表 / AI解读模式">
            <span className="toggle-label">AI 解读预览</span>
            <input
              type="checkbox"
              checked={remoteFeatureEnabled}
              onChange={(e) => setRemoteFeatureEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>

          <div className="topbar-meta">
            <span className={`status-dot ${remoteFeatureEnabled ? 'online' : 'offline'}`} aria-hidden="true" />
            {remoteFeatureEnabled ? '本地 Mock 预览' : '纯本地计算'}
            <button
              className="icon-button"
              type="button"
              aria-label="了解运行模式：基础计算和当前解读预览全部在本地完成，不消耗平台积分；后端接入后才会发起服务"
              title="基础计算全部在本地完成，不消耗平台积分"
            >
              <CircleHelp size={16} />
            </button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">REAL RAISE / 01</p>
          <h1><span className="hero-title-part">你的涨薪，</span><em>被房租吃掉了吗？</em></h1>
          <p className="hero-description">
            输入工资和房租的变化，算清生活成本之后，明年真正多了多少钱。
          </p>
          <div className="hero-note">
            <span className="note-line" />
            <span>先算清楚，再决定要不要庆祝。</span>
          </div>
        </div>
        <div className="hero-stamp">
          <span>工资 × 房租</span>
          <strong>真实购买力</strong>
          <span>个人化计算器</span>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="input-panel panel" onSubmit={submit} aria-labelledby="input-heading">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">01 / 输入你的变化</p>
              <h2 id="input-heading">明年会过得更松，还是更紧？</h2>
            </div>
            <button className="reset-button" type="button" onClick={reset} aria-label="重置所有输入">
              <RotateCcw size={14} /> 重置
            </button>
          </div>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>收入</span>
              <span className="field-unit">税后 / 月</span>
            </legend>
            <div className="field-row">
              <MoneyField id="current-income" name="currentIncome" label="现在" value={input.currentIncome} onChange={(value) => updateField('currentIncome', value)} />
              <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
              <MoneyField id="next-income" name="nextIncome" label="明年预计" value={input.nextIncome} onChange={(value) => updateField('nextIncome', value)} />
            </div>
          </fieldset>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>房租</span>
              <span className="field-unit">固定支出 / 月</span>
            </legend>
            <div className="field-row">
              <MoneyField id="current-rent" name="currentRent" label="现在" value={input.currentRent} onChange={(value) => updateField('currentRent', value)} />
              <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
              <MoneyField id="next-rent" name="nextRent" label="明年预计" value={input.nextRent} onChange={(value) => updateField('nextRent', value)} />
            </div>
          </fieldset>

          <fieldset className="field-group field-group-last">
            <legend className="field-group-title">
              <span>其他生活支出</span>
              <span className="field-unit">不含房租 / 月</span>
            </legend>
            <MoneyField id="other-spend" name="otherSpend" label="现在每月大约" value={input.otherSpend} onChange={(value) => updateField('otherSpend', value)} full />
            <label className="rate-field">
              <span id="other-inflation-label">其他支出预计上涨</span>
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
            <p className="field-hint" id="other-inflation-hint">2025 全国 CPI × 城镇消费结构派生基准，可手动调整；真实房租仍以你的输入为准。</p>
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
              <h2 id="result-heading">你的明年账本</h2>
            </div>
            <div className="result-icon" aria-hidden="true"><BarChart3 size={19} /></div>
          </div>

          <div className="headline-result" aria-live="polite" aria-atomic="true">
            <span>{isFlat ? '真实购买力预计持平' : isImproving ? '真实购买力预计上升' : '真实购买力预计下降'}</span>
            <strong>{formatRate(Math.abs(result.realPurchasingPowerRate))}</strong>
            <p>
              {isFlat
                ? '收入和生活支出的变化大致抵消，先把房租与其他支出的变化拆开看。'
                : isImproving
                ? '涨薪跑赢了你的生活支出变化，这部分才是可以放心花掉的钱。'
                : '名义工资虽然上涨，但生活支出涨得更快，先别急着把它当成真正的涨薪。'}
            </p>
          </div>

          <div className="metric-grid">
            <Metric label="每月结余变化" value={formatSignedMoney(result.monthlyRemainderChange)} tone={result.monthlyRemainderChange >= 0 ? 'up' : 'down'} />
            <Metric label="每年结余变化" value={formatSignedMoney(result.annualRemainderChange)} tone={result.annualRemainderChange >= 0 ? 'up' : 'down'} />
            <Metric label="涨薪被房租吃掉" value={result.raiseConsumedByRentRate === null ? '—' : formatRate(result.raiseConsumedByRentRate)} tone={result.raiseConsumedByRentRate !== null && result.raiseConsumedByRentRate > 0.8 ? 'down' : 'neutral'} />
            <Metric label="维持原生活需月入" value={formatMoney(result.breakEvenIncome)} tone="neutral" />
          </div>

          <div className="waterfall-card">
            <div className="card-title-row">
              <h3>结余变化从哪里来</h3>
              <span className="mini-caption">每月 / 元</span>
            </div>
            <WaterfallRow label="工资上涨" value={result.raiseIncrease} tone="good" />
            <WaterfallRow
              label={result.rentIncrease >= 0 ? '房租上涨' : '房租下降'}
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

          {/* AI Insight Section with task status & contract workflow */}
          <InsightSection
            requestPayload={{
              input,
              calculation: result,
              locale: 'zh-CN',
              includeInsight: true,
            }}
            onOpenSources={handleOpenSources}
            remoteFeatureEnabled={remoteFeatureEnabled}
          />

          {/* Historical Macro Benchmark Comparison (2021-2025) */}
          <HistoricalComparisonSection />
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
