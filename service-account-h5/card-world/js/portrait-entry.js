(function (global) {
  'use strict'
  // 「我的球员卡」→ AI 形象照的真实入口。
  // AI 抱膀定妆照只在「球员登记 · 形象照」环节生成（服务端扣蜂蜜、写入该次登记的
  // 形象照记录），没有独立的对外页面。这里不做新的业务判断，只做两件事：
  //   1) 有本人「待提交」的登记时，复用登记页的令牌直接进去，形象照行的「✦ 智能生成」就在那里；
  //   2) 没有待提交登记时，如实说明原因，不再跳到一个和 AI 形象照无关的列表页。
  var Api = global.CardWorldApi
  var ENTRY_KEY_PREFIX = 'sxf_entry_session_'

  function storeEntryToken(entry, token, expiresAt) {
    var key = ENTRY_KEY_PREFIX + entry
    var expires = new Date(expiresAt).getTime()
    try { localStorage.setItem(key, JSON.stringify({ token: token, proof: '', expiresAt: expires })) } catch (error) { /* ignore */ }
    try { sessionStorage.setItem(key, token) } catch (error) { /* ignore */ }
  }

  function entries() {
    return Api.registrationEntries().then(function (result) {
      return (result && result.entries) || []
    })
  }

  // 只认本人、同一支球队「待提交」的登记：
  // 已登记（registered）回读的是球员卡预览页，没有形象照环节；
  // 别的球队的未完成登记会生成属于那次登记的形象照，不能拿到当前这张卡上，因此不跨队拉起。
  function pickDraft(rows, playerName, teamName) {
    var drafts = (rows || []).filter(function (row) { return row.status === 'draft' })
    if (!drafts.length || !playerName || !teamName) return null
    for (var index = 0; index < drafts.length; index += 1) {
      var row = drafts[index]
      if (String(row.playerName || '') !== String(playerName)) continue
      if (String(row.teamName || '') !== String(teamName)) continue
      return row
    }
    return null
  }

  function otherTeamDraft(rows, playerName, teamName) {
    var drafts = (rows || []).filter(function (row) { return row.status === 'draft' })
    for (var index = 0; index < drafts.length; index += 1) {
      var row = drafts[index]
      if (String(row.playerName || '') !== String(playerName)) continue
      if (String(row.teamName || '') === String(teamName)) continue
      return row
    }
    return null
  }

  function open(playerName, teamName, notice) {
    var tell = typeof notice === 'function' ? notice : function () {}
    if (!Api) { tell('页面尚未准备好，请重新打开'); return Promise.resolve(null) }
    return entries().then(function (rows) {
      var draft = pickDraft(rows, playerName, teamName)
      if (!draft) {
        var other = otherTeamDraft(rows, playerName, teamName)
        if (other) {
          tell('AI 定妆照在「球员登记 · 形象照」里生成。你在「' + String(other.teamName || '其他球队') +
            '」还有一次未完成的登记，那里的形象照属于那次登记，不会改到当前这张卡面；当前球队要换形象照，需要球队重新发起一次登记邀请。')
        } else {
          tell('AI 定妆照在「球员登记 · 形象照」里生成。当前球队这轮登记已完成，没有可用的形象照环节；需要球队重新发起一次登记邀请后，才能生成新形象照并换到这张卡面。')
        }
        return null
      }
      return Api.resumeRegistration(draft.id).then(function (resume) {
        if (!resume || !resume.entry || !resume.serviceEntrySession) throw new Error('登记入口已失效，请重新打开')
        storeEntryToken(resume.entry, resume.serviceEntrySession, resume.expiresAt)
        // ai=1：登记页会自动展开「✦ 智能生成」，避免用户还要自己找按钮。
        global.location.href = '../join-player.html?entry=' + encodeURIComponent(resume.entry) + '&ai=1'
        return resume
      })
    }).catch(function (error) {
      tell((error && error.message) || '登记入口读取失败，请稍后重试')
      return null
    })
  }

  global.CardWorldPortraitEntry = { open: open, pickDraft: pickDraft, otherTeamDraft: otherTeamDraft }
})(window)
