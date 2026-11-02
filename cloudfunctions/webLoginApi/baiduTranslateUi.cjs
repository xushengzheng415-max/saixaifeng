'use strict'
const https = require('https')
const http = require('http')
const crypto = require('crypto')

const MAX_ITEMS = 40
const MAX_CHARS = 1800
const CACHE_COLLECTION = 'ui_translation_cache'

function text(value) {
  return String(value == null ? '' : value).trim()
}

function env(name) {
  return text(process.env[name])
}

function translateCreds() {
  const apiKey = env('BAIDU_TRANSLATE_API_KEY') || env('BAIDU_FANYI_API_KEY') || env('BAIDU_MT_API_KEY')
  const secretKey = env('BAIDU_TRANSLATE_SECRET_KEY') || env('BAIDU_FANYI_SECRET_KEY') || env('BAIDU_MT_SECRET_KEY')
  const appId = env('BAIDU_TRANSLATE_APP_ID') || env('BAIDU_FANYI_APP_ID')
  const appSecret = env('BAIDU_TRANSLATE_SECRET') || env('BAIDU_FANYI_SECRET') || secretKey
  if (appId && appSecret) return { mode: 'fanyi', appId, secret: appSecret }
  if (apiKey && secretKey) return { mode: 'mt', apiKey, secretKey }
  return null
}

function requestJson(url, { method = 'GET', body, headers = {}, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'http:' ? http : https
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method,
      headers: Object.assign({}, headers, payload ? {
        'Content-Type': headers['Content-Type'] || (typeof body === 'string' && !headers['Content-Type'] ? 'application/x-www-form-urlencoded' : 'application/json'),
        'Content-Length': Buffer.byteLength(payload)
      } : {})
    }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > 1024 * 1024) {
          req.destroy(new Error('TRANSLATE_RESPONSE_LIMIT'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') })
        } catch (_) {
          reject(Object.assign(new Error('翻译响应无法解析'), { code: 'TRANSLATE_BAD_RESPONSE' }))
        }
      })
    })
    req.on('error', () => reject(Object.assign(new Error('翻译服务连接失败'), { code: 'TRANSLATE_NETWORK_ERROR' })))
    req.setTimeout(timeout, () => req.destroy(Object.assign(new Error('翻译服务超时'), { code: 'TRANSLATE_TIMEOUT' })))
    if (payload) req.end(payload)
    else req.end()
  })
}

function formBody(fields) {
  return new URLSearchParams(fields).toString()
}

let tokenCache = null
async function mtAccessToken(creds) {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.value
  const auth = await requestJson('https://aip.baidubce.com/oauth/2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'client_credentials',
      client_id: creds.apiKey,
      client_secret: creds.secretKey
    }),
    timeout: 8000
  })
  const token = text(auth.data && auth.data.access_token)
  if (!token) throw Object.assign(new Error('翻译应用授权失败，请检查配置'), { code: 'TRANSLATE_AUTH_FAILED' })
  tokenCache = {
    value: token,
    expires: Date.now() + Math.min(Number(auth.data.expires_in || 3600), 86400) * 1000 - 60000
  }
  return token
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function normalizeItems(raw) {
  const seen = new Set()
  const items = []
  let chars = 0
  for (const value of Array.isArray(raw) ? raw : []) {
    const source = text(value)
    if (!source || seen.has(source)) continue
    if (!/[\u4e00-\u9fff]/.test(source)) continue
    if (source.length > 120) continue
    if (items.length >= MAX_ITEMS) break
    if (chars + source.length > MAX_CHARS) break
    seen.add(source)
    items.push(source)
    chars += source.length
  }
  return items
}

async function readCache(db, lang, sources) {
  const out = {}
  if (!sources.length) return out
  const ids = sources.map((source) => `${lang}:${hashText(source)}`)
  const chunkSize = 20
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize)
    try {
      const res = await db.collection(CACHE_COLLECTION).where({ _id: db.command.in(slice) }).limit(slice.length).get()
      for (const row of (res && res.data) || []) {
        if (row && row.source && row.translated) out[row.source] = String(row.translated)
      }
    } catch (_) {
      // cache is best-effort; miss falls through to provider
    }
  }
  return out
}

