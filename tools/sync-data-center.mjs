import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root,'cloudfunctions/dataCenter/shared')
const consumers = ['getMiniWorkspace','webLoginApi','resultCenter','updateMatch','serviceMatchWorkflow']
const files = ['reader.cjs','statistics.mjs','service.cjs','support.cjs','standings.cjs','playing-time.mjs','membership.cjs','write-policy.cjs','substitution.mjs']
const check = process.argv.includes('--check')
let mismatch = false
for (const consumer of consumers) {
  const destination = path.join(root,'cloudfunctions',consumer,'data-center')
  if (!check) await fs.mkdir(destination,{ recursive:true })
  for (const file of files) {
    const original = await fs.readFile(path.join(source,file))
    if (check) {
      const copy = await fs.readFile(path.join(destination,file)).catch(() => null)
      if (!copy || !original.equals(copy)) { console.error(`数据中心共享模块未同步：${consumer}/${file}`); mismatch = true }
    } else await fs.writeFile(path.join(destination,file),original)
  }
}
if (mismatch) process.exitCode = 1
else console.log(check ? 'PASS: 数据中心部署副本一致' : '数据中心共享模块已同步')
