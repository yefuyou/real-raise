import React, { useEffect, useState } from 'react'
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import { clearJudgeAccess, hasJudgeAccess, unlockJudgeAccess } from '../api/judgeAccessClient'

interface JudgeAccessPanelProps {
  unlocked: boolean
  onChange: (unlocked: boolean) => void
}

export const JudgeAccessPanel: React.FC<JudgeAccessPanelProps> = ({ unlocked, onChange }) => {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onChange(hasJudgeAccess())
    // 只在面板首次挂载时从当前浏览器会话恢复签名评委令牌。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUnlock = async () => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await unlockJudgeAccess(code)
      setCode('')
      onChange(true)
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : '评委验证失败，请重试。')
      onChange(false)
    } finally {
      setPending(false)
    }
  }

  const handleLock = () => {
    clearJudgeAccess()
    setError(null)
    onChange(false)
  }

  return (
    <div className={`judge-access-panel ${unlocked ? 'is-unlocked' : ''}`}>
      <div className="judge-access-head">
        <span className="judge-access-title">
          {unlocked ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
          评委专属实时模式
        </span>
        <span className={`judge-access-status ${unlocked ? 'live' : 'locked'}`}>
          {unlocked ? '已开启' : '仅限评委'}
        </span>
      </div>

      {unlocked ? (
        <div className="judge-access-unlocked">
          <p>评委模式已开启。项目凭证保存在服务端，浏览器不会接触或保存。</p>
          <button type="button" className="judge-access-exit" onClick={handleLock}>
            <LogOut size={13} /> 退出评委模式
          </button>
        </div>
      ) : (
        <>
          <p className="judge-access-copy">
            输入评委口令后，服务端才会签发一次性短期会话；项目凭证不会下发到浏览器。
          </p>
          <div className="judge-access-form">
            <label className="judge-access-input-wrap">
              <span className="sr-only">评委口令</span>
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleUnlock()
                }}
                placeholder="输入评委口令"
                autoComplete="off"
                disabled={pending}
              />
            </label>
            <button type="button" onClick={() => void handleUnlock()} disabled={pending || !code.trim()}>
              {pending ? '验证中…' : '验证并进入'}
            </button>
          </div>
          {error && <p className="judge-access-notice" role="alert">{error}</p>}
        </>
      )}
    </div>
  )
}
