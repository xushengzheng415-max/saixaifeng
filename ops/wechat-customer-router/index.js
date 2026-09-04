'use strict'

const {
  decryptWechatPayload,
  isKfNotification,
  parseKfWelcomeRules,
  parseKfWelcomeMenus,
  parseKfRoutes,
  parseRules,
  parseXmlFields,
  processCustomerEvent,
  processKfNotification,
  verifySignature
} = require('./core')
const { KfStateStore } = require('./state')
const { KfTestAllowlist } = require('./test-allowlist')

const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }

function httpResponse(body, statusCode = 200) {
  return { statusCode, headers: TEXT_HEADERS, body: String(body) }
}

function normalizeMethod(event) {
  return String(event && (event.httpMethod || (event.requestContext && event.requestContext.httpMethod)) || 'POST').toUpperCase()
}

function getQuery(event) {
  const direct = event && event.queryStringParameters && typeof event.queryStringParameters === 'object' ? event.queryStringParameters : {}
  return Object.assign({}, direct, {
    msg_signature: direct.msg_signature || (event && event.msg_signature),
    timestamp: direct.timestamp || (event && event.timestamp),
    nonce: direct.nonce || (event && event.nonce),
    echostr: direct.echostr || (event && event.echostr)
  })
}

function getBody(event) {
  if (!event) return ''
  let body = event.body !== undefined ? event.body : event
  if (event.isBase64Encoded && typeof body === 'string') body = Buffer.from(body, 'base64').toString('utf8')
  if (typeof body === 'string') return body
  return body && body.xml ? String(body.xml) : String(body || '')
}

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

let kfQueue = Promise.resolve()
let kfQueueStatus = { pending: 0, lastError: '', lastCompletedAt: '' }
const stateStores = new Map()

function stateStoreFor(filePath) {
  if (!stateStores.has(filePath)) stateStores.set(filePath, new KfStateStore(filePath))
  return stateStores.get(filePath)
}

function scheduleKfNotification(eventData, config) {
  kfQueueStatus.pending += 1
  kfQueue = kfQueue.then(async () => {
    try {
      const result = await processKfNotification(eventData, config, {
        stateStore: stateStoreFor(config.kfStatePath),
        testAllowlist: new KfTestAllowlist(config.kfTestAllowlistPath),
        onPlan: async (plan) => console.info('[sxWecomCustomerRouter] kf route planned', {
          account: plan.account,
          route: plan.route,
          sceneMatched: plan.sceneMatched,
          needsChoice: plan.needsChoice,
          eventType: plan.eventType,
          messageType: plan.messageType,
          welcomeStatus: plan.welcomeStatus,
          testAllowlistStatus: plan.testAllowlistStatus
        })
      })
      kfQueueStatus.lastError = ''
      kfQueueStatus.lastCompletedAt = new Date().toISOString()
      console.info('[sxWecomCustomerRouter] kf sync completed', { pages: result.pages || 0, plans: result.plans ? result.plans.length : 0 })
    } catch (error) {
      kfQueueStatus.lastError = error.message || 'unknown_error'
      console.error('[sxWecomCustomerRouter] kf sync failed', { code: kfQueueStatus.lastError, errcode: error.errcode || 0 })
    } finally {
      kfQueueStatus.pending = Math.max(0, kfQueueStatus.pending - 1)
    }
  })
}

