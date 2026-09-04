'use strict'

const crypto = require('crypto')
const https = require('https')

const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000
const ALLOWED_KF_ROUTES = new Set(['football', 'basketball', 'event_service', 'software_development'])
let tokenCache = { value: '', expiresAt: 0 }

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseXmlFields(xml) {
  const result = {}
  const pattern = /<([A-Za-z][A-Za-z0-9_]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g
  let match
  while ((match = pattern.exec(String(xml || '')))) {
    result[match[1]] = decodeXml(match[2] !== undefined ? match[2] : match[3])
  }
  return result
}

function createSignature(token, timestamp, nonce, encrypted) {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].map((item) => String(item || '')).sort().join(''))
    .digest('hex')
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function verifySignature(token, timestamp, nonce, encrypted, signature) {
  return timingSafeEqualText(createSignature(token, timestamp, nonce, encrypted), signature)
}

function decodeEncodingAesKey(encodingAesKey) {
  const normalized = String(encodingAesKey || '').trim()
  if (!/^[A-Za-z0-9+/]{43}$/.test(normalized)) throw new Error('invalid_wecom_encoding_aes_key')
  const key = Buffer.from(`${normalized}=`, 'base64')
  if (key.length !== 32) throw new Error('invalid_wecom_encoding_aes_key_length')
  return key
}

function removeWechatPadding(buffer) {
  if (!buffer.length) throw new Error('empty_wecom_plaintext')
  const pad = buffer[buffer.length - 1]
  if (pad < 1 || pad > 32 || pad > buffer.length) throw new Error('invalid_wecom_padding')
  for (let index = buffer.length - pad; index < buffer.length; index += 1) {
    if (buffer[index] !== pad) throw new Error('invalid_wecom_padding')
  }
  return buffer.subarray(0, buffer.length - pad)
}

function decryptWechatPayload(encrypted, encodingAesKey, expectedReceiverId) {
  const key = decodeEncodingAesKey(encodingAesKey)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const padded = Buffer.concat([
    decipher.update(Buffer.from(String(encrypted || ''), 'base64')),
    decipher.final()
  ])
  const plain = removeWechatPadding(padded)
  if (plain.length < 20) throw new Error('invalid_wecom_plaintext')
  const messageLength = plain.readUInt32BE(16)
  const messageStart = 20
  const messageEnd = messageStart + messageLength
  if (messageEnd > plain.length) throw new Error('invalid_wecom_message_length')
  const message = plain.subarray(messageStart, messageEnd).toString('utf8')
  const receiverId = plain.subarray(messageEnd).toString('utf8')
  if (expectedReceiverId && receiverId !== expectedReceiverId) throw new Error('wecom_receiver_id_mismatch')
  return { message, receiverId }
}

function parseRules(raw) {
  if (!raw) return []
  let rules
  try { rules = JSON.parse(raw) } catch (error) { throw new Error('invalid_wecom_channel_rules_json') }
  if (!Array.isArray(rules)) throw new Error('invalid_wecom_channel_rules_json')
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object' || !String(rule.state || '').trim()) throw new Error('invalid_wecom_channel_rule')
    const welcome = rule.welcome && typeof rule.welcome === 'object' ? rule.welcome : {}
    return {
      state: String(rule.state).trim(),
      tagIds: Array.isArray(rule.tagIds) ? rule.tagIds.map(String).filter(Boolean) : [],
      identitySelector: !!rule.identitySelector,
      welcome: {
        text: String(welcome.text || ''),
        attachments: Array.isArray(welcome.attachments) ? welcome.attachments.slice(0, 9) : []
      }
    }
  })
}

function parseIdentityConfig(raw) {
  if (!raw) return {}
  let config
  try { config = JSON.parse(raw) } catch (error) { throw new Error('invalid_wecom_identity_config_json') }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid_wecom_identity_config_json')
  const result = {}
  for (const [role, value] of Object.entries(config)) {
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(role) || !value || typeof value !== 'object') throw new Error('invalid_wecom_identity_role')
    if (!value.tagId || !value.imageUrl || !value.label) throw new Error('invalid_wecom_identity_role')
    result[role] = {
      label: String(value.label),
      description: String(value.description || ''),
      tagId: String(value.tagId),
      removeTagIds: Array.isArray(value.removeTagIds) ? value.removeTagIds.map(String).filter(Boolean) : [],
      imageUrl: String(value.imageUrl)
    }
  }
  return result
}

