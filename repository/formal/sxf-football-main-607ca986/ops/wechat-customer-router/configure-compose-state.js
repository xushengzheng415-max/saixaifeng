'use strict'

const fs = require('fs')

const targetPath = process.argv[2]
if (!targetPath) throw new Error('usage: node configure-compose-state.js <docker-compose.yml>')
const source = fs.readFileSync(targetPath, 'utf8')
const mount = '      - ./data/wecom-customer-router:/data'
if (source.includes(mount.trim())) {
  console.log(JSON.stringify({ changed: false, reason: 'already_configured' }))
  process.exit(0)
}
const anchor = '      - ./assets/wecom:/assets/wecom:ro'
if (!source.includes(anchor)) throw new Error('wecom_router_volume_anchor_not_found')
const output = source.replace(anchor, `${anchor}\n${mount}`)
const stat = fs.statSync(targetPath)
const temporaryPath = `${targetPath}.tmp-${process.pid}`
fs.writeFileSync(temporaryPath, output, { mode: stat.mode })
fs.chownSync(temporaryPath, stat.uid, stat.gid)
fs.renameSync(temporaryPath, targetPath)
console.log(JSON.stringify({ changed: true, mount: './data/wecom-customer-router:/data' }))
