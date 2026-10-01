import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root,'cloudfunctions/dataCenter/shared')
const consumers = ['getMiniWorkspace','webLoginApi','resultCenter','updateMatch','serviceMatchWorkflow','playerCardPublishWorker']
const allFiles = ['reader.cjs','statistics.mjs','service.cjs','support.cjs','player-card-snapshot.cjs','standings.cjs','playing-time.mjs','membership.cjs','write-policy.cjs','substitution.mjs']
const requestedFiles = process.argv.filter(arg => arg.startsWith('--file=')).map(arg => arg.slice(7))
if (requestedFiles.some(file => !allFiles.includes(file))) throw new Error('Unknown shared file')
const files = requestedFiles.length ? requestedFiles : allFiles
const check = process.argv.includes('--check')
let mismatch = false
for (const consumer of consumers) {
  const destination = path.join(root,'cloudfunctions',consumer,'data-center')
  if (!check) await fs.mkdir(destination,{ recursive:true })
  const required = ['updateMatch','serviceMatchWorkflow'].includes(consumer) ? files.filter(file => ['playing-time.mjs','substitution.mjs','statistics.mjs','player-card-snapshot.cjs'].includes(file)) : files
  for (const file of required) {
    const original = await fs.readFile(path.join(source,file))
    if (check) {
      const copy = await fs.readFile(path.join(destination,file)).catch(() => null)
      if (!copy || !original.equals(copy)) { console.error(`数据中心共享模块未同步：${consumer}/${file}`); mismatch = true }
    } else await fs.writeFile(path.join(destination,file),original)
  }
}
if (mismatch) process.exitCode = 1
else console.log(check ? 'PASS: 数据中心部署副本一致' : '数据中心共享模块已同步')