function parseKfRoutes(raw) {
  let routes
  try { routes = JSON.parse(raw || '[]') } catch (error) { throw new Error('invalid_wecom_kf_routes_json') }
  if (!Array.isArray(routes)) throw new Error('invalid_wecom_kf_routes_json')
  const seenAccounts = new Set()
  return routes.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid_wecom_kf_route')
    const openKfId = String(item.openKfId || '').trim()
    const account = String(item.account || '').trim()
    const defaultRoute = String(item.defaultRoute || '').trim()
    if (!openKfId || !account || !ALLOWED_KF_ROUTES.has(defaultRoute) || seenAccounts.has(openKfId)) {
      throw new Error('invalid_wecom_kf_route')
    }
    seenAccounts.add(openKfId)
    const scenes = {}
    for (const [scene, route] of Object.entries(item.scenes || {})) {
      if (!/^[a-z][a-z0-9_-]{1,63}$/.test(scene) || !ALLOWED_KF_ROUTES.has(String(route))) {
        throw new Error('invalid_wecom_kf_scene_route')
      }
      scenes[scene] = String(route)
    }
    return {
      openKfId,
      account,
      defaultRoute,
      scenes,
      requireChoiceWhenUnknown: item.requireChoiceWhenUnknown === true
    }
  })
}

function parseKfWelcomeRules(raw) {
  let rules
  try { rules = JSON.parse(raw || '{}') } catch (error) { throw new Error('invalid_wecom_kf_welcome_rules_json') }
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error('invalid_wecom_kf_welcome_rules_json')
  const result = {}
  for (const [route, content] of Object.entries(rules)) {
    if (!ALLOWED_KF_ROUTES.has(route)) throw new Error('invalid_wecom_kf_welcome_route')
    const message = String(content || '').trim()
    if (!message || Buffer.byteLength(message, 'utf8') > 2048) throw new Error('invalid_wecom_kf_welcome_content')
    result[route] = message
  }
  return result
}

function parseKfWelcomeMenus(raw) {
  let menus
  try { menus = JSON.parse(raw || '{}') } catch (error) { throw new Error('invalid_wecom_kf_welcome_menus_json') }
  if (!menus || typeof menus !== 'object' || Array.isArray(menus)) throw new Error('invalid_wecom_kf_welcome_menus_json')
  const result = {}
  for (const [route, menu] of Object.entries(menus)) {
    if (!['football', 'basketball'].includes(route) || !menu || typeof menu !== 'object') throw new Error('invalid_wecom_kf_welcome_menu')
    const items = Array.isArray(menu.items) ? menu.items : []
    if (items.length < 1 || items.length > 10) throw new Error('invalid_wecom_kf_welcome_menu_items')
    result[route] = {
      headContent: String(menu.headContent || '').trim(),
      tailContent: String(menu.tailContent || '').trim(),
      items: items.map((item) => {
        if (item.type === 'view' && /^https:\/\//.test(String(item.url || '')) && item.content) {
          return { type: 'view', view: { url: String(item.url), content: String(item.content) } }
        }
        if (item.type === 'miniprogram' && /^wx[a-zA-Z0-9]{16}$/.test(String(item.appid || '')) && /\.html(?:\?|$)/.test(String(item.pagepath || '')) && item.content) {
          return { type: 'miniprogram', miniprogram: { appid: String(item.appid), pagepath: String(item.pagepath), content: String(item.content) } }
        }
        throw new Error('invalid_wecom_kf_welcome_menu_item')
      })
    }
  }
  return result
}

function identityKey(secret) {
  const value = String(secret || '')
  if (value.length < 32) throw new Error('invalid_wecom_identity_signing_key')
  return crypto.createHash('sha256').update(value, 'utf8').digest()
}

function createIdentityToken(payload, secret) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', identityKey(secret), iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

function verifyIdentityToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  let input
  try { input = Buffer.from(String(token || ''), 'base64url') } catch (error) { throw new Error('invalid_identity_token') }
  if (input.length < 29) throw new Error('invalid_identity_token')
  const iv = input.subarray(0, 12)
  const tag = input.subarray(12, 28)
  const encrypted = input.subarray(28)
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', identityKey(secret), iv)
    decipher.setAuthTag(tag)
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'))
    if (!payload || !payload.externalUserId || !payload.userId || !payload.exp) throw new Error('invalid')
    if (Number(payload.exp) < nowSeconds) throw new Error('expired_identity_token')
    return payload
  } catch (error) {
    if (error.message === 'expired_identity_token') throw error
    throw new Error('invalid_identity_token')
  }
}

