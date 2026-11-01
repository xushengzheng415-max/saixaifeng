(function (global) {
  'use strict'
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_referee_h5_session'
  var CITY_KEY = 'sxf_card_world_city'

  function sessionToken() {
    try { return localStorage.getItem(KEY) || '' } catch (e) { return '' }
  }

  function savedCity() {
    try {
      var raw = localStorage.getItem(CITY_KEY)
      if (!raw) return null
      var parsed = JSON.parse(raw)
      if (parsed && /^\d{4,6}$/.test(String(parsed.cityCode || ''))) return parsed
    } catch (e) { /* ignore */ }
    return null
  }

  function saveCity(cityCode, cityName) {
    try {
      localStorage.setItem(CITY_KEY, JSON.stringify({
        cityCode: String(cityCode || ''),
        cityName: String(cityName || '')
      }))
    } catch (e) { /* ignore */ }
  }

  function api(action, data) {
    var body = Object.assign({
      action: action,
      serviceSessionToken: sessionToken()
    }, data || {})
    var city = savedCity()
    if (city && !body.cityCode) {
      body.cityCode = city.cityCode
      body.cityName = city.cityName
    }
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json() }).then(function (r) {
      r = r && typeof r.body === 'string' ? JSON.parse(r.body) : r
      if (!r || !r.success) {
        var err = new Error((r && r.error) || '操作失败，请重试')
        err.code = (r && r.code) || ''
        throw err
      }
      return r
    })
  }

  function goLogin() {
    try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ }
    location.href = '../me.html'
  }

  global.CardWorldApi = {
    KEY: KEY,
    sessionToken: sessionToken,
    savedCity: savedCity,
    saveCity: saveCity,
    goLogin: goLogin,
    login: function (extra) { return api('cardWorldLogin', extra) },
    mainCard: function (extra) { return api('cardWorldMainCard', extra) },
    album: function (extra) { return api('cardWorldAlbum', extra) },
    lineup: function (extra) { return api('cardWorldLineup', extra) },
    ownedCards: function (extra) { return api('cardWorldOwnedCards', extra) },
    battleLog: function (extra) { return api('cardWorldBattleLog', extra) },
    sign: function (extra) { return api('cardWorldSignSameCity', extra) },
    setSlot: function (key, playerId) { return api('cardWorldSetSlot', { key: key, playerId: playerId || '' }) },
    saveLineup: function (slots) { return api('cardWorldSaveLineup', { slots: slots || [] }) },
    setRosterSize: function (size) { return api('cardWorldSetRosterSize', { rosterSize: size }) },
    battle: function (extra) { return api('cardWorldBattle', extra) },
    membership: function (extra) { return api('cardWorldMembership', extra) }
  }
})(window);
