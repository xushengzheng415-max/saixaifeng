'use strict'

const fs = require('fs')
const crypto = require('crypto')

const envPath = process.env.SXF_BRIDGE_ENV_FILE || '/etc/sxf-wechat-football-bridge.env'
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
  const position = line.indexOf('=')
  return [line.slice(0, position), line.slice(position + 1)]
}))
const body = '{}'
const timestamp = Date.now()
const nonce = crypto.randomBytes(16).toString('hex')
const signature = crypto.createHmac('sha256', env.SXF_BRIDGE_SHARED_SECRET || '')
  .update(`${timestamp}\n${nonce}\n${body}`)
  .digest('hex')

fetch('https://api.saixiaofeng.com/wechat/football/v1/probe', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-sxf-timestamp': String(timestamp),
    'x-sxf-nonce': nonce,
    'x-sxf-signature': signature
  },
  body
}).then(async response => {
  const result = await response.text()
  console.log(`HTTP ${response.status}`)
  console.log(result)
  process.exit(response.ok ? 0 : 1)
}).catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