async function writeCache(db, lang, map) {
  const now = Date.now()
  const entries = Object.keys(map)
  for (const source of entries) {
    const translated = text(map[source])
    if (!translated) continue
    const id = `${lang}:${hashText(source)}`
    try {
      await db.collection(CACHE_COLLECTION).doc(id).set({
        data: {
          lang,
          source,
          translated,
          provider: 'baidu',
          updatedAt: now
        }
      })
    } catch (_) {
      try {
        await db.collection(CACHE_COLLECTION).doc(id).update({
          data: { translated, updatedAt: now }
        })
      } catch (__) {}
    }
  }
}

async function translateViaFanyi(creds, sources, from, to) {
  const map = {}
  for (const q of sources) {
    const salt = String(Date.now()) + String(Math.floor(Math.random() * 10000))
    const sign = crypto.createHash('md5').update(creds.appId + q + salt + creds.secret).digest('hex')
    const url = 'https://fanyi-api.baidu.com/api/trans/vip/translate?' + formBody({
      q, from, to, appid: creds.appId, salt, sign
    })
    const res = await requestJson(url, { timeout: 10000 })
    if (res.data && res.data.error_code) {
      throw Object.assign(new Error('翻译服务暂不可用'), { code: 'TRANSLATE_PROVIDER_ERROR', providerCode: String(res.data.error_code) })
    }
    const translated = text((((res.data || {}).trans_result || [])[0] || {}).dst)
    if (translated) map[q] = translated
  }
  return map
}

async function translateViaMt(creds, sources, from, to) {
  const token = await mtAccessToken(creds)
  const map = {}
  // Keep batches small; Baidu MT accepts one q string; join with newlines then split.
  const joined = sources.join('\n')
  const res = await requestJson(
    'https://aip.baidubce.com/rpc/2.0/mt/texttrans/v1?access_token=' + encodeURIComponent(token),
    {
      method: 'POST',
      body: { from, to, q: joined },
      timeout: 15000
    }
  )
  if (res.data && (res.data.error_code || res.data.error_msg)) {
    throw Object.assign(new Error('翻译服务暂不可用'), { code: 'TRANSLATE_PROVIDER_ERROR', providerCode: String(res.data.error_code || '') })
  }
  const result = (((res.data || {}).result || {}).trans_result) || (res.data || {}).trans_result || []
  if (Array.isArray(result) && result.length) {
    for (const row of result) {
      const src = text(row.src)
      const dst = text(row.dst)
      if (src && dst) map[src] = dst
    }
  }
  // Fallback line-split if provider returned a single block
  if (!Object.keys(map).length) {
    const dst = text((((res.data || {}).result || {}).trans_result && res.data.result.trans_result[0] && res.data.result.trans_result[0].dst) || '')
    if (dst) {
      const lines = dst.split(/\n/)
      sources.forEach((source, index) => {
        if (lines[index]) map[source] = text(lines[index])
      })
    }
  }
  return map
}

async function translateUi(cloud, params) {
  const creds = translateCreds()
  if (!creds) {
    return { success: false, code: 'TRANSLATE_NOT_CONFIGURED', error: '翻译服务尚未配置' }
  }
  const to = text(params && params.to) || 'en'
  const from = text(params && params.from) || 'zh'
  if (!['en'].includes(to) || !['zh', 'zh-CN', 'auto'].includes(from)) {
    return { success: false, code: 'TRANSLATE_LANG_DENIED', error: '当前仅支持中文到英文' }
  }
  const sources = normalizeItems(params && params.texts)
  if (!sources.length) return { success: true, translations: {}, cached: 0, translated: 0 }

  const db = cloud.database()
  const cached = await readCache(db, to, sources)
  const missing = sources.filter((source) => !cached[source])
  let fresh = {}
  if (missing.length) {
    fresh = creds.mode === 'fanyi'
      ? await translateViaFanyi(creds, missing, from === 'zh-CN' ? 'zh' : from, to)
      : await translateViaMt(creds, missing, from === 'zh-CN' ? 'zh' : from, to)
    await writeCache(db, to, fresh)
  }
  const translations = Object.assign({}, cached, fresh)
  return {
    success: true,
    translations,
    cached: Object.keys(cached).length,
    translated: Object.keys(fresh).length
  }
}

module.exports = {
  translateUi,
  translateCreds,
  normalizeItems
}
