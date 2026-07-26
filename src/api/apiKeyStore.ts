/**
 * 用户自带 API Key（BYOK）的本地存取。
 *
 * Key 只保存在访问者自己的浏览器里，不上传到本项目的任何服务器，也不写入
 * 构建产物。项目部署为纯静态站点，因此不存在"我们替用户保管密钥"的环节。
 */

const STORAGE_KEY = 'real_raise_vendor_api_key'

function storage(): Storage | null {
  try {
    // Node（测试环境）和隐私模式下 localStorage 可能不存在或抛异常。
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadApiKey(): string {
  try {
    return storage()?.getItem(STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveApiKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) storage()?.setItem(STORAGE_KEY, trimmed)
    else storage()?.removeItem(STORAGE_KEY)
  } catch {
    // 存不进去也不该让页面崩溃，用户本次会话仍可继续使用。
  }
}

export function clearApiKey(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // 忽略：清不掉时页面状态仍会切回演示模式。
  }
}

export function hasApiKey(): boolean {
  return loadApiKey().length > 0
}

/** 只显示首尾几位，用于确认"填的是哪一个 Key"而不暴露完整值。 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}
