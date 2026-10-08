import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
let count = 0
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file)
    else if (/\.(vue|js|mjs|css|json)$/.test(file)) {
      count++
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (/web-admin-vue|@cloudbase\/js-sdk/.test(match[1])) throw new Error('禁止跨PC工程依赖或浏览器CloudBase SDK：' + file)
      }
    }
  }
}
walk(path.join(root, 'src'))
console.log(`平台独立边界检查通过：${count} 个源码文件`)
