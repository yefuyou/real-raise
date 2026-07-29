import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditReplayPack,
  buildManifestEntry,
  REPLAY_MANIFEST_VERSION,
  stableStringify,
} from './replayAudit.mjs'

const replaysDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'replays')
const errors = []
const packs = new Map()

for (const file of fs.readdirSync(replaysDir).sort()) {
  if (!file.endsWith('.json') || file === 'manifest.json') continue
  const pack = JSON.parse(fs.readFileSync(path.join(replaysDir, file), 'utf8'))
  packs.set(file, pack)
  errors.push(...auditReplayPack(pack, file))
}

const manifest = JSON.parse(fs.readFileSync(path.join(replaysDir, 'manifest.json'), 'utf8'))
if (manifest.schemaVersion !== REPLAY_MANIFEST_VERSION) {
  errors.push(`manifest.json: schemaVersion 必须为 ${REPLAY_MANIFEST_VERSION}`)
}
if (manifest.replays?.length !== packs.size) {
  errors.push(`manifest.json: 登记 ${manifest.replays?.length ?? 0} 个，磁盘实际 ${packs.size} 个`)
}
for (const entry of manifest.replays ?? []) {
  const pack = packs.get(entry.file)
  if (!pack) {
    errors.push(`manifest.json: ${entry.file} 不存在`)
    continue
  }
  for (const field of ['scenarioId', 'signature', 'vendorTaskId', 'recordedAt']) {
    if (entry[field] !== pack[field]) errors.push(`manifest.json: ${entry.file} 的 ${field} 与回放包不一致`)
  }
  const expectedEntry = buildManifestEntry(pack, entry.file)
  if (stableStringify(entry) !== stableStringify(expectedEntry)) {
    errors.push(`manifest.json: ${entry.file} 与经审计回放包生成的登记信息不一致`)
  }
}
const signatures = (manifest.replays ?? []).map((entry) => entry.signature)
if (new Set(signatures).size !== signatures.length) errors.push('manifest.json: 回放签名不得重复')

if (errors.length) {
  console.error(`回放审计失败（${errors.length} 项）：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(`回放审计通过：${packs.size} 个 replay.v2 包的签名、双请求、供应商原件哈希与语义口径一致。`)
