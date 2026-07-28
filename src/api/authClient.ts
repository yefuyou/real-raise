/**
 * InfiniSynapse Partner SSO 前端认证客户端.
 *
 * 官方契约：
 * - GET /api/auth/me : 获取当前登录用户信息
 * - GET /api/auth/infini/start : 302 跳转发起 SSO 登录
 * - POST /api/auth/logout : 退出当前会话
 *
 * 安全原则：
 * - 客户端永远不接触、不存储、不暴露 Partner API Key 与 SESSION_SECRET。
 * - 支持 Mock 模式用于单机无后端环境与测试断言。
 */

declare const __REAL_RAISE_ANALYSIS_API_URL__: string | undefined

const configuredApiUrl = typeof __REAL_RAISE_ANALYSIS_API_URL__ === 'string'
  ? __REAL_RAISE_ANALYSIS_API_URL__
  : ''
const API_BASE_URL = configuredApiUrl.trim().replace(/\/+$/, '')

export type AuthUser = {
  id: string
  name?: string
  nickname?: string
  avatar?: string
  avatarUrl?: string
}

export type AuthState = {
  authenticated: boolean
  user: AuthUser | null
  loading: boolean
  canRunAnalysis?: boolean
  error?: string | null
  errorCode?: string | null
}

export class AuthClient {
  private state: AuthState = {
    authenticated: false,
    user: null,
    canRunAnalysis: false,
    loading: true,
    error: null,
    errorCode: null,
  }

  private listeners = new Set<(state: AuthState) => void>()
  private useMock: boolean = false

  constructor(options: { useMock?: boolean } = {}) {
    this.useMock = options.useMock ?? false
  }

  public setUseMock(useMock: boolean) {
    this.useMock = useMock
  }

  public getState(): AuthState {
    return this.state
  }

  public subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setState(next: Partial<AuthState>) {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  /**
   * 初始化 / 刷新用户认证状态
   */
  public async checkAuth(): Promise<AuthState> {
    if (this.useMock) {
      this.setState({ loading: false })
      return this.state
    }

    this.setState({ loading: true, error: null, errorCode: null })

    // 检查 URL 中的错误回调参数（例如用户取消授权或服务端未配置 SSO）
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        const errorParam = urlParams.get('auth_error') || urlParams.get('error')
        if (errorParam) {
          const code = errorParam.toUpperCase()
          this.setState({
            errorCode: code,
            error: formatFriendlyAuthErrorMessage(code),
          })
        }
      }
    } catch {
      // ignore URL parsing errors
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data && data.authenticated && data.user) {
          const user: AuthUser = {
            id: String(data.user.id || 'user'),
            name: data.user.name,
            nickname: data.user.nickname || data.user.name || 'Infini 用户',
            avatar: data.user.avatar || data.user.avatarUrl,
            avatarUrl: data.user.avatarUrl || data.user.avatar,
          }
          this.setState({
            authenticated: true,
            user,
            canRunAnalysis: typeof data.canRunAnalysis === 'boolean' ? data.canRunAnalysis : true,
            loading: false,
          })
          return this.state
        }
      }
      this.setState({
        authenticated: false,
        user: null,
        canRunAnalysis: false,
        loading: false,
      })
      return this.state
    } catch {
      // HTTP 访问失败或后端接口尚未就绪，优雅降级为未登录状态，不中断本地算表
      this.setState({
        authenticated: false,
        user: null,
        canRunAnalysis: false,
        loading: false,
      })
      return this.state
    }
  }

  /**
   * 发起 InfiniSynapse Partner SSO 登录（重定向）
   */
  public login(): void {
    if (typeof window !== 'undefined') {
      window.location.href = `${API_BASE_URL}/api/auth/infini/start`
    }
  }

  /**
   * 退出登录
   */
  public async logout(): Promise<void> {
    if (this.useMock) {
      this.setState({ authenticated: false, user: null, canRunAnalysis: false, loading: false })
      return
    }

    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
    } catch {
      // ignore
    } finally {
      this.setState({
        authenticated: false,
        user: null,
        canRunAnalysis: false,
        loading: false,
        error: null,
        errorCode: null,
      })
    }
  }

  /**
   * Mock 状态设置（测试与演示用）
   */
  public setMockUser(user: AuthUser | null, canRunAnalysis: boolean = true) {
    if (user) {
      this.setState({
        authenticated: true,
        user: {
          id: user.id,
          nickname: user.nickname || user.name || 'Mock 用户',
          name: user.name,
          avatar: user.avatar || user.avatarUrl,
          avatarUrl: user.avatarUrl || user.avatar,
        },
        canRunAnalysis,
        loading: false,
        error: null,
        errorCode: null,
      })
    } else {
      this.setState({
        authenticated: false,
        user: null,
        canRunAnalysis: false,
        loading: false,
        error: null,
        errorCode: null,
      })
    }
  }
}

export function formatFriendlyAuthErrorMessage(code?: string | null, rawMessage?: string | null): string {
  if (!code && !rawMessage) return '服务响应异常，请稍后重试。'
  const normalizedCode = (code || '').toUpperCase().trim()
  const normalizedMsg = (rawMessage || '').toLowerCase()

  if (normalizedCode === 'SSO_NOT_CONFIGURED' || normalizedMsg.includes('sso_not_configured')) {
    return '服务端尚未配置 InfiniSynapse Partner SSO 接入参数，请稍后再试。'
  }
  if (normalizedCode === 'AUTH_REQUIRED' || normalizedCode === 'UNAUTHORIZED' || normalizedMsg.includes('auth_required')) {
    return '需要先登录 InfiniSynapse 账号才能发起深度报告生成。'
  }
  if (normalizedCode === 'PARTNER_API_KEY_UNAVAILABLE' || normalizedMsg.includes('partner_api_key_unavailable')) {
    return '服务端 Partner API Key 暂不可用，请稍后重试或联系系统管理员。'
  }
  if (normalizedCode === 'INSUFFICIENT_QUOTA' || normalizedCode === 'QUOTA_EXHAUSTED' || normalizedMsg.includes('quota') || normalizedMsg.includes('额度不足')) {
    return '您的 InfiniSynapse 平台积分额度不足，请先在平台充值积分。'
  }
  if (normalizedCode === 'SESSION_EXPIRED' || normalizedMsg.includes('session_expired')) {
    return '您的登录会话已过期，请重新使用 InfiniSynapse 登录。'
  }
  if (
    normalizedCode === 'LOGIN_CANCELLED' ||
    normalizedCode === 'CANCELLED' ||
    normalizedCode === 'ACCESS_DENIED' ||
    normalizedMsg.includes('cancelled') ||
    normalizedMsg.includes('cancel')
  ) {
    return '登录授权已取消。未登录状态下仍可继续使用本地算表与 Mock 演示。'
  }
  if (normalizedCode === 'SIMULATED_ERROR') {
    return '模拟的网络响应异常，请点击“重新尝试”按钮恢复。'
  }
  if (rawMessage && !rawMessage.includes('Error:') && !rawMessage.includes('at ') && rawMessage.length < 100) {
    return rawMessage
  }
  return '连接分析服务异常，请重试或使用本地算表分析。'
}

export const authClient = new AuthClient()