function findRule(eventData, rules) {
  if (!eventData || eventData.Event !== 'change_external_contact' || eventData.ChangeType !== 'add_external_contact') return null
  const state = String(eventData.State || '').trim()
  return state ? rules.find((rule) => rule.state === state) || null : null
}

function requestJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const request = https.request({
      hostname: 'qyapi.weixin.qq.com',
      port: 443,
      path,
      method,
      headers: payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': payload.length } : undefined,
      timeout: 8000
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        let data
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch (error) {
          reject(new Error(`invalid_wecom_api_response_${response.statusCode || 0}`))
          return
        }
        if ((response.statusCode || 500) >= 400 || data.errcode) {
          const apiError = new Error(`wecom_api_error_${data.errcode || response.statusCode || 500}`)
          apiError.errcode = data.errcode
          reject(apiError)
          return
        }
        resolve(data)
      })
    })
    request.on('timeout', () => request.destroy(new Error('wecom_api_timeout')))
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

async function getAccessToken(corpId, secret) {
  const now = Date.now()
  if (tokenCache.value && tokenCache.expiresAt - TOKEN_SAFETY_WINDOW_MS > now) return tokenCache.value
  const path = `/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`
  const data = await requestJson('GET', path)
  tokenCache = { value: data.access_token, expiresAt: now + Number(data.expires_in || 7200) * 1000 }
  return tokenCache.value
}

async function addCustomerTags(accessToken, eventData, tagIds, removeTagIds = []) {
  if (!tagIds.length && !removeTagIds.length) return { skipped: true }
  return requestJson('POST', `/cgi-bin/externalcontact/mark_tag?access_token=${encodeURIComponent(accessToken)}`, {
    userid: eventData.UserID,
    external_userid: eventData.ExternalUserID,
    add_tag: tagIds,
    remove_tag: removeTagIds
  })
}

async function sendWelcome(accessToken, welcomeCode, welcome) {
  if (!welcomeCode) return { skipped: true, reason: 'missing_welcome_code' }
  const payload = { welcome_code: welcomeCode }
  if (welcome.text) payload.text = { content: welcome.text }
  if (welcome.attachments.length) payload.attachments = welcome.attachments
  if (!payload.text && !payload.attachments) return { skipped: true, reason: 'empty_welcome' }
  return requestJson('POST', `/cgi-bin/externalcontact/send_welcome_msg?access_token=${encodeURIComponent(accessToken)}`, payload)
}

async function processCustomerEvent(eventData, config, dependencies = {}) {
  const rule = findRule(eventData, config.rules || [])
  if (!rule) return { handled: false, reason: 'channel_not_matched' }
  if (!eventData.UserID || !eventData.ExternalUserID) throw new Error('invalid_add_external_contact_event')
  const getToken = dependencies.getAccessToken || getAccessToken
  const accessToken = await getToken(config.corpId, config.contactSecret)
  await (dependencies.addCustomerTags || addCustomerTags)(accessToken, eventData, rule.tagIds)
  let welcome = rule.welcome
  if (rule.identitySelector) {
    if (!config.identitySigningKey || !config.identitySelectorUrl) throw new Error('missing_wecom_identity_selector_config')
    const now = Math.floor(Date.now() / 1000)
    const token = createIdentityToken({
      externalUserId: eventData.ExternalUserID,
      userId: eventData.UserID,
      state: rule.state,
      exp: now + Number(config.identityTokenTtlSeconds || 7 * 24 * 60 * 60)
    }, config.identitySigningKey)
    const separator = config.identitySelectorUrl.includes('?') ? '&' : '?'
    welcome = {
      text: rule.welcome.text || '您好，欢迎联系赛小蜂篮球！请先选择您的身份。',
      attachments: [{ msgtype: 'link', link: { title: '请选择您的身份', desc: '机构人员或赛事主理人，一键进入对应交流群', url: `${config.identitySelectorUrl}${separator}token=${encodeURIComponent(token)}` } }]
    }
  }
  const welcomeResult = await (dependencies.sendWelcome || sendWelcome)(accessToken, eventData.WelcomeCode, welcome)
  return { handled: true, state: rule.state, tagged: rule.tagIds.length > 0, welcomed: !welcomeResult.skipped }
}

function isKfNotification(eventData) {
  return !!eventData && eventData.Event === 'kf_msg_or_event'
}

function sceneFromKfItem(item) {
  const event = item && item.event && typeof item.event === 'object' ? item.event : {}
  return String(event.scene_param || event.scene || item.scene_param || item.scene || '').trim()
}

