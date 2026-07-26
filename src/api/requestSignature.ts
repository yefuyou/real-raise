import type { StartAnalysisRequest } from './realRaiseContract'

/**
 * 请求的稳定签名。
 *
 * 缓存（同输入不重复扣额度）和回放包匹配（当前输入 === 录制时输入才播放）
 * 都依赖"同一输入得到同一字符串"，所以序列化必须按键排序。
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/** 参与签名的字段与服务端 hashRequest 保持同一组口径。 */
export function requestMaterial(request: StartAnalysisRequest): string {
  return stableStringify({
    input: request.input ?? null,
    calculation: request.calculation ?? null,
    locale: request.locale ?? 'zh-CN',
    inputMode: request.inputMode ?? 'basic',
    incomeInputMode: request.incomeInputMode ?? 'net',
    detailedBreakdown: request.detailedBreakdown ?? null,
    payslipSummary: request.payslipSummary ?? null,
    ...(request.analysisModel ? { analysisModel: request.analysisModel } : {}),
  })
}

/** FNV-1a 64 位（拆两个 32 位算），无依赖且浏览器/Node 结果一致。 */
export function requestSignature(request: StartAnalysisRequest): string {
  const text = requestMaterial(request)
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= code
    h2 = Math.imul(h2, 0x01000197) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}
