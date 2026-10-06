'use strict'

const { getAccessToken, sendKfMenu, sendKfMessage } = require('./core')
const { getConfig } = require('./index')
const { KfTestAllowlist } = require('./test-allowlist')

async function main() {
  if (process.argv[2] !== '--confirm-send-to-test-allowlist') throw new Error('explicit_test_send_confirmation_required')
  const routesArgument = process.argv.find((value) => value.startsWith('--routes='))
  if (!routesArgument) throw new Error('explicit_test_routes_required')
  const requestedRoutes = routesArgument.slice('--routes='.length).split(',').filter(Boolean)
  const allowedRoutes = new Set(['football', 'basketball', 'event_service', 'software_development'])
  if (!requestedRoutes.length || requestedRoutes.some((route) => !allowedRoutes.has(route))) throw new Error('invalid_test_routes')
  const config = getConfig()
  if (config.kfSendEnabled) throw new Error('global_send_must_remain_disabled')
  const allowlist = new KfTestAllowlist(config.kfTestAllowlistPath)
  for (const account of ['football', 'basketball', 'event']) {
    if (!allowlist.get(account)) throw new Error(`missing_test_allowlist_${account}`)
  }
  const accessToken = await getAccessToken(config.corpId, config.contactSecret)
  const deliveries = [
    ['football', 'football'],
    ['basketball', 'basketball'],
    ['event', 'event_service'],
    ['event', 'software_development']
  ].filter((item) => requestedRoutes.includes(item[1]))
  const results = []
  for (const [account, route] of deliveries) {
    const target = allowlist.get(account)
    const content = config.kfWelcomeRules[route]
    if (!content) throw new Error(`missing_test_welcome_${route}`)
    const menu = config.kfWelcomeMenus[route]
    const sent = menu
      ? await sendKfMenu(accessToken, target.openKfId, target.externalUserId, menu)
      : await sendKfMessage(accessToken, target.openKfId, target.externalUserId, content)
    results.push({ route, messageType: menu ? 'msgmenu' : 'text', success: true, msgIdPresent: Boolean(sent.msgId) })
  }
  console.log(JSON.stringify({ globalSendEnabled: false, deliveries: results }))
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, code: error.message || 'unknown_error', errcode: error.errcode || 0 }))
  process.exitCode = 1
})