function getConfig() {
  const config = {
    enabled: boolEnv('WECOM_ROUTER_ENABLED'),
    corpId: String(process.env.WECOM_CORP_ID || '').trim(),
    contactSecret: String(process.env.WECOM_CONTACT_SECRET || '').trim(),
    callbackToken: String(process.env.WECOM_CALLBACK_TOKEN || '').trim(),
    encodingAesKey: String(process.env.WECOM_ENCODING_AES_KEY || '').trim(),
    rules: parseRules(process.env.WECOM_CHANNEL_RULES_JSON || '[]'),
    identitySigningKey: String(process.env.WECOM_IDENTITY_SIGNING_KEY || ''),
    identitySelectorUrl: String(process.env.WECOM_IDENTITY_SELECTOR_URL || ''),
    identityTokenTtlSeconds: Number(process.env.WECOM_IDENTITY_TOKEN_TTL_SECONDS || 604800),
    kfEnabled: boolEnv('WECOM_KF_ENABLED'),
    kfDryRun: boolEnv('WECOM_KF_DRY_RUN', true),
    kfSendEnabled: boolEnv('WECOM_KF_SEND_ENABLED'),
    kfRoutes: parseKfRoutes(process.env.WECOM_KF_ACCOUNT_ROUTES_JSON || '[]'),
    kfStatePath: String(process.env.WECOM_KF_STATE_PATH || '/data/wecom-kf-state.json').trim(),
    kfWelcomeRules: parseKfWelcomeRules(process.env.WECOM_KF_WELCOME_RULES_JSON || '{}'),
    kfWelcomeMenus: parseKfWelcomeMenus(process.env.WECOM_KF_WELCOME_MENUS_JSON || '{}'),
    kfTestCaptureCode: String(process.env.WECOM_KF_TEST_CAPTURE_CODE || '').trim(),
    kfTestAllowlistPath: String(process.env.WECOM_KF_TEST_ALLOWLIST_PATH || '/data/wecom-kf-test-allowlist.json').trim()
  }
  if (!config.corpId || !config.callbackToken || !config.encodingAesKey) throw new Error('missing_wecom_callback_config')
  if (config.kfSendEnabled && config.kfDryRun) throw new Error('invalid_wecom_kf_send_mode')
  if (config.kfEnabled && config.kfRoutes.length !== 3) throw new Error('invalid_wecom_kf_account_count')
  if (config.kfEnabled && Object.keys(config.kfWelcomeRules).length !== 4) throw new Error('invalid_wecom_kf_welcome_rule_count')
  if (config.kfEnabled && Object.keys(config.kfWelcomeMenus).length !== 2) throw new Error('invalid_wecom_kf_welcome_menu_count')
  return config
}

function decryptIncoming(query, encrypted, config) {
  if (!verifySignature(config.callbackToken, query.timestamp, query.nonce, encrypted, query.msg_signature)) {
    throw new Error('invalid_wecom_signature')
  }
  return decryptWechatPayload(encrypted, config.encodingAesKey, config.corpId)
}

exports.main = async (event) => {
  try {
    const method = normalizeMethod(event)
    const query = getQuery(event)
    const config = getConfig()
    if (method === 'GET') {
      if (!query.echostr) return httpResponse('missing echostr', 400)
      return httpResponse(decryptIncoming(query, query.echostr, config).message)
    }
    if (method !== 'POST') return httpResponse('method not allowed', 405)
    const envelope = parseXmlFields(getBody(event))
    if (!envelope.Encrypt) return httpResponse('missing Encrypt', 400)
    const eventData = parseXmlFields(decryptIncoming(query, envelope.Encrypt, config).message)

    if (isKfNotification(eventData)) {
      const result = config.kfDryRun
        ? await processKfNotification(eventData, config)
        : { handled: true, dryRun: false, queued: true }
      if (!config.kfDryRun) scheduleKfNotification(eventData, config)
      console.info('[sxWecomCustomerRouter] kf notification', {
        handled: result.handled,
        reason: result.reason || '',
        dryRun: !!result.dryRun,
        account: result.account || '',
        route: result.route || '',
        needsChoice: !!result.needsChoice,
        pages: Number(result.pages || 0),
        plans: Array.isArray(result.plans) ? result.plans.length : 0,
        queued: !!result.queued,
        sendEnabled: config.kfSendEnabled
      })
      return httpResponse('success')
    }

    if (!config.enabled) {
      console.info('[sxWecomCustomerRouter] callback verified; external-contact router disabled')
      return httpResponse('success')
    }
    if (!config.contactSecret) throw new Error('missing_wecom_contact_secret')
    const result = await processCustomerEvent(eventData, config)
    console.info('[sxWecomCustomerRouter] external-contact processed', {
      handled: result.handled,
      reason: result.reason || '',
      state: result.state || '',
      tagged: !!result.tagged,
      welcomed: !!result.welcomed
    })
    return httpResponse('success')
  } catch (error) {
    console.error('[sxWecomCustomerRouter] failed', { code: error.message || 'unknown_error', errcode: error.errcode || 0 })
    const clientError = /signature|receiver|echostr|Encrypt/.test(error.message || '')
    return httpResponse(clientError ? 'invalid request' : 'temporary failure', clientError ? 403 : 500)
  }
}

exports.getConfig = getConfig
exports.getKfQueueStatus = () => ({ ...kfQueueStatus })
exports.getKfStateSummary = () => {
  const config = getConfig()
  if (!config.kfStatePath || config.kfDryRun) return { cursorCount: 0, sessionCount: 0, processedCount: 0 }
  return stateStoreFor(config.kfStatePath).summary()
}
exports.getKfTestAllowlistSummary = () => {
  const config = getConfig()
  return new KfTestAllowlist(config.kfTestAllowlistPath).summary()
}
