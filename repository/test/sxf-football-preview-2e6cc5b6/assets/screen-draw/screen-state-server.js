const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const file = '/var/www/screen/screen-state.json'
const apiUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
function checkSession(token) {
  return new Promise(resolve => {
    const body = JSON.stringify({ action: 'checkLogin', authToken: token })
    const request = https.request(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 }, response => { let data = ''; response.on('data', chunk => { data += chunk }); response.on('end', () => { try { let value = JSON.parse(data); if (typeof value.body === 'string') value = JSON.parse(value.body); resolve(Boolean(value.success && value.loggedIn)) } catch { resolve(false) } }) })
    request.on('error', () => resolve(false)); request.on('timeout', () => { request.destroy(); resolve(false) }); request.write(body); request.end()
  })
}
const server = http.createServer(async (req, res) => {
  console.log(`[screen-state] ${req.method} ${req.url}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  if (req.url.split('?')[0] !== '/state') { res.writeHead(404); return res.end('not found') }
  if (req.method === 'GET') {
    try { res.setHeader('Content-Type', 'application/json'); return res.end(fs.readFileSync(file, 'utf8')) } catch { res.writeHead(500); return res.end('{"error":"state unavailable"}') }
  }
  if (req.method === 'POST') {
    const auth = String(req.headers.authorization || '')
    const authorized = auth.startsWith('Bearer ') && await checkSession(auth.slice(7))
    console.log(`[screen-state] write authorized=${authorized}`)
    if (!authorized) { res.writeHead(401); return res.end('{"success":false,"error":"unauthorized"}') }
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy() })
    req.on('end', () => { try { const state = JSON.parse(body); fs.writeFileSync(file, JSON.stringify(state)); res.setHeader('Content-Type', 'application/json'); res.end('{"success":true}') } catch { res.writeHead(400); res.end('{"success":false}') } })
    return
  }
  res.writeHead(405); res.end()
})
server.listen(4090, '127.0.0.1')
