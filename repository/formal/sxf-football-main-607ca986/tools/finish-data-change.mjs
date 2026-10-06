import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { synchronize } from './sync-obsidian-data-center.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const command of [
  ['tools/sync-data-center.mjs','--check'],
  ['tools/test-data-center.mjs'],
  ['tools/test-player-card-unified.mjs'],
  ['tools/check-data-governance.mjs']
]) {
  const result = spawnSync(process.execPath,command,{cwd:root,stdio:'inherit'})
  if (result.status !== 0) { process.exitCode = result.status || 1; break }
}
if (!process.exitCode) {
  const result = await synchronize({check:true})
  if (result.status === 'conflict') { console.error('Obsidian 镜像存在手工编辑冲突，请处理后再同步。'); process.exitCode = 1 }
  else if (result.status === 'pending') console.log('规范已更新，等待每日 09:10 定时同步。')
  else console.log('Obsidian 镜像已是最新；本次不额外同步。')
}
