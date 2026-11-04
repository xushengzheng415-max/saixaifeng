import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(repo,'platform-admin-vue'), dest = path.join(app,'public/tutorial-ocr')
await fs.mkdir(dest,{recursive:true})
const files = []
async function copy(source, target, provenance) { const bytes = await fs.readFile(path.join(app,'node_modules',source)); await fs.writeFile(path.join(dest,target),bytes); files.push({file:target,source:provenance,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}) }
await copy('tesseract.js/dist/worker.min.js','worker.min.js','tesseract.js@6.0.1')
await copy('qrcode/license','QRCODE-LICENSE','qrcode@1.5.4')
await copy('tesseract.js/LICENSE.md','TESSERACT-LICENSE.md','tesseract.js@6.0.1')
const coreVersion = JSON.parse(await fs.readFile(path.join(app,'node_modules/tesseract.js-core/package.json'),'utf8')).version
for (const file of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','LICENSE']) await copy('tesseract.js-core/'+file,file === 'LICENSE' ? 'CORE-LICENSE' : file,'tesseract.js-core@'+coreVersion)
for (const lang of ['chi_sim','eng']) {
  const target = lang+'.traineddata.gz'; let bytes, source
  for (const branch of ['main','master']) {
    const url = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${branch}/${lang}.traineddata`
    const response = await fetch(url)
    if (response.ok) { bytes = gzipSync(Buffer.from(await response.arrayBuffer())); source = url; break }
  }
  if (!bytes) throw new Error('Cannot download official language data: '+lang)
  await fs.writeFile(path.join(dest,target),bytes); files.push({file:target,source,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
}
const license = await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/LICENSE')
if (!license.ok) throw new Error('Cannot download language-data license')
const licenseBytes = Buffer.from(await license.arrayBuffer()); await fs.writeFile(path.join(dest,'DATA-LICENSE'),licenseBytes)
await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify({purpose:'Local-only tutorial screenshot OCR; original images never leave the browser',files},null,2)+'\n')
console.log('Prepared '+files.length+' self-hosted OCR assets, '+files.reduce((n,f)=>n+f.bytes,0)+' bytes')
