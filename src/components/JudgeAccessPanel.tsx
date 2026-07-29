import React from 'react'
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'

interface JudgeAccessPanelProps {
  unlocked: boolean
  onChange: (unlocked: boolean) => void
}

export const JudgeAccessPanel: React.FC<JudgeAccessPanelProps> = ({ unlocked, onChange }) => {
  const handleLock = () => {
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
            评委点击下方按钮后，真实分析会由服务端使用项目 Key 发起。
          </p>
          <button type="button" onClick={() => onChange(true)}>
            进入评委模式
          </button>
        </>
      )}
    </div>
  )
}
