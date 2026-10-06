'use strict'

const http = require('http')
const { URL } = require('url')
const { getConfig, getKfQueueStatus, getKfStateSummary, getKfTestAllowlistSummary, main } = require('./index')
const { addCustomerTags, getAccessToken, parseIdentityConfig, verifyIdentityToken } = require('./core')

const port = Number(process.env.PORT || 3100)

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new Error('request_body_too_large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function htmlResponse(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; img-src https://wework.qpic.cn https://*.qpic.cn data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  })
  response.end(body)
}

function pageShell(title, content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#100b08;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.page{min-height:100vh;padding:36px 20px 48px;background:radial-gradient(circle at 85% 0,#7a2600 0,transparent 38%),linear-gradient(160deg,#160c07,#090706)}.shell{max-width:520px;margin:0 auto}.brand{color:#ff6a00;font-size:14px;font-weight:800}.title{font-size:30px;line-height:1.25;margin:18px 0 10px}.lead{color:#c9c1bc;line-height:1.7}.role{width:100%;text-align:left;border:1px solid #4b382e;border-radius:18px;background:#1f1611;color:#fff;padding:20px;margin:0 0 14px}.role strong{display:block;font-size:19px;margin-bottom:7px}.role span{color:#bfb4ad}.qr{width:100%;border-radius:18px;background:#fff;margin-top:18px}.success{color:#63db8d;font-weight:800}.hint{text-align:center;color:#c9c1bc}.error{padding:18px;border:1px solid #71352a;background:#2a1511;border-radius:14px;color:#ffc4b8}</style></head><body><main class="page"><div class="shell">${content}</div></main></body></html>`
}

function identityRuntimeConfig() {
  return {
    corpId: String(process.env.WECOM_CORP_ID || ''),
    contactSecret: String(process.env.WECOM_CONTACT_SECRET || ''),
    signingKey: String(process.env.WECOM_IDENTITY_SIGNING_KEY || ''),
    roles: parseIdentityConfig(process.env.WECOM_IDENTITY_CONFIG_JSON || '{}')
  }
}

function renderIdentityChooser(token, roles) {
  const buttons = Object.entries(roles).map(([role, config]) => `<form method="post" action="/wecom/identity/choose"><input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="role" value="${escapeHtml(role)}"><button class="role" type="submit"><strong>${escapeHtml(config.label)}</strong><span>${escapeHtml(config.description)}</span></button></form>`).join('')
  return pageShell('选择身份', `<div class="brand">赛小蜂篮球</div><h1 class="title">请选择您的身份</h1><p class="lead">选择后将为您匹配对应服务，并显示对应交流群入口。</p>${buttons}`)
}

function renderIdentityResult(role) {
  return pageShell('已完成身份匹配', `<div class="brand">赛小蜂篮球</div><p class="success">身份匹配完成</p><h1 class="title">${escapeHtml(role.label)}</h1><p class="lead">已为您添加对应客户标签。请长按识别下方二维码加入交流群。</p><img class="qr" src="${escapeHtml(role.imageUrl)}" alt="${escapeHtml(role.label)}交流群二维码"><p class="hint">长按图片识别二维码</p>`)
}

function renderIdentityError(message) {
  return pageShell('链接不可用', `<div class="brand">赛小蜂篮球</div><h1 class="title">暂时无法完成</h1><div class="error">${escapeHtml(message)}</div>`)
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/health') {
      const config = getConfig()
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({
        ok: true,
        service: 'sxf-wecom-customer-router',
        kf: {
          enabled: config.kfEnabled,
          dryRun: config.kfDryRun,
          sendEnabled: config.kfSendEnabled,
          accountCount: config.kfRoutes.length,
          welcomeRuleCount: Object.keys(config.kfWelcomeRules).length,
          welcomeMenuCount: Object.keys(config.kfWelcomeMenus).length,
          routes: [...new Set(config.kfRoutes.flatMap((item) => [item.defaultRoute, ...Object.values(item.scenes)]))].sort(),
          queue: getKfQueueStatus(),
          state: getKfStateSummary(),
          testAllowlist: getKfTestAllowlistSummary()
        }
      }))
      return
    }
    if (url.pathname === '/wecom/identity' && request.method === 'GET') {
      const config = identityRuntimeConfig()
      const token = url.searchParams.get('token') || ''
      verifyIdentityToken(token, config.signingKey)
      htmlResponse(response, 200, renderIdentityChooser(token, config.roles))
      return
    }
    if (url.pathname === '/wecom/identity/choose' && request.method === 'POST') {
      const config = identityRuntimeConfig()
      const form = new URLSearchParams(await collectBody(request))
      const payload = verifyIdentityToken(form.get('token') || '', config.signingKey)
      const role = config.roles[form.get('role') || '']
      if (!role) throw new Error('invalid_identity_role')
      const accessToken = await getAccessToken(config.corpId, config.contactSecret)
      await addCustomerTags(accessToken, { UserID: payload.userId, ExternalUserID: payload.externalUserId }, [role.tagId], role.removeTagIds)
      htmlResponse(response, 200, renderIdentityResult(role))
      return
    }
    if (url.pathname !== '/wecom/customer') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('not found')
      return
    }
    const queryStringParameters = {}
    url.searchParams.forEach((value, key) => { queryStringParameters[key] = value })
    const result = await main({ httpMethod: request.method, headers: request.headers, queryStringParameters, body: await collectBody(request) })
    response.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(result.body || '')
  } catch (error) {
    console.error('[sxfWecomCustomerRouter] http server failed', { code: error.message || 'unknown_error' })
    if (/identity/.test(error.message || '')) {
      htmlResponse(response, 400, renderIdentityError(error.message === 'expired_identity_token' ? '身份选择链接已过期，请重新添加或联系客服。' : '身份选择链接无效，请返回企微重新打开。'))
      return
    }
    response.writeHead(error.message === 'request_body_too_large' ? 413 : 500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end('temporary failure')
  }
})

server.listen(port, '0.0.0.0', () => console.info(`[sxfWecomCustomerRouter] listening on ${port}`))
