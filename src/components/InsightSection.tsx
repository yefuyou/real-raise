import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  StopCircle,
  Zap,
} from 'lucide-react'
import { apiClient } from '../api/apiClient'
import type {
  AgentTaskStatus,
  SourceReference,
  StartAnalysisRequest,
} from '../api/realRaiseContract'

interface InsightSectionProps {
  requestPayload: StartAnalysisRequest
  onOpenSources: (sources: SourceReference[]) => void
  remoteFeatureEnabled?: boolean
}

export const InsightSection: React.FC<InsightSectionProps> = ({
  requestPayload,
  onOpenSources,
  remoteFeatureEnabled = true,
}) => {
  const [status, setStatus] = useState<AgentTaskStatus | 'idle'>('idle')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [stage, setStage] = useState<string>('等待生成...')
  const [stageMessage, setStageMessage] = useState<string>('')
  const [percent, setPercent] = useState<number>(0)
  const [insightText, setInsightText] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceReference[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null)

  // Restore existing session task ID if available
  useEffect(() => {
    const savedTaskId = localStorage.getItem('real_raise_active_task')
    if (savedTaskId) {
      setTaskId(savedTaskId)
    }
  }, [])

  // Cleanup active listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [unsubscribe])

  const handleStartInsight = async () => {
    if (!remoteFeatureEnabled) return

    if (unsubscribe) {
      unsubscribe()
      setUnsubscribe(null)
    }

    setStatus('queued')
    setStage('正在创建生活解读任务...')
    setStageMessage('准备提交参数至后台分析层...')
    setPercent(10)
    setErrorMessage(null)
    setInsightText(null)

    try {
      const response = await apiClient.startAnalysis(requestPayload)
      const newTaskId = response.taskId
      setTaskId(newTaskId)
      localStorage.setItem('real_raise_active_task', newTaskId)
      setStatus(response.status)

      // Subscribe to real-time events
      const cleanup = apiClient.subscribeTaskEvents(newTaskId, requestPayload, (evt) => {
        if (evt.type === 'started') {
          setStatus('running')
          setStage('已连接分析引擎')
          setPercent(20)
        } else if (evt.type === 'progress') {
          setStatus('running')
          setStage(evt.stage)
          setStageMessage(evt.message)
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

  return (
    <div className={`insight-card-wrapper status-${status}`}>
      <div className="insight-card-header">
        <div className="insight-title-group">
            <span className="insight-badge">
              <Sparkles size={16} /> AI 生活解读
          </span>
          <span className="insight-subtitle">
            结合宏观统计数据 & 确定性算表
          </span>
        </div>

        {remoteFeatureEnabled && (status === 'queued' || status === 'running') && (
          <button className="btn-cancel-task" onClick={handleCancel} type="button">
            <StopCircle size={14} /> 取消任务
          </button>
        )}
      </div>

      {!remoteFeatureEnabled ? (
        <div className="insight-body idle-state">
          <div className="insight-feature-disabled">
            <Zap size={22} className="disabled-icon" />
            <div>
              <h4>远程解读尚未接入</h4>
              <p>当前处于纯本地确定性计算模式。所有数字由本地算法计算，不消耗平台 API 额度。</p>
            </div>
          </div>
        </div>
      ) : status === 'idle' ? (
        <div className="insight-body idle-state">
          <div className="insight-prompt-box">
            <p>
              除了基础数字对比，您还可以预览一份结合 2025 年全国 CPI 与城镇消费结构基准的生活解读。
            </p>
            <button className="btn-generate-insight" onClick={handleStartInsight} type="button">
              <Sparkles size={16} /> 生成本地解读预览
            </button>
          </div>
        </div>
      ) : status === 'queued' || status === 'running' ? (
        <div className="insight-body progress-state">
          <div className="progress-status-row">
            <span className="progress-stage-title">
              <Loader2 size={16} className="spinner" /> {stage}
            </span>
            <span className="progress-percentage">{percent}%</span>
          </div>

          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>

          {stageMessage && <p className="progress-message">{stageMessage}</p>}
        </div>
      ) : status === 'completed' ? (
        <div className="insight-body completed-state">
          <div className="insight-result-header">
              <span className="success-tag">
              <CheckCircle2 size={14} /> 生活解读预览已生成
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
            {insightText?.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          <div className="insight-action-footer">
            <span className="footnote-text">数据来源：权威公开统计数据库 & 本地精准算表</span>
            <button className="btn-reanalyze" onClick={handleStartInsight} type="button">
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
          <button className="btn-retry" onClick={handleStartInsight} type="button">
            <RefreshCw size={14} /> 重新尝试
          </button>
        </div>
      ) : status === 'cancelled' ? (
        <div className="insight-body cancelled-state">
          <p className="cancelled-note">任务已取消。您的本地输入与精准计算数字已被完整保留。</p>
          <button className="btn-restart" onClick={handleStartInsight} type="button">
            <Sparkles size={14} /> 重新生成解读
          </button>
        </div>
      ) : null}
    </div>
  )
}
