#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = __dirname
const ENV_PATH = path.join(ROOT, '.env.local')
const CACHE_DIR = path.join(ROOT, '.cache')
const TOKEN_PATH = path.join(CACHE_DIR, 'access-token.json')
const RECEIPT_DIR = path.join(ROOT, 'receipts')
const WECHAT_BASE = 'https://api.weixin.qq.com'

loadEnv(ENV_PATH)

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      args._.push(value)
      continue
    }
    const key = value.slice(2)
    if (argv[index + 1] && !argv[index + 1].startsWith('--')) args[key] = argv[++index]
    else args[key] = true
  }
  return args
}

function requireCredentials() {
  const missing = ['WECHAT_APP_ID', 'WECHAT_APP_SECRET'].filter((name) => !process.env[name])
  if (missing.length) throw new Error(`凭据未配置：${missing.join(', ')}`)
}

function ensurePrivateDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  try { fs.chmodSync(dir, 0o700) } catch { /* Windows source checkout */ }
}

function writePrivateJson(file, value) {
  ensurePrivateDirectory(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(file, 0o600) } catch { /* Windows source checkout */ }
}

async function requestJson(endpoint, options = {}) {
  const response = await fetch(endpoint, options)
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`微信返回了无法识别的数据（HTTP ${response.status}）`) }
  if (!response.ok || data.errcode) {
    const code = data.errcode || response.status
    throw new Error(`微信接口失败（${code}）：${data.errmsg || '未知错误'}`)
  }
  return data
}

async function accessToken(forceRefresh = false) {
  requireCredentials()
  if (!forceRefresh && fs.existsSync(TOKEN_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
      if (cached.access_token && cached.expires_at > Date.now() + 5 * 60 * 1000) return cached.access_token
    } catch { /* damaged or incomplete cache: fetch again */ }
  }
  const data = await requestJson(`${WECHAT_BASE}/cgi-bin/stable_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: process.env.WECHAT_APP_ID,
      secret: process.env.WECHAT_APP_SECRET,
      force_refresh: Boolean(forceRefresh)
    })
  })
  writePrivateJson(TOKEN_PATH, {
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 7200) * 1000
  })
  return data.access_token
}

function mimeType(file) {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.gif') return 'image/gif'
  throw new Error(`不支持的图片格式：${extension || '无扩展名'}`)
}

function resolveAsset(inputDir, file) {
  const absolute = path.resolve(inputDir, file)
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`找不到图片：${absolute}`)
  const size = fs.statSync(absolute).size
  if (size > 10 * 1024 * 1024) throw new Error(`图片超过 10MB：${absolute}`)
  return absolute
}

async function uploadImage(file, token, purpose) {
  const form = new FormData()
  form.append('media', new Blob([fs.readFileSync(file)], { type: mimeType(file) }), path.basename(file))
  const endpoint = purpose === 'content'
    ? `${WECHAT_BASE}/cgi-bin/media/uploadimg?access_token=${encodeURIComponent(token)}`
    : `${WECHAT_BASE}/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=thumb`
  return requestJson(endpoint, { method: 'POST', body: form })
}

function readArticle(inputFile) {
  const absolute = path.resolve(inputFile)
  if (!fs.existsSync(absolute)) throw new Error(`找不到文章包：${absolute}`)
  const article = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  for (const name of ['title', 'digest', 'content_html']) {
    if (typeof article[name] !== 'string' || !article[name].trim()) throw new Error(`文章缺少 ${name}`)
  }
  if (article.title.length > 64) throw new Error('文章标题超过 64 个字符')
  if (article.digest.length > 120) throw new Error('文章摘要超过 120 个字符')
  if (!Array.isArray(article.content_images || [])) throw new Error('content_images 必须是数组')
  const inputDir = path.dirname(absolute)
  for (const image of article.content_images || []) {
    if (!image.placeholder || !image.file_path) throw new Error('每张正文图必须包含 placeholder 和 file_path')
    if (!article.content_html.includes(image.placeholder)) throw new Error(`正文中找不到占位符：${image.placeholder}`)
    resolveAsset(inputDir, image.file_path)
  }
  if (!article.thumb_media_id && !process.env.WECHAT_THUMB_MEDIA_ID && !article.cover_path) throw new Error('文章缺少 cover_path 或 thumb_media_id')
  if (article.cover_path) resolveAsset(inputDir, article.cover_path)
  return { article, inputDir, absolute }
}

function placeholderPattern(placeholder) {
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<img[^>]*src=["']${escaped}["'][^>]*\/?>`, 'gi')
}

