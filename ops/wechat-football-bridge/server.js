'use strict'

const http = require('http')
const crypto = require('crypto')

const HOST = process.env.SXF_BRIDGE_HOST || '127.0.0.1'
const PORT = Number(process.env.SXF_BRIDGE_PORT || 8789)
const SHARED_SECRET = String(process.env.SXF_BRIDGE_SHARED_SECRET || '')
const APP_ID = String(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPID || '')
const APP_SECRET = String(process.env.SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET || '')
const PREFIX = '/wechat/football/v1'
const MAX_BODY_BYTES = 64 * 1024
const usedNonces = new Map()
let tokenCache = null
let ticketCache = null

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' })
  res.end(body)
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function authenticate(req, rawBody) {
  const timestamp = Number(req.headers['x-sxf-timestamp'])
  const nonce = String(req.headers['x-sxf-nonce'] || '')
  const signature = String(req.headers['x-sxf-signature'] || '').toLowerCase()
  if (!SHARED_SECRET || !Number.isFinite(timestamp) || !nonce || !signature) return false
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false
  const nonceKey = `${timestamp}:${nonce}`
  if (usedNonces.has(nonceKey)) return false
  const expected = crypto.createHmac('sha256', SHARED_SECRET).update(`${timestamp}\n${nonce}\n${rawBody}`).digest('hex')
  if (!safeEqual(signature, expected)) return false
  usedNonces.set(nonceKey, Date.now())
  for (const [key, createdAt] of usedNonces) if (Date.now() - createdAt > 10 * 60 * 1000) usedNonces.delete(key)
  return true
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function wechatJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json()
  if (!response.ok || data.errcode) {
    const error = new Error(data.errmsg || `微信接口请求失败(${data.errcode || response.status})`)
    error.wechatCode = data.errcode || response.status
    throw error
  }
  return data
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 120000) return tokenCache.value
  if (!APP_ID || !APP_SECRET) throw new Error('服务号凭据未配置')
  const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(APP_ID)}&secret=${encodeURIComponent(APP_SECRET)}`)
  tokenCache = { value: data.access_token, expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000 }
  return tokenCache.value
}

function validatedMenu(value) {
  const menu = value && typeof value === 'object' ? value : {}
  if (!Array.isArray(menu.button) || menu.button.length < 1 || menu.button.length > 3) throw new Error('菜单必须包含1至3个一级入口')
  const buttons = menu.button.map(item => {
    const type = String(item && item.type || '').trim()
    const name = String(item && item.name || '').trim()
    const url = String(item && item.url || '').trim()
    if (type !== 'view' || !name || !url) throw new Error('当前只允许名称和链接完整的网页菜单')
    if ([...name].length > 4) throw new Error('一级菜单名称不能超过4个汉字')
    let parsed
    try { parsed = new URL(url) } catch { throw new Error('菜单链接格式无效') }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.sxffootball.cn') throw new Error('菜单只能指向足球正式域名')
    return { type, name, url: parsed.toString() }
  })
  if (new Set(buttons.map(item => item.name)).size !== buttons.length) throw new Error('菜单名称不能重复')
  return { button: buttons }
}

async function handle(action, payload) {
  if (action === 'js-signature') {
    const value = String(payload.url || '')
    let target
    try { target = new URL(value) } catch { throw new Error('网页地址无效') }
    const signable = ['/service-account-h5/valuation-self-test.html', '/service-account-h5/self-register.html']
    if (value.length > 2048 || target.protocol !== 'https:' || target.hostname !== 'www.sxffootball.cn' || !signable.includes(target.pathname) || target.hash) throw new Error('不允许为该网页签名')
    if (!ticketCache || ticketCache.expiresAt <= Date.now() + 120000) {
      const token = await accessToken()
      const ticket = await wechatJson(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(token)}&type=jsapi`)
      ticketCache = { value: ticket.ticket, expiresAt: Date.now() + Math.max(300, Number(ticket.expires_in || 7200) - 300) * 1000 }
    }
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = crypto.createHash('sha1').update(`jsapi_ticket=${ticketCache.value}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${value}`).digest('hex')
    return { success:true, jsConfig:{appId:APP_ID,timestamp,nonceStr,signature} }
  }
  if (action === 'probe') {
    await accessToken()
    return { success: true }
  }
  if (action === 'qrcode') {
    const scene = String(payload.scene || '').trim()
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(scene)) throw new Error('二维码场景参数无效')
    const token = await accessToken()
    const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expire_seconds: 2592000, action_name: 'QR_STR_SCENE', action_info: { scene: { scene_str: scene } } })
    })
    return { success: true, ticket: data.ticket, expireSeconds: Number(data.expire_seconds || 2592000), url: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}` }
  }
  if (action === 'template/send') {
    const token = await accessToken()
    const message = payload && payload.message
    if (!message || !message.touser || !message.template_id || !message.data) throw new Error('模板消息参数不完整')
    const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(message)
    })
    return { success: true, msgid: data.msgid || '' }
  }
  if (action === 'custom/send') {
    const message = payload && payload.message
    if (!message || !message.touser || !message.msgtype) throw new Error('客服消息参数不完整')
    if (message.msgtype === 'miniprogrampage' && !(message.miniprogrampage && message.miniprogrampage.thumb_media_id && message.miniprogrampage.pagepath)) throw new Error('小程序卡片参数不完整')
    const token = await accessToken()
    await wechatJson(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(message)
    })
    return { success: true }
  }
  if (action === 'material/upload') {
    const fileUrl = String(payload.url || '').trim()
    let parsed
    try { parsed = new URL(fileUrl) } catch { throw new Error('素材地址无效') }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.sxffootball.cn') throw new Error('素材地址不在允许域名内')
    const token = await accessToken()
    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error(`素材下载失败(${response.status})`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new Error('素材为空或超过2MB限制')
    const ext = /\.png(?:\?|$)/i.test(fileUrl) ? 'png' : 'jpg'
    const boundary = '----sxfbridge' + crypto.randomBytes(12).toString('hex')
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="material.${ext}"\r\nContent-Type: ${ext === 'png' ? 'image/png' : 'image/jpeg'}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ])
    const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=' + boundary }, body
    })
    return { success: true, mediaId: data.media_id || '', wechatUrl: data.url || '' }
  }
  if (action === 'menu/create') {
    const menu = validatedMenu(payload && payload.menu)
    const token = await accessToken()
    await wechatJson(`https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(menu)
    })
    return { success: true, menu }
  }
  if (action === 'menu/get') {
    const token = await accessToken()
    const data = await wechatJson(`https://api.weixin.qq.com/cgi-bin/menu/get?access_token=${encodeURIComponent(token)}`)
    return { success: true, menu: data.menu || null }
  }
  const error = new Error('不支持的中转动作')
  error.statusCode = 404
  throw error
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === `${PREFIX}/health`) return send(res, 200, { success: true })
  if (req.method !== 'POST' || !req.url.startsWith(`${PREFIX}/`)) return send(res, 404, { success: false, message: 'not found' })
  try {
    const rawBody = await readBody(req)
    if (!authenticate(req, rawBody)) return send(res, 401, { success: false, message: 'unauthorized' })
    const payload = rawBody ? JSON.parse(rawBody) : {}
    const result = await handle(req.url.slice(`${PREFIX}/`.length), payload)
    return send(res, 200, result)
  } catch (error) {
    console.error('[wechat-football-bridge]', error.message || error)
    return send(res, error.statusCode || 502, { success: false, code: error.wechatCode || 'BRIDGE_FAILED', message: error.message || 'bridge failed' })
  }
})

if (!SHARED_SECRET || !APP_ID || !APP_SECRET) {
  console.error('Missing required bridge environment variables')
  process.exit(1)
}

server.listen(PORT, HOST, () => console.log(`wechat-football-bridge listening on ${HOST}:${PORT}`))
