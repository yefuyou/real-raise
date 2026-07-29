declare const __REAL_RAISE_ANALYSIS_API_URL__: string | undefined

const configuredApiUrl = typeof __REAL_RAISE_ANALYSIS_API_URL__ === 'string'
  ? __REAL_RAISE_ANALYSIS_API_URL__
  : ''
const API_BASE_URL = configuredApiUrl.trim().replace(/\/+$/, '')
const STORAGE_KEY = 'real_raise_judge_session'

type JudgeSession = {
  token: string
  expiresAt: number
}

function readSession(): JudgeSession | null {
  if (!API_BASE_URL) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<JudgeSession>
    if (
      typeof parsed.token !== 'string'
      || !parsed.token
      || typeof parsed.expiresAt !== 'number'
      || parsed.expiresAt <= Date.now()
    ) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function loadJudgeAccessToken(): string {
  return readSession()?.token ?? ''
}

export function hasJudgeAccess(): boolean {
  return readSession() !== null
}

export function clearJudgeAccess(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 隐私模式下 sessionStorage 可能不可用；服务端仍会验证令牌。
  }
}

export async function unlockJudgeAccess(code: string): Promise<void> {
  if (!API_BASE_URL) throw new Error('评委服务端尚未配置。')
  const trimmed = code.trim()
  if (!trimmed) throw new Error('请输入评委口令。')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/judge/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed }),
    })
  } catch {
    throw new Error('无法连接评委验证服务，请稍后重试。')
  }

  let body: any = null
  try {
    body = await response.json()
  } catch {
    // 统一在下方转成可读错误。
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || `评委验证失败（HTTP ${response.status}）。`)
  }
  if (typeof body?.token !== 'string' || typeof body?.expiresAt !== 'number') {
    throw new Error('评委验证服务返回了无效会话。')
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: body.token,
      expiresAt: body.expiresAt,
    }))
  } catch {
    throw new Error('浏览器无法保存评委会话，请关闭隐私限制后重试。')
  }
}
