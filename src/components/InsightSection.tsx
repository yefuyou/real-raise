import React, { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Compass,
  Download,
  FileText,
  LineChart,
  Loader2,
  PieChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  StopCircle,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { apiClient, buildDeterministicStructuredInsight } from '../api/apiClient'
import { requestSignature } from '../api/requestSignature'
import { PartnerSsoPanel } from './PartnerSsoPanel'
import { authClient, formatFriendlyAuthErrorMessage, type AuthState } from '../api/authClient'
import type {
  AgentTaskStatus,
  AnalysisExecutionProvenance,
  AnalysisModel,
  RealRaiseInsight,
  ReplayMeta,
  SourceReference,
  StartAnalysisRequest,
} from '../api/realRaiseContract'

interface InsightSectionProps {
  requestPayload: StartAnalysisRequest
  /** 阻止把未完成的工资条或未同步的详细拆解提交给 AI。 */
  analysisValidationMessage?: string | null
  onOpenSources: (sources: SourceReference[]) => void
  remoteFeatureEnabled?: boolean
  onToggleRemoteFeature?: (enabled: boolean) => void
}

type AnalysisInputContext = {
  signature: string
  incomeInputMode: 'net' | 'payslip'
  inputMode: 'basic' | 'detailed'
  cityName: string
  calculationVersion: string
  analysisModel: AnalysisModel | ''
}

function analysisModelLabel(model: AnalysisModel | '' | 'platform-default'): string {
  if (model === 'deepseek-v4-flash') return 'DeepSeek V4 Flash'
  if (model === 'deepseek-v4-pro') return 'DeepSeek V4 Pro'
  return '跟随平台默认'
}

function executionLabel(provenance: AnalysisExecutionProvenance | null): string {
  if (!provenance) return '分析结果已生成'
  const fallbackSuffix = provenance.artifactStatus === 'stream-fallback'
    ? '（平台未回传报告文件，使用事件流正文）'
    : provenance.artifactStatus === 'deterministic-only'
      ? '（仅确定性凭证）'
      : ''
  if (provenance.mode === 'partner-live') return `InfiniSynapse 用户实时任务已完成${fallbackSuffix}`
  if (provenance.mode === 'judge-live') return `InfiniSynapse 实时任务已完成${fallbackSuffix}`
  if (provenance.mode === 'replay') return `InfiniSynapse 历史任务存档回放${fallbackSuffix}`
  return `本地演示结果已生成${fallbackSuffix}`
}

function narrativeLabel(provenance: AnalysisExecutionProvenance): string {
  if (provenance.narrativeSource === 'infinisynapse-live') return '正文：InfiniSynapse 实时任务'
  if (provenance.narrativeSource === 'infinisynapse-replay') return '正文：InfiniSynapse 历史任务存档'
  return '正文：Real Raise 本地演示模板'
}

function artifactStatusLabel(status?: AnalysisExecutionProvenance['artifactStatus']): string {
  if (status === 'verified') return '平台报告文件已核验'
  if (status === 'stream-fallback') return '平台未回传报告文件，使用事件流正文'
  if (status === 'deterministic-only') return '仅有 Real Raise 确定性凭证'
  if (status === 'failed-retryable') return '平台证据不完整，可重试'
  return '产物状态未声明'
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

/**
 * 可折叠分析块。报告一次性铺开太长，默认只展开最有行动价值的一块，
 * 其余收起。用原生 details/summary：键盘与屏幕阅读器开箱可用。
 */
function AnalysisBlock({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="analysis-block" open={defaultOpen}>
      <summary className="block-title">
        {icon}
        <h3>{title}</h3>
        <span className="block-subtitle">{subtitle}</span>
        <ChevronDown size={15} className="block-caret" aria-hidden="true" />
      </summary>
      <div className="block-body">{children}</div>
    </details>
  )
}

function AnalysisContextSummary({
  provenance,
  requestPayload,
}: {
  provenance: AnalysisExecutionProvenance
  requestPayload: StartAnalysisRequest
}) {
  return (
    <details className="analysis-context-details">
      <summary>查看本次分析上下文</summary>
      <div className="analysis-context-grid">
        <div><span>Prompt 版本</span><strong>{provenance.promptVersion || '历史任务未记录'}</strong></div>
        <div><span>上下文版本</span><strong>{provenance.contextVersion || '历史任务未记录'}</strong></div>
        <div><span>任务目标</span><strong>{provenance.taskGoal || '判断涨薪留存与主要抵消因素'}</strong></div>
        <div><span>计算版本</span><strong>{provenance.calculationVersion}</strong></div>
        <div><span>城市口径</span><strong>{requestPayload.cityContext.cityName} · {requestPayload.cityContext.period} · {requestPayload.cityContext.coverageTier}</strong></div>
        <div><span>来源 IDs</span><strong>{provenance.sourceIds?.join('、') || '历史任务未记录'}</strong></div>
        <div><span>执行模式</span><strong>{provenance.mode} · {provenance.attribution}</strong></div>
        <div><span>产物状态</span><strong>{artifactStatusLabel(provenance.artifactStatus)}</strong></div>
      </div>
      <p className="analysis-context-boundary">
        数字权威：Real Raise 确定性算表；InfiniSynapse 负责排序、比较、解释和报告表达。
        {provenance.inputSignature ? ` 输入签名：${provenance.inputSignature}` : ''}
      </p>
    </details>
  )
}

export const InsightSection: React.FC<InsightSectionProps> = ({
  requestPayload,
  analysisValidationMessage = null,
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
  const [provenance, setProvenance] = useState<AnalysisExecutionProvenance | null>(null)
  const [sources, setSources] = useState<SourceReference[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [simulatedError] = useState<boolean>(false)
  const serverLiveConfigured = apiClient.getActiveMode() === 'server-live'
  const [authState, setAuthState] = useState<AuthState>(() => authClient.getState())
  const [taskInputContext, setTaskInputContext] = useState<AnalysisInputContext | null>(null)
  const [reportInputContext, setReportInputContext] = useState<AnalysisInputContext | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AnalysisModel | ''>('')

  useEffect(() => {
    const unsub = authClient.subscribe((st) => setAuthState(st))
    void authClient.checkAuth()
    return unsub
  }, [])
  /** 非空 = 本次结果来自真实任务存档回放（必须显式标注，不冒充实时）。 */
  const [replayMeta, setReplayMeta] = useState<ReplayMeta | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const activeTaskIdRef = useRef<string | null>(null)
  const runVersionRef = useRef(0)
  const startInFlightRef = useRef(false)
  const pendingCancellationRef = useRef<Promise<boolean> | null>(null)
  const currentRequestSignature = requestSignature({
    ...requestPayload,
    ...(selectedModel ? { analysisModel: selectedModel } : {}),
  })

  const taskUsesPreviousInputs = Boolean(
    taskInputContext
    && (status === 'queued' || status === 'running')
    && taskInputContext.signature !== currentRequestSignature,
  )
  const reportUsesPreviousInputs = Boolean(
    reportInputContext
    && status === 'completed'
    && reportInputContext.signature !== currentRequestSignature,
  )
  const describeInputContext = (context: AnalysisInputContext | null) => {
    if (!context) return '提交时的输入'
    return `${context.incomeInputMode === 'payslip' ? '工资条模式' : '到手模式'} · ${context.inputMode === 'detailed' ? '详细拆解' : '基础模式'} · ${context.cityName} · ${analysisModelLabel(context.analysisModel)} · ${context.calculationVersion}`
  }
  const cancelTaskAndTrack = (id: string): Promise<boolean> => {
    const promise = apiClient.cancelAnalysis(id)
    pendingCancellationRef.current = promise
    void promise.then(
      () => {
        if (pendingCancellationRef.current === promise) pendingCancellationRef.current = null
      },
      () => {
        if (pendingCancellationRef.current === promise) pendingCancellationRef.current = null
      },
    )
    return promise
  }

  useEffect(() => {
    // 旧版本写过一个无法真正跨刷新恢复的活动任务 ID；启动时迁移清掉。
    try {
      localStorage.removeItem('real_raise_active_task')
    } catch {
      // 隐私模式下 localStorage 可能不可用。
    }
  }, [])

  useEffect(() => {
    return () => {
      runVersionRef.current += 1
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      const activeTaskId = activeTaskIdRef.current
      activeTaskIdRef.current = null
      if (activeTaskId) void cancelTaskAndTrack(activeTaskId)
    }
  }, [])

  useEffect(() => {
    if (remoteFeatureEnabled) return
    runVersionRef.current += 1
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    const activeTaskId = activeTaskIdRef.current
    activeTaskIdRef.current = null
    if (activeTaskId) void cancelTaskAndTrack(activeTaskId)
    setStatus('idle')
    setTaskId(null)
    setStage('等待生成...')
    setStageMessage('')
    setPercent(0)
    setInsightText(null)
    setStructuredInsight(null)
    setProvenance(null)
    setSources([])
    setErrorMessage(null)
    setDownloadError(null)
    setReplayMeta(null)
    setTaskInputContext(null)
    setReportInputContext(null)
  }, [remoteFeatureEnabled])

  const handleStartInsight = async (
    forceSimulatedError?: boolean,
    executionMode: 'live' | 'replay' = 'live',
  ) => {
    if (!remoteFeatureEnabled || analysisValidationMessage || startInFlightRef.current) return
    startInFlightRef.current = true
    setIsStarting(true)
    const runVersion = runVersionRef.current + 1
    runVersionRef.current = runVersion
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    const previousTaskId = activeTaskIdRef.current
    activeTaskIdRef.current = null
    if (pendingCancellationRef.current) {
      await pendingCancellationRef.current.catch(() => undefined)
    }
    if (previousTaskId) {
      await cancelTaskAndTrack(previousTaskId).catch(() => undefined)
    }
    if (runVersion !== runVersionRef.current) {
      startInFlightRef.current = false
      setIsStarting(false)
      return
    }

    const isSimError = typeof forceSimulatedError === 'boolean' ? forceSimulatedError : simulatedError

    setTaskId(null)
    setStatus('queued')
    setStage('正在创建 AI 生活解读任务...')
    setStageMessage('准备提交参数至分析服务...')
    setPercent(10)
    setErrorMessage(null)
    setDownloadError(null)
    setInsightText(null)
    setStructuredInsight(null)
    setProvenance(null)
    setSources([])
    setReplayMeta(null)
    setReportInputContext(null)

    try {
      const payload: StartAnalysisRequest = {
        ...requestPayload,
        simulatedError: isSimError,
        ...(executionMode === 'live' && selectedModel ? { analysisModel: selectedModel } : {}),
      }
      const runInputContext: AnalysisInputContext = {
        signature: requestSignature(payload),
        incomeInputMode: payload.incomeInputMode ?? 'net',
        inputMode: payload.inputMode ?? 'basic',
        cityName: payload.cityContext.cityName,
        calculationVersion: payload.calculationVersion,
        analysisModel: payload.analysisModel ?? '',
      }
      setTaskInputContext(runInputContext)
      const response = executionMode === 'replay'
        ? await apiClient.startReplayAnalysis(payload)
        : await apiClient.startAnalysis(payload)
      const newTaskId = response.taskId
      if (runVersion !== runVersionRef.current) {
        await apiClient.cancelAnalysis(newTaskId)
        return
      }
      activeTaskIdRef.current = newTaskId
      setTaskId(newTaskId)
      setStatus(response.status)

      const cleanup = apiClient.subscribeTaskEvents(newTaskId, payload, (evt) => {
        if (runVersion !== runVersionRef.current) return
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
          activeTaskIdRef.current = null
          setStatus('completed')
          setPercent(100)
          setInsightText(evt.insight)
          setSources(evt.sources)
          setReplayMeta(evt.replayMeta ?? null)
          setProvenance(evt.provenance)
          const struct = evt.structuredInsight || buildDeterministicStructuredInsight(payload)
          setStructuredInsight(struct)
          setStage('分析完成')
          setReportInputContext(runInputContext)
          setTaskInputContext(null)
        } else if (evt.type === 'failed') {
          activeTaskIdRef.current = null
          setStatus('failed')
          setErrorMessage(formatFriendlyAuthErrorMessage(evt.code, evt.message))
          setTaskInputContext(null)
        }
      })

      if (runVersion === runVersionRef.current) unsubscribeRef.current = cleanup
      else cleanup()
    } catch (err: any) {
      if (runVersion !== runVersionRef.current) return
      activeTaskIdRef.current = null
      setStatus('failed')
      setErrorMessage(formatFriendlyAuthErrorMessage(err.code || err.name, err.message))
      setTaskInputContext(null)
    } finally {
      startInFlightRef.current = false
      setIsStarting(false)
    }
  }

  const handleCancel = async () => {
    if (isCancelling) return
    runVersionRef.current += 1
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    const activeTaskId = activeTaskIdRef.current ?? taskId
    activeTaskIdRef.current = null
    setIsCancelling(true)
    setTaskId(null)
    setStatus('cancelled')
    setStage('任务已取消')
    setStageMessage('')
    setPercent(0)
    setTaskInputContext(null)
    if (activeTaskId) {
      try {
        await cancelTaskAndTrack(activeTaskId)
      } finally {
        setIsCancelling(false)
      }
    } else {
      setIsCancelling(false)
    }
  }

  const handleDownloadArtifact = (fileName: string) => {
    setDownloadError(null)
    if (!taskId) {
      setDownloadError('暂无可用分析任务 ID，无法下载凭证。')
      return
    }
    // 纯静态部署没有后端可下载，产物直接来自本次任务在浏览器内的结果。
    const content = apiClient.getArtifactContent(taskId, fileName)
    if (content === null) {
      setDownloadError(`没有找到可下载的 ${fileName}，请重新生成一次解读后再试。`)
      return
    }
    try {
      const blob = new Blob([content], {
        type: fileName.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
      })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err: any) {
      setDownloadError(`保存凭证文件 ${fileName} 失败：${err.message || '浏览器拒绝了下载'}`)
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
            <button className="btn-cancel-task" onClick={handleCancel} type="button" disabled={isCancelling}>
              <StopCircle size={14} /> {isCancelling ? '正在取消…' : '取消任务'}
            </button>
          )}
        </div>
      </div>

      {taskUsesPreviousInputs && (
        <div className="analysis-stale-notice" role="status">
          <AlertTriangle size={15} />
          <span>
            左侧输入已变化；当前任务仍按“{describeInputContext(taskInputContext)}”提交时的数据继续执行，
            不会自动新建任务。需要停止时请点击右上角“取消任务”。
          </span>
        </div>
      )}
      {reportUsesPreviousInputs && (
        <div className="analysis-stale-notice completed-stale-notice" role="status">
          <AlertTriangle size={15} />
          <span>
            当前报告基于“{describeInputContext(reportInputContext)}”生成；页面输入或分析模型已经变化。
            确认当前选择后，点击“按最新输入重新分析”才会发起新任务。
          </span>
        </div>
      )}
      {analysisValidationMessage && (
        <div className="analysis-validation-note" role="alert">
          <AlertTriangle size={15} />
          <span>{analysisValidationMessage}</span>
        </div>
      )}

      {serverLiveConfigured
        && remoteFeatureEnabled
        && authState.authenticated
        && authState.canRunAnalysis !== false
        && (
          <div className="analysis-model-control">
            <div>
              <strong>分析模型</strong>
              <span>仅影响下一次用户实时任务</span>
            </div>
            <label htmlFor="partner-analysis-model-select">
              <span className="sr-only">选择 InfiniSynapse 分析模型</span>
              <select
                id="partner-analysis-model-select"
                className="api-key-model-select"
                value={selectedModel}
                disabled={isStarting || status === 'queued' || status === 'running'}
                onChange={(event) => setSelectedModel(event.target.value as AnalysisModel | '')}
              >
                <option value="">跟随平台默认</option>
                <option value="deepseek-v4-flash">DeepSeek V4 Flash（省额度）</option>
                <option value="deepseek-v4-pro">DeepSeek V4 Pro（高质量）</option>
              </select>
            </label>
          </div>
        )}

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

            {/* --- 两条用户路径：Partner 实时、未登录真实回放 --- */}
            {serverLiveConfigured && (
              <div className="analysis-mode-section partner-user-section">
                <PartnerSsoPanel />
                {authState.authenticated && authState.canRunAnalysis !== false && (
                  <div className="user-mode-controls">
                    <div className="mode-identity-tag">
                      <span className="identity-badge user-badge">👤 当前模式：使用我的 InfiniSynapse 账号（消耗个人额度）</span>
                    </div>
                    <button
                      className="btn-generate-insight btn-user-mode"
                      onClick={() => handleStartInsight()}
                      disabled={isStarting || Boolean(analysisValidationMessage)}
                      type="button"
                    >
                      <Sparkles size={16} /> 使用我的 InfiniSynapse 账号生成 AI 深度解读
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 登录状态不影响回放：始终只播放与当前输入精确匹配的真实任务存档。 */}
            <button
              className="btn-generate-insight btn-replay-mode"
              onClick={() => handleStartInsight(undefined, 'replay')}
              disabled={isStarting || authState.loading || Boolean(analysisValidationMessage)}
              type="button"
            >
              <BookOpen size={16} /> 查看真实任务回放（不消耗积分）
            </button>

            <span className="quota-hint">
              {serverLiveConfigured
                ? authState.authenticated
                  ? '已登录：使用你的 InfiniSynapse 账号生成实时报告。'
                  : '未登录：查看真实任务回放；登录后可生成个人实时报告。'
                : '当前未连接实时服务：仅提供真实任务回放。'}
            </span>
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
              <CheckCircle2 size={14} />
              {executionLabel(provenance)}
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

          {replayMeta && (
            <>
              <p className="replay-banner">
                {replayMeta.compatibility ? '历史真实任务存档（旧口径）' : '真实任务存档回放'}
                {' · '}任务 ID {replayMeta.vendorTaskId} · 录制于 {replayMeta.recordedAt.slice(0, 10)} ·
                供应商原件未改写（完整性已审计） ·
                {'登录 InfiniSynapse 后可实时重跑。'}
              </p>
              {replayMeta.compatibility && (
                <p className="replay-banner replay-compatibility-warning" role="alert">
                  <strong>历史口径提示：</strong>
                  {replayMeta.compatibility.userNotice}
                  原报告记录值为 {(replayMeta.compatibility.recordedValue * 100).toFixed(2)}%，
                  当前页面口径为 {(replayMeta.compatibility.currentValue * 100).toFixed(2)}%。
                </p>
              )}
            </>
          )}

          {provenance && (
            <div className="analysis-provenance-banner" role="status">
              <ShieldCheck size={15} />
              <div>
                <strong>{narrativeLabel(provenance)}</strong>
                <span>
                  结构化卡片：Real Raise 确定性诊断 · 数字权威：
                  {provenance.calculationAuthority === 'worker-deterministic' ? 'Worker 服务端重算' : '浏览器本地算表'}
                  {' · '}公式 {provenance.calculationVersion}
                  {' · '}归因 {provenance.attribution}
                  {provenance.cached ? ' · 已命中相同输入缓存' : ''}
                </span>
              </div>
            </div>
          )}

          {provenance && (
            <AnalysisContextSummary provenance={provenance} requestPayload={requestPayload} />
          )}

          <div className="insight-text-content">
            <SimpleMarkdownRenderer content={insightText || ''} />
          </div>

          {structuredInsight && (
            <div className="structured-analysis-container">
              {/* 区块 1：成本压力来源图（默认展开：最有行动价值） */}
              <AnalysisBlock
                icon={<PieChart size={17} />}
                title="主要成本压力来源"
                subtitle="月开支增减贡献分析（元/月）"
                defaultOpen
              >
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
              </AnalysisBlock>

              {/* 区块 2：我和城市基准的差异 */}
              <AnalysisBlock
                icon={<TrendingUp size={17} />}
                title="我和城市基准的差异"
                subtitle="个人增速 vs 城镇宏观指标对比"
              >
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
                    <span className="bm-sub">{requestPayload.cityContext.period} 官方 CPI 基准</span>
                  </div>
                </div>

                {structuredInsight.trend && (
                  <div className="trend-sub-block">
                    <div className="trend-header">
                      <LineChart size={15} /> 2021–2025 官方年度基准与个人趋势
                    </div>
                    {/* 同样的年份跨三条序列，表格比一排排徽章短得多也好比对。 */}
                    <div className="trend-table-wrap">
                      <table className="trend-table">
                        <thead>
                          <tr>
                            <th scope="col">指标</th>
                            {structuredInsight.trend.periods.map((period) => (
                              <th scope="col" key={period}>{period}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {structuredInsight.trend.series.map((series) => (
                            <tr key={series.id}>
                              <th scope="row">{series.label}</th>
                              {series.values.map((value, idx) => (
                                <td key={idx} className={value === null ? 'is-missing' : ''}>
                                  {value === null ? '—' : `${(value * 100).toFixed(1)}%`}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="trend-missing-note">
                      「—」表示没有这一年的数据：你没有提供个人历史收入，本项目不插值、不拿宏观平均冒充个人值。
                    </p>
                  </div>
                )}

                <p className="bm-caveat">{structuredInsight.benchmark.caveat}</p>
              </AnalysisBlock>

              {/* 区块 3：可调整的情景选择 */}
              <AnalysisBlock
                icon={<Compass size={17} />}
                title="可调整的情景选择"
                subtitle="基于个人算表与数据源推演的情景建议"
              >
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
              </AnalysisBlock>

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
                    <p className="artifact-subtitle">
                      {provenance?.narrativeSource === 'infinisynapse-replay'
                        ? '平台历史正文与 Real Raise 确定性诊断分层展示；回放口径见执行证明'
                        : provenance?.narrativeSource === 'infinisynapse-live'
                        ? '平台实时正文 + Real Raise 确定性数字凭证；两类来源不会混称'
                        : 'Real Raise 本地模板与确定性算表导出的演示凭证'}
                    </p>
                  </div>
                  <span className="artifact-badge">REAL_RAISE_REPORT.md</span>
                </div>
                <div className="artifact-card-body">
                  {/* 预览只是给想核对的人看的，默认收起省版面。 */}
                  <details className="artifact-preview-details">
                    <summary>查看报告头信息</summary>
                    <div className="artifact-preview-box">
                      <pre><code>{`# REAL RAISE 购买力与消费诊断报告
任务ID: ${taskId || 'mock-task-1'}
--------------------------------------------------
- 状态: 已完成 (Completed)
- 产物文件: explanation.md / driver-ranking.csv / scenario-matrix.csv / share-summary.md / evidence.csv / analysis-manifest.json
- 数据底座: 本地确定性算表 + 2026H1 官方 CPI
- 权威原则: AI 解读不覆盖本地数字卡片金额
`}</code></pre>
                    </div>
                  </details>
                  <div className="artifact-actions">
                    <button
                      type="button"
                      className="btn-artifact-dl"
                      onClick={() => handleDownloadArtifact('explanation.md')}
                    >
                      <Download size={13} />
                      {replayMeta ? '下载历史平台报告原文' : '下载报告凭证'} (explanation.md)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('evidence.csv')}
                    >
                      <Download size={13} /> 下载计算数据 (evidence.csv)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('analysis-manifest.json')}
                    >
                      <Download size={13} /> 下载当前执行清单 (analysis-manifest.json)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('driver-ranking.csv')}
                    >
                      <Download size={13} /> 下载驱动因素排名 (driver-ranking.csv)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('scenario-matrix.csv')}
                    >
                      <Download size={13} /> 下载情景矩阵 (scenario-matrix.csv)
                    </button>
                    <button
                      type="button"
                      className="btn-artifact-dl secondary-dl"
                      onClick={() => handleDownloadArtifact('share-summary.md')}
                    >
                      <Download size={13} /> 下载分享摘要 (share-summary.md)
                    </button>
                    {replayMeta && (
                      <>
                        <button
                          type="button"
                          className="btn-artifact-dl secondary-dl"
                          onClick={() => handleDownloadArtifact('vendor-original-evidence.csv')}
                        >
                          <Download size={13} /> 下载历史供应商证据原件
                        </button>
                        <button
                          type="button"
                          className="btn-artifact-dl secondary-dl"
                          onClick={() => handleDownloadArtifact('vendor-original-analysis-manifest.json')}
                        >
                          <Download size={13} /> 下载历史供应商清单原件
                        </button>
                      </>
                    )}
                  </div>
                  {downloadError && <p className="download-error-text">{downloadError}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="insight-action-footer">
            <span className="footnote-text">数据来源：权威公开统计数据库 & 本地精准算表</span>
            <div className="footer-actions">
              <button
                className="btn-reanalyze btn-replay-mode"
                onClick={() => handleStartInsight(undefined, 'replay')}
                disabled={isStarting || Boolean(analysisValidationMessage)}
                type="button"
              >
                <BookOpen size={13} /> 查看真实任务回放
              </button>
              <button
                className="btn-reanalyze"
                onClick={() => handleStartInsight()}
                disabled={isStarting || Boolean(analysisValidationMessage)}
                type="button"
              >
                <RefreshCw size={13} /> {reportUsesPreviousInputs ? '按最新输入重新分析' : '重新分析'}
              </button>
            </div>
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
          {serverLiveConfigured && <PartnerSsoPanel />}
          <button
            className="btn-retry"
            onClick={() => handleStartInsight(false)}
            disabled={isStarting || Boolean(analysisValidationMessage)}
            type="button"
          >
            <RefreshCw size={14} /> 重新尝试
          </button>
        </div>
      ) : status === 'cancelled' ? (
        <div className="insight-body cancelled-state">
          <p className="cancelled-note">任务已取消。您的本地输入与精准计算数字已被完整保留。</p>
          {serverLiveConfigured && <PartnerSsoPanel />}
          <button
            className="btn-restart"
            onClick={() => handleStartInsight()}
            disabled={isStarting || Boolean(analysisValidationMessage)}
            type="button"
          >
            <Sparkles size={14} /> 重新生成解读
          </button>
        </div>
      ) : null}
    </div>
  )
}