function resolveKfRoute(openKfId, scene, routes) {
  const account = (routes || []).find((item) => item.openKfId === String(openKfId || ''))
  if (!account) return null
  const normalizedScene = String(scene || '').trim()
  const matchedRoute = normalizedScene && account.scenes[normalizedScene]
  return {
    account: account.account,
    openKfId: account.openKfId,
    route: matchedRoute || account.defaultRoute,
    scene: normalizedScene,
    sceneMatched: !!matchedRoute,
    needsChoice: account.requireChoiceWhenUnknown && !matchedRoute
  }
}

function planKfItem(item, routes, sessionRoutes = new Map()) {
  const event = item && item.event && typeof item.event === 'object' ? item.event : {}
  const openKfId = String(item && item.open_kfid || event.open_kfid || '')
  const externalUserId = String(item && item.external_userid || event.external_userid || '')
  const sessionKey = openKfId && externalUserId ? `${openKfId}:${externalUserId}` : ''
  const scene = sceneFromKfItem(item)
  let route = resolveKfRoute(openKfId, scene, routes)
  if (route && sessionKey && scene) sessionRoutes.set(sessionKey, route)
  if (route && sessionKey && !scene && sessionRoutes.has(sessionKey)) route = sessionRoutes.get(sessionKey)
  return route ? {
    ...route,
    externalUserId,
    msgId: String(item && item.msgid || ''),
    eventType: String(event.event_type || ''),
    messageType: String(item && item.msgtype || '')
  } : null
}

async function sendKfWelcome(accessToken, welcomeCode, content, request = requestJson) {
  if (!welcomeCode || !content) return { skipped: true, reason: 'missing_welcome_payload' }
  const data = await request('POST', `/cgi-bin/kf/send_msg_on_event?access_token=${encodeURIComponent(accessToken)}`, {
    code: String(welcomeCode),
    msgtype: 'text',
    text: { content: String(content) }
  })
  return { skipped: false, msgId: String(data.msgid || '') }
}

async function sendKfWelcomeMenu(accessToken, welcomeCode, menu, request = requestJson) {
  if (!welcomeCode || !menu || !menu.items || !menu.items.length) throw new Error('missing_wecom_kf_welcome_menu_payload')
  const data = await request('POST', `/cgi-bin/kf/send_msg_on_event?access_token=${encodeURIComponent(accessToken)}`, {
    code: String(welcomeCode),
    msgtype: 'msgmenu',
    msgmenu: { head_content: menu.headContent, list: menu.items, tail_content: menu.tailContent }
  })
  return { msgId: String(data.msgid || '') }
}

async function sendKfMessage(accessToken, openKfId, externalUserId, content, request = requestJson) {
  if (!openKfId || !externalUserId || !content) throw new Error('missing_wecom_kf_test_message_payload')
  const data = await request('POST', `/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(accessToken)}`, {
    touser: String(externalUserId),
    open_kfid: String(openKfId),
    msgtype: 'text',
    text: { content: String(content) }
  })
  return { msgId: String(data.msgid || '') }
}

async function sendKfMenu(accessToken, openKfId, externalUserId, menu, request = requestJson) {
  if (!openKfId || !externalUserId || !menu || !menu.items || !menu.items.length) throw new Error('missing_wecom_kf_test_menu_payload')
  const data = await request('POST', `/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(accessToken)}`, {
    touser: String(externalUserId),
    open_kfid: String(openKfId),
    msgtype: 'msgmenu',
    msgmenu: { head_content: menu.headContent, list: menu.items, tail_content: menu.tailContent }
  })
  return { msgId: String(data.msgid || '') }
}

function kfItemKey(item) {
  const msgId = String(item && item.msgid || '').trim()
  if (msgId) return `msg:${msgId}`
  const event = item && item.event && typeof item.event === 'object' ? item.event : {}
  const material = JSON.stringify([
    item && item.send_time || '',
    item && item.open_kfid || event.open_kfid || '',
    item && item.external_userid || event.external_userid || '',
    item && item.msgtype || '',
    event.event_type || '',
    event.scene || '',
    event.scene_param || ''
  ])
  return `event:${crypto.createHash('sha256').update(material).digest('hex')}`
}

function planKfNotification(eventData, config) {
  const openKfId = String(eventData && eventData.OpenKfId || '')
  const route = openKfId ? resolveKfRoute(openKfId, '', config.kfRoutes || []) : null
  return {
    handled: true,
    dryRun: true,
    hasSyncToken: Boolean(eventData && eventData.Token),
    account: route ? route.account : '',
    route: route ? route.route : '',
    needsChoice: route ? route.needsChoice : false
  }
}

