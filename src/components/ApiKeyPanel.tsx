import React, { useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, Sliders, Trash2 } from 'lucide-react'
import { clearApiKey, loadApiKey, maskApiKey, saveApiKey } from '../api/apiKeyStore'
import type { AnalysisModel } from '../api/realRaiseContract'

interface ApiKeyPanelProps {
  /** Key 变化时通知外层切换"真实分析 / 演示模式"。 */
  onChange: (hasKey: boolean) => void
  selectedModel?: AnalysisModel | ''
  onModelChange?: (model: AnalysisModel | '') => void
}

/**
 * 用户自带 API Key 的输入区。
 *
 * 本项目不保管任何密钥：Key 只写进访问者自己浏览器的 localStorage，
 * 请求由浏览器直接发往分析平台，不经过本项目的服务器。
 */
export const ApiKeyPanel: React.FC<ApiKeyPanelProps> = ({
  onChange,
  selectedModel = '',
  onModelChange,
}) => {
  const [storedKey, setStoredKey] = useState<string>(() => loadApiKey())
  const [draft, setDraft] = useState<string>('')
  const [isEditing, setIsEditing] = useState<boolean>(() => loadApiKey().length === 0)
  const [isRevealed, setIsRevealed] = useState<boolean>(false)
  const [notice, setNotice] = useState<string>('')

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setNotice('请先填写 API Key。')
      return
    }
    saveApiKey(trimmed)
    setStoredKey(trimmed)
    setDraft('')
    setIsRevealed(false)
    setIsEditing(false)
    setNotice('已保存到本机浏览器，现在会使用真实分析。')
    onChange(true)
  }

  const handleClear = () => {
    clearApiKey()
    setStoredKey('')
    setDraft('')
    setIsRevealed(false)
    setIsEditing(true)
    setNotice('已清除本机保存的 Key，已切回演示模式。')
    onChange(false)
  }

  return (
    <div className="api-key-panel">
      <div className="api-key-head">
        <span className="api-key-title">
          <KeyRound size={14} /> 分析平台 API Key
        </span>
        <span className={`api-key-mode ${storedKey ? 'live' : 'demo'}`}>
          {storedKey ? '真实分析模式' : '演示模式'}
        </span>
      </div>

      {storedKey && !isEditing ? (
        <div className="api-key-saved">
          <code className="api-key-mask">{maskApiKey(storedKey)}</code>
          <div className="api-key-saved-actions">
            <button type="button" className="api-key-btn ghost" onClick={() => setIsEditing(true)}>
              更换
            </button>
            <button type="button" className="api-key-btn danger" onClick={handleClear}>
              <Trash2 size={13} /> 清除
            </button>
          </div>
        </div>
      ) : (
        <div className="api-key-form">
          <div className="api-key-input-wrap">
            <input
              className="api-key-input"
              type={isRevealed ? 'text' : 'password'}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSave()
                }
              }}
              placeholder="粘贴你自己的 API Key"
              autoComplete="off"
              spellCheck={false}
              aria-label="分析平台 API Key"
            />
            <button
              type="button"
              className="api-key-reveal"
              onClick={() => setIsRevealed((value) => !value)}
              aria-label={isRevealed ? '隐藏 Key' : '显示 Key'}
            >
              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="api-key-form-actions">
            <button type="button" className="api-key-btn primary" onClick={handleSave}>
              保存并启用
            </button>
            {storedKey && (
              <button
                type="button"
                className="api-key-btn ghost"
                onClick={() => {
                  setDraft('')
                  setIsRevealed(false)
                  setIsEditing(false)
                  setNotice('')
                }}
              >
                取消
              </button>
            )}
          </div>
        </div>
      )}

      <div className="api-key-model-row">
        <label className="api-key-model-label" htmlFor="api-key-model-select">
          <Sliders size={13} /> 分析模型
        </label>
        <select
          id="api-key-model-select"
          className="api-key-model-select"
          value={selectedModel}
          onChange={(event) => {
            const model = event.target.value
            if (model === '' || model === 'deepseek-v4-flash' || model === 'deepseek-v4-pro') {
              onModelChange?.(model)
            }
          }}
          aria-label="选择分析模型"
        >
          <option value="">跟随平台默认</option>
          <option value="deepseek-v4-flash">Flash 省额度 (deepseek-v4-flash)</option>
          <option value="deepseek-v4-pro">Pro 高质量 (deepseek-v4-pro)</option>
        </select>
      </div>

      {!storedKey && (
        <div className="api-key-guide">
          <p className="api-key-guide-title">评委 / 访客指引</p>
          <p>本应用为纯静态站，无自有服务器。</p>
          <ol className="api-key-guide-list">
            <li>
              <strong>不填 Key</strong>：可查看真实 InfiniSynapse 任务的存档回放，任务 ID 可在平台后台核验。
            </li>
            <li>
              <strong>填入你的平台 API Key</strong>：实时重跑完整链路，Key 仅保存在你的浏览器本地。
              新用户注册平台即赠积分，足够体验。
            </li>
          </ol>
        </div>
      )}

      <p className="api-key-hint">
        <ShieldCheck size={12} /> Key 只保存在你自己浏览器的本地存储里，由浏览器直接请求分析平台，
        本项目不会收集或转发任何人的密钥。
      </p>
      {notice && <p className="api-key-notice" role="status">{notice}</p>}
    </div>
  )
}
