'use strict'
const assert = require('node:assert/strict')
const create = require('../cloudfunctions/webLoginApi/fanCenter.cjs')
const writes = []
const db = { createCollection: async () => {}, serverDate: () => 'now', collection: () => ({ doc: () => ({ set: async value => writes.push(value.data) }) }) }
const api = create({ cloud: { database: () => db }, crypto: require('node:crypto'), SERVICE_ACCOUNT_CONFIG: { APP_ID: 'test', APP_SECRET: 'test' }, normalizeServiceH5Url: value => /^https:\/\//i.test(value) ? value.split('#')[0] : '' })
;(async () => {
  const preview = 'https://www.sxffootball.cn/preview/dynamic-card/h5/player-cards.html'
  for (const [input, expected] of [[preview, preview], ['https://www.sxffootball.cn/service-account-h5/player-cards.html', 'https://www.sxffootball.cn/service-account-h5/player-cards.html'], ['https://evil.example/preview/dynamic-card/h5/player-cards.html', 'https://www.sxffootball.cn/service-account-h5/me.html'], ['https://www.sxffootball.cn/preview/other/index.html', 'https://www.sxffootball.cn/service-account-h5/me.html'], ['https://www.sxffootball.cn:8443/service-account-h5/player-cards.html', 'https://www.sxffootball.cn/service-account-h5/me.html']]) {
    const response = await api.createFanOAuthUrl(input)
    assert.equal(new URL(response.authorizeUrl).searchParams.get('redirect_uri'), expected)
    assert.equal(writes.at(-1).redirectUri, expected)
  }
  console.log('PASS: preview OAuth keeps exact return path; foreign origins, ports and unknown paths rejected')
})().catch(error => { console.error(error); process.exitCode = 1 })
