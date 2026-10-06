'use strict'

const fs = require('fs')

const targetPath = process.argv[2]
const updatesRaw = process.argv[3]
if (!targetPath || !updatesRaw) throw new Error('usage: node configure-kf-env.js <env-file> <updates-json>')

const updatesJson = updatesRaw.startsWith('base64:')
  ? Buffer.from(updatesRaw.slice('base64:'.length), 'base64').toString('utf8')
  : updatesRaw
const updates = JSON.parse(updatesJson)
const allowed = new Set([
  'WECOM_KF_ENABLED',
  'WECOM_KF_DRY_RUN',
  'WECOM_KF_SEND_ENABLED',
  'WECOM_KF_ACCOUNT_ROUTES_JSON',
  'WECOM_KF_STATE_PATH',
  'WECOM_KF_WELCOME_RULES_JSON',
  'WECOM_KF_WELCOME_MENUS_JSON',
  'WECOM_KF_TEST_CAPTURE_CODE',
  'WECOM_KF_TEST_ALLOWLIST_PATH'
])
for (const key of Object.keys(updates)) {
  if (!allowed.has(key)) throw new Error(`unsupported_env_key_${key}`)
  if (String(updates[key]).includes('\n') || String(updates[key]).includes('\r')) throw new Error(`invalid_env_value_${key}`)
}

const stat = fs.statSync(targetPath)
const lines = fs.readFileSync(targetPath, 'utf8').split(/\r?\n/)
const written = new Set()
const output = lines.map((line) => {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/)
  if (!match || !Object.prototype.hasOwnProperty.call(updates, match[1])) return line
  written.add(match[1])
  return `${match[1]}=${String(updates[match[1]])}`
})
for (const [key, value] of Object.entries(updates)) {
  if (!written.has(key)) output.push(`${key}=${String(value)}`)
}
const temporaryPath = `${targetPath}.tmp-${process.pid}`
fs.writeFileSync(temporaryPath, `${output.filter((line, index) => line || index < output.length - 1).join('\n')}\n`, { mode: stat.mode })
fs.chownSync(temporaryPath, stat.uid, stat.gid)
fs.renameSync(temporaryPath, targetPath)
console.log(JSON.stringify({ updatedKeys: [...allowed].filter((key) => Object.prototype.hasOwnProperty.call(updates, key)).sort() }))