async function prepareContent(article, inputDir, token) {
  let content = article.content_html
  for (const image of article.content_images || []) {
    const file = resolveAsset(inputDir, image.file_path)
    const uploaded = await uploadImage(file, token, 'content')
    if (!uploaded.url) throw new Error(`微信没有返回正文图 URL：${path.basename(file)}`)
    const pattern = placeholderPattern(image.placeholder)
    if (!pattern.test(content)) throw new Error(`正文图占位符无法替换：${image.placeholder}`)
    pattern.lastIndex = 0
    content = content.replace(pattern, (tag) => tag.replace(image.placeholder, uploaded.url))
  }
  return content
}

async function doctor() {
  const token = await accessToken(true)
  const result = await requestJson(`${WECHAT_BASE}/cgi-bin/draft/count?access_token=${encodeURIComponent(token)}`)
  console.log(JSON.stringify({ ok: true, account: process.env.ARTICLE_AUTHOR || '未命名公众号', draft_count: result.total_count }, null, 2))
}

async function createDraft(inputFile) {
  const { article, inputDir } = readArticle(inputFile)
  const token = await accessToken()
  let thumbMediaId = article.thumb_media_id || process.env.WECHAT_THUMB_MEDIA_ID || ''
  if (!thumbMediaId) {
    const cover = resolveAsset(inputDir, article.cover_path)
    const uploaded = await uploadImage(cover, token, 'thumb')
    thumbMediaId = uploaded.media_id || ''
  }
  if (!thumbMediaId) throw new Error('微信没有返回封面 media_id')
  const content = await prepareContent(article, inputDir, token)
  const payload = {
    articles: [{
      title: article.title,
      author: process.env.ARTICLE_AUTHOR || '蜂狂小编',
      digest: article.digest,
      content,
      content_source_url: article.content_source_url || '',
      thumb_media_id: thumbMediaId,
      need_open_comment: article.need_open_comment === false ? 0 : 1,
      only_fans_can_comment: article.only_fans_can_comment ? 1 : 0
    }]
  }
  const result = await requestJson(`${WECHAT_BASE}/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  })
  const receipt = {
    status: 'created',
    account: process.env.ARTICLE_AUTHOR || '蜂狂小编',
    title: article.title,
    media_id: result.media_id,
    created_at: new Date().toISOString(),
    content_images_uploaded: (article.content_images || []).length
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writePrivateJson(path.join(RECEIPT_DIR, `${stamp}.json`), receipt)
  console.log(JSON.stringify({ ok: true, title: article.title, media_id: result.media_id }, null, 2))
}

function usage() {
  console.log(`赛小蜂公众号 SSH 草稿工具\n\n  node wechat-draft.js validate --input article.json\n  node wechat-draft.js doctor\n  node wechat-draft.js draft --input article.json\n\n该工具不包含群发或发布命令。`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (!command || command === 'help') return usage()
  if (command === 'validate') {
    if (!args.input) throw new Error('请提供 --input')
    const { article } = readArticle(args.input)
    console.log(JSON.stringify({ ok: true, title: article.title, content_images: (article.content_images || []).length }, null, 2))
    return
  }
  if (command === 'doctor') return doctor()
  if (command === 'draft') {
    if (!args.input) throw new Error('请提供 --input')
    return createDraft(args.input)
  }
  throw new Error(`不支持的命令：${command}`)
}

main().catch((error) => {
  console.error(`失败：${error.message}`)
  process.exitCode = 1
})
