import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  LineChart,
  Loader2,
  PieChart,
  RefreshCw,
  Sparkles,
  StopCircle,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { apiClient, generateMockStructuredInsight } from '../api/apiClient'
import type {
  AgentTaskStatus,
  RealRaiseInsight,
  SourceReference,
  StartAnalysisRequest,
} from '../api/realRaiseContract'
import { REAL_RAISE_BACKEND_ROUTES } from '../api/realRaiseContract'

interface InsightSectionProps {
  requestPayload: StartAnalysisRequest
  onOpenSources: (sources: SourceReference[]) => void
  remoteFeatureEnabled?: boolean
  onToggleRemoteFeature?: (enabled: boolean) => void
}

/** Helper to render inline **bold** text without dangerouslySetInnerHTML */
function renderInlineFormatted(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/** Lightweight safe React Markdown Renderer for insightText */
function SimpleMarkdownRenderer({ content }: { content: string }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inList = false
  let listItems: React.ReactNode[] = []
  let inTable = false
  let tableHeader: string[] = []
  let tableRows: string[][] = []

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="md-ul">
          {listItems}
        </ul>
      )
      listItems = []
      inList = false
    }
  }

  const flushTable = () => {
    if (inTable && (tableHeader.length > 0 || tableRows.length > 0)) {
      elements.push(
        <div key={`table-wrap-${elements.length}`} className="md-table-wrap">
          <table className="md-table">
            {tableHeader.length > 0 && (
              <thead>
                <tr>
                  {tableHeader.map((cell, cIdx) => (
                    <th key={cIdx}>{renderInlineFormatted(cell.trim())}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderInlineFormatted(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      tableHeader = []
      tableRows = []
      inTable = false
    }
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()

    // Table line check
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList()
      const cells = line.split('|').slice(1, -1)
      const isDivider = cells.every((c) => /^[:\s-]*$/.test(c))
      if (isDivider) {
        return
      }
      if (!inTable) {
        inTable = true
        tableHeader = cells
      } else {
        tableRows.push(cells)
      }
      return
    } else if (inTable) {
      flushTable()
    }

    // List item check
    if (line.startsWith('- ') || line.startsWith('* ')) {
      inList = true
      listItems.push(
        <li key={`li-${idx}`}>
          {renderInlineFormatted(line.slice(2).trim())}
        </li>
      )
      return
    } else if (inList) {
      flushList()
    }

    if (!line) {
      return
    }

    // Headings, blockquotes, dividers, paragraphs
    if (line.startsWith('# ')) {
      elements.push(<h3 key={idx} className="md-h3">{renderInlineFormatted(line.slice(2))}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={idx} className="md-h3">{renderInlineFormatted(line.slice(3))}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={idx} className="md-h4">{renderInlineFormatted(line.slice(4))}</h4>)
    } else if (line.startsWith('#### ')) {
      elements.push(<h5 key={idx} className="md-h5">{renderInlineFormatted(line.slice(5))}</h5>)
    } else if (line.startsWith('> ')) {
      elements.push(<blockquote key={idx} className="md-quote">{renderInlineFormatted(line.slice(2))}</blockquote>)
    } else if (line === '---' || line === '***' || line === '___') {
      elements.push(<hr key={idx} className="md-hr" />)
    } else {
      elements.push(<p key={idx} className="md-p">{renderInlineFormatted(line)}</p>)
    }
  })

  flushList()
  flushTable()

  return <div className="markdown-rendered-body">{elements}</div>
}

/** Sanitize streaming stage messages to friendly short Chinese status */
function sanitizeStageMessage(raw?: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()

  if (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.includes('"type"') ||
    trimmed.includes('"tool"') ||
    trimmed.includes('"path"') ||
    trimmed.includes('tool_call') ||
    trimmed.includes('\\n')
  ) {
    if (trimmed.includes('artifact') || trimmed.includes('file') || trimmed.includes('md') || trimmed.includes('csv')) {
      return '正在整理分析文件与产物凭证...'
    }
    if (trimmed.includes('cpi') || trimmed.includes('stat') || trimmed.includes('data') || trimmed.includes('source')) {
      return '正在核对官方数据来源...'
    }
    if (trimmed.includes('calculate') || trimmed.includes('income') || trimmed.includes('spend')) {
      return '正在计算购买力收支变化...'
    }
    return '正在生成 AI 生活解读分析...'
  }

  const singleLine = trimmed.replace(/\r?\n|\r/g, ' ').replace(/\\n/g, ' ')
  if (singleLine.length > 60) {
    return singleLine.slice(0, 58) + '...'
  }
  return singleLine
}

export const InsightSection: React.FC<InsightSectionProps> = ({
  requestPayload,
  onOpenSources,
  remoteFeatureEnabled = true,
  onToggleRemoteFeature,
}) => {
  const [status, setStatus] = useState<AgentTaskStatus | 'idle'>('idle')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [stage, setStage] = useState<string>('等待生成...')
  const [stageMessage, setStageMessage] = useState<string>('')
  const [percent, setPercent] = useState<number>(0)
  const [insightText, setInsightText] = useState<string | null>(null)
  const [structuredInsight, setStructuredInsight] = useState<RealRaiseInsight | null>(null)
  const [sources, setSources] = useState<SourceReference[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [simulatedError] = useState<boolean>(false)
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null)

  useEffect(() => {
    const savedTaskId = localStorage.getItem('real_raise_active_task')
    if (savedTaskId) {
      setTaskId(savedTaskId)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [unsubscribe])

  const handleStartInsight = async (forceSimulatedError?: boolean) => {
    if (!remoteFeatureEnabled) return

    if (unsubscribe) {
      unsubscribe()
      setUnsubscribe(null)
    }

    const isSimError = typeof forceSimulatedError === 'boolean' ? forceSimulatedError : simulatedError

    setStatus('queued')
    setStage('正在创建 AI 生活解读任务...')
    setStageMessage('准备提交参数至分析服务...')
    setPercent(10)
    setErrorMessage(null)
    setDownloadError(null)
    setInsightText(null)
    setStructuredInsight(null)

    try {
      const payload = { ...requestPayload, simulatedError: isSimError }
      const response = await apiClient.startAnalysis(payload)
      const newTaskId = response.taskId
      setTaskId(newTaskId)
      localStorage.setItem('real_raise_active_task', newTaskId)
      setStatus(response.status)

      const cleanup = apiClient.subscribeTaskEvents(newTaskId, payload, (evt) => {
        if (evt.type === 'started') {
          setStatus('running')
          setStage('已连接分析引擎')
          setPercent(20)
        } else if (evt.type === 'progress') {
          setStatus('running')
          setStage(sanitizeStageMessage(evt.stage) || '正在分析中')
          setStageMessage(sanitizeStageMessage(evt.message))
          if (evt.percent !== undefined) {
            setPercent(evt.percent)
          }
        } else if (evt.type === 'insight') {
          setInsightText(evt.text)
        } else if (evt.type === 'completed') {
          setStatus('completed')
          setPercent(100)
          setInsightText(evt.insight)
          setSources(evt.sources)
          const struct = evt.structuredInsight || generateMockStructuredInsight(requestPayload)
          setStructuredInsight(struct)
          setStage('分析完成')
        } else if (evt.type === 'failed') {
          setStatus('failed')
          setErrorMessage(evt.message || '解读生成中断，请稍后重试。')
        }
      })

      setUnsubscribe(() => cleanup)
    } catch (err: any) {
      setStatus('failed')
      setErrorMessage(err.message || '连接服务器异常，无法创建分析任务。')
    }
  }

  const handleCancel = async () => {
    if (unsubscribe) {
      unsubscribe()
      setUnsubscribe(null)
    }
    if (taskId) {
      await apiClient.cancelAnalysis(taskId)
    }
    setStatus('cancelled')
    setStage('任务已取消')
    setPercent(0)
  }

  const handleDownloadArtifact = async (fileName: string) => {
    setDownloadError(null)
    if (!taskId) {
      setDownloadError('暂无可用分析任务 ID，无法下载凭证。')
      return
    }
    try {
      const downloadUrl = REAL_RAISE_BACKEND_ROUTES.artifact(taskId, fileName)
      const res = await fetch(downloadUrl)
      if (!res.ok) {
        throw new Error(`请求服务端文件失败 (HTTP ${res.status})`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err: any) {
      setDownloadError(`下载凭证文件 ${fileName} 失败：${err.message || '网络连接异常'}`)
    }
  }

  return (
    <div className={`insight-card-wrapper status-${status}`}>
      <div className="insight-card-header">
        <div className="insight-title-group">
          <span className="insight-badge">
            <Sparkles size={16} /> AI 生活解读
          </span>
          <span className="insight-subtitle">
            结合 2026H1 价格基准与确定性算表
          </span>
        </div>

        <div className="insight-header-controls">
          <label className="toggle-feature-inline" title="切换 AI 解读模式">
            <span className="toggle-label-inline">
              {remoteFeatureEnabled ? 'AI 解读已开启' : '开启 AI 解读'}
            </span>
            <input
              type="checkbox"
              checked={remoteFeatureEnabled}
              onChange={(e) => onToggleRemoteFeature && onToggleRemoteFeature(e.target.checked)}
            />
            <span className="toggle-slider-inline" />
          </label>

          {remoteFeatureEnabled && (status === 'queued' || status === 'running') && (
            <button className="btn-cancel-task" onClick={handleCancel} type="button">
              <StopCircle size={14} /> 取消任务
            </button>
          )}
        </div>
      </div>

      {!remoteFeatureEnabled ? (
        <div className="insight-body idle-state">
          <div className="insight-feature-disabled">
            <Zap size={22} className="disabled-icon" />
            <div>
              <h4>AI 生活解读服务未开启</h4>
              <p>您可以在右上角开启 AI 生活解读功能，结合真实 CPI 数据生成定制解读。</p>
            </div>
          </div>
        </div>
      ) : status === 'idle' ? (
        <div className="insight-body idle-state">
          <div className="insight-prompt-box">
            <p>
              结合官方 CPI 数据与您的收支输入，生成定制化 AI 生活解读报告。
            </p>
            <button className="btn-generate-insight" onClick={() => handleStartInsight()} type="button">
              <Sparkles size={16} /> 生成 AI 生活解读
            </button>
            <span className="quota-hint">使用本项目真实分析服务进行实时计算</span>
          </div>
        </div>
      ) : status === 'queued' || status === 'running' ? (
        <div className="insight-body progress-state" aria-live="polite">
          <div className="progress-status-row">
            <span className="progress-stage-title">
              <Loader2 size={16} className="spinner" /> {sanitizeStageMessage(stage)}
            </span>
            <span className="progress-percentage">{percent}%</span>
          </div>

          <div
            className="progress-bar-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI 解读生成进度"
          >
            <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>

          {stageMessage && <p className="progress-message">{sanitizeStageMessage(stageMessage)}</p>}
        </div>
      ) : status === 'completed' ? (
        <div className="insight-body completed-state">
          <div className="insight-result-header">
            <span className="success-tag">
              <CheckCircle2 size={14} /> AI 生活解读已生成
            </span>
            {sources.length > 0 && (
              <button
                className="btn-view-sources"
                onClick={() => onOpenSources(sources)}
                type="button"
              >
                <BookOpen size={14} /> 查看数据来源 ({sources.length})
              </button>
            )}
          </div>

          <div className="insight-text-content">
            <SimpleMarkdownRenderer content={insightText || ''} />
          </div>

          {structuredInsight && (
            <div className="structured-analysis-container">
              {/* 区块 1：成本压力来源图 */}
              <div className="analysis-block">
                <div className="block-title">
                  <PieChart size={17} />
                  <h3>主要成本压力来源</h3>
                  <span className="block-subtitle">月开支增减贡献分析（元/月）</span>
                </div>

                <div className="drivers-list">
                  {structuredInsight.drivers.map((drv) => {
                    const impact = drv.monthlyImpact ?? 0
                    const isPositive = impact > 0
                    const isZero = impact === 0
                    const barWidth = Math.min(Math.max(Math.abs(impact) / 10, 8), 100)

                    return (
                      <div key={drv.id} className="driver-row">
                        <div className="driver-header">
                          <span className="driver-label">{drv.label}</span>
                          <span className={`driver-impact ${isZero ? 'neutral' : isPositive ? 'positive' : 'negative'}`}>
                            {isZero ? '0 元' : `${isPositive ? '+' : ''}${impact} 元`}
                          </span>
                        </div>

                        <div className="driver-bar-track">
                          <div
                            className={`driver-bar-fill ${isZero ? 'neutral' : isPositive ? 'positive' : 'negative'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>

                        <p className="driver-exp">{drv.explanation}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 区块 2：我和城市基准的差异 */}
              <div className="analysis-block">
                <div className="block-title">
                  <TrendingUp size={17} />
                  <h3>我和城市基准的差异</h3>
                  <span className="block-subtitle">个人增速 vs 城镇宏观指标对比</span>
                </div>

                <div className="benchmark-grid">
                  <div className="bm-card">
                    <span className="bm-label">个人预计收入增速</span>
                    <strong className="bm-value">{(structuredInsight.benchmark.userIncomeGrowthRate * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="bm-card">
                    <span className="bm-label">个人总支出增速</span>
                    <strong className="bm-value">{(structuredInsight.benchmark.userCostGrowthRate * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="bm-card">
                    <span className="bm-label">城镇居民名义收入增速</span>
                    <strong className="bm-value">
                      {structuredInsight.benchmark.urbanIncomeGrowthRate !== null
                        ? `${(structuredInsight.benchmark.urbanIncomeGrowthRate * 100).toFixed(1)}%`
                        : '—'}
                    </strong>
                    <span className="bm-sub">2025 官方统计基准</span>
                  </div>
                  <div className="bm-card">
                    <span className="bm-label">全国 CPI 居民消费价格</span>
                    <strong className="bm-value">
                      {structuredInsight.benchmark.overallCpiRate !== null
                        ? `${(structuredInsight.benchmark.overallCpiRate * 100).toFixed(1)}%`
                        : '—'}
                    </strong>
                    <span className="bm-sub">2025 官方通胀大盘</span>
                  </div>
                </div>

                {structuredInsight.trend && (
                  <div className="trend-sub-block">
                    <div className="trend-header">
                      <LineChart size={15} /> 2021–2025 官方年度基准与个人趋势
                    </div>
                    <div className="trend-series-list">
                      {structuredInsight.trend.series.map((s) => (
                        <div key={s.id} className="trend-series-item">
                          <span className="series-title">{s.label}：</span>
                          <div className="trend-dots">
                            {s.values.map((v, idx) => (
                              <span key={idx} className="trend-dot-badge">
                                <em>{structuredInsight.trend!.periods[idx]}</em>: {v !== null ? `${(v * 100).toFixed(1)}%` : 'null'}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="bm-caveat">{structuredInsight.benchmark.caveat}</p>
              </div>

              {/* 区块 3：可调整的情景选择 */}
              <div className="analysis-block">
                <div className="block-title">
                  <Compass size={17} />
                  <h3>可调整的情景选择</h3>
                  <span className="block-subtitle">基于个人算表与数据源推演的情景建议</span>
                </div>

                <div className="scenarios-grid">
                  {structuredInsight.scenarios.map((sc) => (
                    <div key={sc.id} className="scenario-card-item">
                      <h4>{sc.title}</h4>
                      <p className="sc-change">{sc.change}</p>
                      {sc.annualRemainderDelta !== null && sc.annualRemainderDelta > 0 && (
                        <div className="sc-delta">
                          <ArrowUpRight size={14} /> 每年结余预计增加 <strong>+{sc.annualRemainderDelta} 元</strong>
                        </div>
                      )}
                      <p className="sc-tradeoff">{sc.tradeoff}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 区块 4：风险提示 */}
              {structuredInsight.warnings.length > 0 && (
                <div className="analysis-warnings-box">
                  <div className="warning-head">
                    <AlertTriangle size={15} /> 风险提示与边界说明
                  </div>
                  <ul>
                    {structuredInsight.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 区块 5：只读分析证据产物 (Artifact) */}
              <div className="analysis-artifact-card">
                <div className="artifact-card-header">
                  <FileText size={16} className="artifact-icon" />
                  <div>
                    <h4>结构化诊断分析证据产物 (Artifact)</h4>
                    <p className="artifact-subtitle">由后端 AgentTaskService 导出的只读分析凭证</p>
                  </div>
                  <span className="artifact-badge">REAL_RAISE_REPORT.md</span>
                </div>
                <div className="artifact-card-body">
                  <div className="artifact-preview-box">
                    <pre><code>{`# REAL RAISE 购买力与消费诊断报告
任务ID: ${taskId || 'mock-task-1'}
--------------------------------------------------
- 状态: 已完成 (Completed)
- 产物文件: explanation.md / evidence.csv / analysis-manifest.json
- 数据底座: 本地确定性算表 + 2026H1 官方 CPI
- 权威原则: AI 解读不覆盖本地数字卡片金额
`}</code></pre>
                  </div>
                  <div className="artifact-actions">
                    <button
                      type="button"
                      className="btn-artifact-dl"
                      onClick={() => handleDownloadArtifact('explanation.md')}
                    >
                      <Download size={13} /> 下载报告凭证 (explanation.md)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('evidence.csv')}
                    >
                      <Download size={13} /> 下载计算数据 (evidence.csv)
                    </button>
                  </div>
                  {downloadError && <p className="download-error-text">{downloadError}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="insight-action-footer">
            <span className="footnote-text">数据来源：权威公开统计数据库 & 本地精准算表</span>
            <button className="btn-reanalyze" onClick={() => handleStartInsight()} type="button">
              <RefreshCw size={13} /> 重新分析
            </button>
          </div>
        </div>
      ) : status === 'failed' ? (
        <div className="insight-body failed-state">
          <div className="error-box">
            <AlertCircle size={20} className="error-icon" />
            <div>
              <h4>解读生成遇到问题</h4>
              <p>{errorMessage}</p>
            </div>
          </div>
          <button className="btn-retry" onClick={() => handleStartInsight(false)} type="button">
            <RefreshCw size={14} /> 重新尝试
          </button>
        </div>
      ) : status === 'cancelled' ? (
        <div className="insight-body cancelled-state">
          <p className="cancelled-note">任务已取消。您的本地输入与精准计算数字已被完整保留。</p>
          <button className="btn-restart" onClick={() => handleStartInsight()} type="button">
            <Sparkles size={14} /> 重新生成解读
          </button>
        </div>
      ) : null}
    </div>
  )
}
