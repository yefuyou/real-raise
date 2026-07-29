import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditReplayPack,
  buildManifestEntry,
  REPLAY_MANIFEST_VERSION,
} from './replayAudit.mjs'

/**
 * 扫描 public/replays/*.json（回放包由前端 dev「导出回放包」按钮生成），
 * 生成 manifest.json 供纯静态站在运行时匹配"当前输入 ↔ 存档"。
 * 用法：npm run replays:manifest
 */

const replaysDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'replays',
)

if (!fs.existsSync(replaysDir)) {
  fs.mkdirSync(replaysDir, { recursive: true })
}

const replays = []
for (const file of fs.readdirSync(replaysDir).sort()) {
  if (!file.endsWith('.json') || file === 'manifest.json') continue
  const raw = JSON.parse(fs.readFileSync(path.join(replaysDir, file), 'utf8'))
  const errors = auditReplayPack(raw, file)
  if (errors.length) throw new Error(`拒绝生成包含不可信回放的 manifest：\n${errors.join('\n')}`)
  replays.push(buildManifestEntry(raw, file))
}

const duplicated = replays.filter(
  (entry, index) => replays.findIndex((item) => item.signature === entry.signature) !== index,
)
for (const entry of duplicated) {
  console.warn(`警告：${entry.file} 与更早的存档输入签名相同，运行时只会命中前者。`)
}

fs.writeFileSync(
  path.join(replaysDir, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: REPLAY_MANIFEST_VERSION, replays }, null, 2)}\n`,
)
console.log(`manifest.json 已生成：${replays.length} 个回放包。`)
