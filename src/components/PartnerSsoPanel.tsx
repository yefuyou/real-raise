import React, { useEffect, useState } from 'react'
import { CheckCircle2, LogIn, LogOut, ShieldCheck, User } from 'lucide-react'
import { authClient, formatFriendlyAuthErrorMessage, type AuthState } from '../api/authClient'

interface PartnerSsoPanelProps {
  className?: string
}

export const PartnerSsoPanel: React.FC<PartnerSsoPanelProps> = ({ className = '' }) => {
  const [authState, setAuthState] = useState<AuthState>(() => authClient.getState())
  const [avatarError, setAvatarError] = useState(false)

  useEffect(() => {
    const unsubscribe = authClient.subscribe((state) => {
      setAuthState(state)
      setAvatarError(false)
    })
    void authClient.checkAuth()
    return unsubscribe
  }, [])

  const { authenticated, user, loading, error, errorCode } = authState

  const displayName = user?.nickname || user?.name || 'Infini 用户'
  const initialLetter = displayName.trim().charAt(0).toUpperCase() || 'U'
  const avatarUrl = user?.avatarUrl || user?.avatar

  return (
    <div className={`partner-sso-panel ${className}`}>
      {loading ? (
        <div className="sso-loading-box">
          <span className="sso-loading-dot" /> 正在检查账户认证状态...
        </div>
      ) : authenticated && user ? (
        <div className="sso-authenticated-box">
          <div className="sso-user-info">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="sso-avatar-img"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="sso-avatar-fallback" title={displayName}>
                {initialLetter || <User size={14} />}
              </div>
            )}
            <div className="sso-user-text">
              <div className="sso-user-name-row">
                <span className="sso-nickname">{displayName}</span>
                <span className="sso-connected-badge">
                  <CheckCircle2 size={12} /> 已连接
                </span>
              </div>
              <span className="sso-hint-text">由 InfiniSynapse Partner SSO 认证代理</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-sso-logout"
            onClick={() => void authClient.logout()}
            title="退出 InfiniSynapse 账号"
          >
            <LogOut size={13} /> 退出登录
          </button>
        </div>
      ) : (
        <div className="sso-unauthenticated-box">
          <div className="sso-unauth-header">
            <span className="sso-title">
              <LogIn size={15} /> InfiniSynapse 账号登录
            </span>
            <span className="sso-badge-free">支持个人积分</span>
          </div>

          <p className="sso-description">
            使用您自己的 InfiniSynapse 平台积分生成定制 AI 深度解读，密钥由服务端安全保管，浏览器端永远不暴露 Partner API Key。
          </p>

          <div className="sso-action-row">
            <button
              type="button"
              className="btn-sso-login"
              onClick={() => authClient.login()}
            >
              <LogIn size={15} /> 使用 InfiniSynapse 登录并生成深度报告
            </button>
          </div>

          <p className="sso-footer-hint">
            <ShieldCheck size={12} /> 未登录状态下仍可继续使用本地确定性算表、存档回放与 Mock 演示。
          </p>
        </div>
      )}

      {(error || errorCode) && (
        <div className="sso-error-banner" role="alert">
          <span>{formatFriendlyAuthErrorMessage(errorCode, error)}</span>
        </div>
      )}
    </div>
  )
}
