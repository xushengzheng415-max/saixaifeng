'use strict'

const fs = require('fs')

const targetPath = process.argv[2]
if (!targetPath) throw new Error('usage: node rotate-callback-env.js <env-file>')

const chunks = []
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  const encoded = chunks.join('').trim()
  const updates = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  const callbackToken = String(updates.WECOM_CALLBACK_TOKEN || '').trim()
  const encodingAesKey = String(updates.WECOM_ENCODING_AES_KEY || '').trim()
  if (!/^[A-Za-z0-9]{1,32}$/.test(callbackToken)) throw new Error('invalid_callback_token')
  if (!/^[A-Za-z0-9+/]{43}$/.test(encodingAesKey)) throw new Error('invalid_encoding_aes_key')

  const stat = fs.statSync(targetPath)
  const replacements = { WECOM_CALLBACK_TOKEN: callbackToken, WECOM_ENCODING_AES_KEY: encodingAesKey }
  const seen = new Set()
  const lines = fs.readFileSync(targetPath, 'utf8').split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/)
    if (!match || !Object.prototype.hasOwnProperty.call(replacements, match[1])) return line
    seen.add(match[1])
    return `${match[1]}=${replacements[match[1]]}`
  })
  for (const [key, value] of Object.entries(replacements)) if (!seen.has(key)) lines.push(`${key}=${value}`)
  const temporaryPath = `${targetPath}.tmp-${process.pid}`
  fs.writeFileSync(temporaryPath, `${lines.filter((line, index) => line || index < lines.length - 1).join('\n')}\n`, { mode: stat.mode })
  fs.chownSync(temporaryPath, stat.uid, stat.gid)
  fs.renameSync(temporaryPath, targetPath)
  console.log(JSON.stringify({ updatedKeys: Object.keys(replacements).sort() }))
})