async function syncKfMessages(eventData, config, dependencies = {}) {
  if (!eventData.Token) throw new Error('missing_wecom_kf_sync_token')
  const request = dependencies.requestJson || requestJson
  const getToken = dependencies.getAccessToken || getAccessToken
  const onPlan = dependencies.onPlan || (() => {})
  const stateStore = dependencies.stateStore || null
  const cursorKey = String(eventData.OpenKfId || 'all')
  const sessionRoutes = dependencies.sessionRoutes || (stateStore ? stateStore.getSessionMap() : new Map())
  const accessToken = await getToken(config.corpId, config.contactSecret)
  let cursor = dependencies.cursor !== undefined ? String(dependencies.cursor || '') : (stateStore ? stateStore.getCursor(cursorKey) : '')
  let hasMore = 1
  let pages = 0
  const plans = []
  while (hasMore && pages < 10) {
    const data = await request('POST', `/cgi-bin/kf/sync_msg?access_token=${encodeURIComponent(accessToken)}`, {
      cursor,
      token: String(eventData.Token),
      limit: 100,
      voice_format: 0,
      open_kfid: String(eventData.OpenKfId || '')
    })
    for (const item of data.msg_list || []) {
      const itemKey = kfItemKey(item)
      if (stateStore && stateStore.hasProcessed(itemKey)) continue
      const plan = planKfItem(item, config.kfRoutes || [], sessionRoutes)
      if (plan) {
        const event = item && item.event && typeof item.event === 'object' ? item.event : {}
        const textContent = item && item.msgtype === 'text' && item.text ? String(item.text.content || '') : ''
        if (dependencies.testAllowlist && config.kfTestCaptureCode && textContent === config.kfTestCaptureCode) {
          dependencies.testAllowlist.capture(plan.account, plan.openKfId, plan.externalUserId)
          plan.testAllowlistStatus = 'captured'
        } else {
          plan.testAllowlistStatus = 'not_applicable'
        }
        const welcomeContent = config.kfWelcomeRules && config.kfWelcomeRules[plan.route]
        const welcomeMenu = config.kfWelcomeMenus && config.kfWelcomeMenus[plan.route]
        if (plan.eventType === 'enter_session' && (welcomeContent || welcomeMenu) && event.welcome_code) {
          if (config.kfSendEnabled) {
            if (welcomeMenu) await (dependencies.sendKfWelcomeMenu || sendKfWelcomeMenu)(accessToken, event.welcome_code, welcomeMenu, request)
            else await (dependencies.sendKfWelcome || sendKfWelcome)(accessToken, event.welcome_code, welcomeContent, request)
            plan.welcomeStatus = 'sent'
          } else {
            plan.welcomeStatus = 'planned'
          }
        } else {
          plan.welcomeStatus = 'not_applicable'
        }
        plans.push(plan)
        await onPlan(plan, item)
      }
      if (stateStore) stateStore.markProcessed(itemKey)
    }
    cursor = String(data.next_cursor || cursor)
    if (stateStore) stateStore.commit(cursorKey, cursor, sessionRoutes)
    hasMore = Number(data.has_more || 0)
    pages += 1
  }
  if (hasMore) throw new Error('wecom_kf_sync_page_limit')
  return { handled: true, dryRun: false, cursor, pages, plans }
}

async function processKfNotification(eventData, config, dependencies = {}) {
  if (!isKfNotification(eventData)) return { handled: false, reason: 'not_kf_notification' }
  if (!config.kfEnabled) return { handled: false, reason: 'kf_disabled' }
  if (config.kfDryRun) return planKfNotification(eventData, config)
  return syncKfMessages(eventData, config, dependencies)
}

function resetTokenCache() { tokenCache = { value: '', expiresAt: 0 } }

module.exports = {
  addCustomerTags,
  createIdentityToken,
  createSignature,
  decodeEncodingAesKey,
  decryptWechatPayload,
  findRule,
  getAccessToken,
  isKfNotification,
  kfItemKey,
  parseIdentityConfig,
  parseKfRoutes,
  parseKfWelcomeRules,
  parseKfWelcomeMenus,
  parseRules,
  parseXmlFields,
  planKfItem,
  processCustomerEvent,
  processKfNotification,
  removeWechatPadding,
  requestJson,
  resetTokenCache,
  resolveKfRoute,
  sendWelcome,
  sendKfWelcome,
  sendKfWelcomeMenu,
  sendKfMessage,
  sendKfMenu,
  syncKfMessages,
  verifyIdentityToken,
  verifySignature
}
