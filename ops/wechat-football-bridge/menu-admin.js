'use strict'

const fs = require('fs')
const crypto = require('crypto')

const envPath = process.env.SXF_BRIDGE_ENV_FILE || '/etc/sxf-wechat-football-bridge.env'
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(String.fromCharCode(10)).map(line => {
  const cleanLine = line.endsWith(String.fromCharCode(13)) ? line.slice(0, -1) : line
  if (!cleanLine || cleanLine.trim().startsWith('#')) return ['', '']
  const position = cleanLine.indexOf('=')
  return position > 0 ? [cleanLine.slice(0, position).trim(), cleanLine.slice(position + 1).trim()] : ['', '']
}).filter(entry => entry[0]))
const action = process.argv[2]
const menuPath = process.argv[3]

if (!['create', 'get'].includes(action)) {
  console.error('Usage: node menu-admin.js create <menu.json> | get')
  process.exit(2)
}

let payload = {}
if (action === 'create') {
  if (!menuPath) {
    console.error('Menu JSON path is required')
    process.exit(2)
  }
  payload = { menu: JSON.parse(fs.readFileSync(menuPath, 'utf8')) }
}

const body = JSON.stringify(payload)
const timestamp = Date.now()
const nonce = crypto.randomBytes(16).toString('hex')
const signature = crypto.createHmac('sha256', env.SXF_BRIDGE_SHARED_SECRET || '')
  .update([timestamp, nonce, body].join(String.fromCharCode(10)))
  .digest('hex')

fetch('https://api.saixiaofeng.com/wechat/football/v1/menu/' + action, {
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
  console.log('HTTP ' + response.status)
  console.log(result)
  process.exit(response.ok ? 0 : 1)
}).catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
