const crypto = require('crypto')

module.exports = function createPlayerAccountTransfer(deps) {
  const { db, invitePreview, teamPlayers, ensureProfileInvite, profileInviteUrl, verifiedPhone, error, toTime } = deps

  function one(result) {
    return Array.isArray(result && result.data) ? result.data[0] : result && result.data
  }

  async function rows(collection, where, limit = 20) {
    const result = await db.collection(collection).where(where).limit(limit).get()
    return Array.isArray(result.data) ? result.data : []
  }

  async function optionalRows(collection, where, limit = 20) {
    try { return await rows(collection, where, limit) } catch (failure) {
      const message = String(failure && (failure.message || failure.errMsg) || '')
      if (/-502005|DATABASE_COLLECTION_NOT_EXIST|collection not exists|Db or Table not exist/i.test(message)) return []
      throw failure
    }
  }

  async function registrationFinished(player) {
    if (String(player.profileStatus || '') === 'complete' || String(player.parentProfileSubmissionStatus || '') === 'submitted' || player.parentProfileCompletedAt) return true
    return (await optionalRows('parent_profile_submissions', { playerId: String(player._id), status: 'submitted' }, 1)).length > 0
  }

  async function assertNoProtectedHistory(player) {
    const id = String(player._id)
    for (const [collection, where] of [
      ['player_identity_profiles', { playerId: id }],
      ['player_electronic_passes', { playerId: id }],
      ['player_cards', { playerId: id }],
      ['player_card_drafts', { playerId: id }],
      ['player_team_memberships', { playerId: id }],
      ['roster_snapshots', { playerIds: id }],
      ['match_lineup_snapshots', { 'starters.playerId': id }],
      ['match_lineup_snapshots', { 'substitutes.playerId': id }],
      ['match_events', { playerId: id }]
    ]) if ((await optionalRows(collection, where, 1)).length) throw error('PLAYER_HISTORY_REVIEW_REQUIRED', '该球员已有正式资料或比赛记录，请使用账号迁移或联系球队管理员核对')
  }

  function linkedTo(player, identity) {
    const userId = String(identity.user && identity.user._id || '')
    const openId = String(identity.openId || '')
    return Boolean((userId && [player.linkedUserId, player.playerUserId].filter(Boolean).map(String).includes(userId)) ||
      (openId && [player.linkedOpenId, player.playerOpenId].filter(Boolean).map(String).includes(openId)))
  }

  async function pendingOldRequest(event, identity) {
    const preview = await invitePreview(event, identity)
    const match = preview.existingPlayer
    if (!match || match.registrantType !== 'self') throw error('TRANSFER_SELF_PLAYER_REQUIRED', '当前账号没有可转移的本人球员档案')
    const player = (await teamPlayers(preview.team.id, 1, { _id: match.id }))[0]
    if (!player || !linkedTo(player, identity) || String(player.teamId || '') !== preview.team.id) throw error('TRANSFER_OWNERSHIP_REQUIRED', '当前账号无权转移该球员身份')
    if (!verifiedPhone(identity.user)) throw error('VERIFIED_PHONE_REQUIRED', '请先验证当前账号手机号')
    const complete = await registrationFinished(player)
    if (!complete) throw error('TRANSFER_NOT_REQUIRED', '该球员尚未完成登记，请新账号直接选择沿用旧资料')
    const requests = (await rows('team_invitations', { type: 'player_account_transfer', playerId: String(player._id), status: 'awaiting_old_approval' }, 20))
      .filter(item => toTime(item.expiresAt) > Date.now() && String(item.oldUserId || '') === String(identity.user._id))
    if (requests.length !== 1) throw error('TRANSFER_REQUEST_REQUIRED', requests.length ? '存在多份转入申请，请联系球队管理员核对' : '请先在新账号选择“沿用旧资料到当前账号”')
    const request = requests[0]
    if (Boolean(request.registrationComplete) !== complete) throw error('TRANSFER_SOURCE_CHANGED', '球员登记状态已变化，请新账号重新发起')
    return { request, complete }
  }

  async function inspect(event, identity) {
    const { request, complete } = await pendingOldRequest(event, identity)
    return { success: true, targetPhoneMasked: String(request.newPhoneMasked || ''), registrationComplete: complete }
  }

  async function begin(event, identity) {
    if (event.confirmed !== true) throw error('TRANSFER_CONFIRM_REQUIRED', '请先确认授权新账号沿用资料')
    const { request, complete } = await pendingOldRequest(event, identity)
    const transferCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    const codeHash = crypto.createHash('sha256').update(String(request._id) + ':' + transferCode).digest('hex')
    const now = db.serverDate()
    await db.collection('team_invitations').doc(String(request._id)).update({ data: {
      status: 'approved', codeHash, attemptCount: 0, approvedAt: now,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), updateTime: now
    } })
    return { success: true, transferCode, registrationComplete: complete, expiresAtText: '10分钟内有效' }
  }

  async function priorCandidate(event, identity, preview, currentPlayerId) {
    const name = String(event.name || '').trim()
    const birthDate = String(event.birthDate || '').trim()
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
    const candidates = (await teamPlayers(preview.team.id, 500)).filter(item =>
      String(item._id) !== String(currentPlayerId || '') &&
      String(item.name || '').trim() === name && String(item.birthDate || item.birthday || '') === birthDate &&
      !['archived', 'deleted'].includes(String(item.status || '').toLowerCase()) &&
      String(item.registrantType || '') === 'self' &&
      [item.linkedUserId, item.playerUserId].some(Boolean) && !linkedTo(item, identity))
    if (!candidates.length) return null
    if (candidates.length !== 1) throw error('PRIOR_PLAYER_AMBIGUOUS', '同队存在多份同名生日档案，请联系球队管理员核对')
    return candidates[0]
  }

  async function priorChoice(event, identity, preview, currentPlayerId) {
    const candidate = await priorCandidate(event, identity, preview, currentPlayerId)
    if (!candidate) return null
    const complete = await registrationFinished(candidate)
    return {
      success: false, code: 'PRIOR_PLAYER_FOUND', registrationComplete: complete,
      message: complete ? '发现旧账号已完成的球员档案，请选择沿用或返回旧账号。' : '发现旧账号尚未完成的球员登记，请选择沿用或返回旧账号。'
    }
  }

  async function adoptIncomplete(event, identity) {
    const preview = await invitePreview(event, identity)
    const prior = await priorCandidate(event, identity, preview, preview.existingPlayer && preview.existingPlayer.id)
    if (!prior) throw error('PRIOR_PLAYER_NOT_FOUND', '旧球员资料已变化，请重新核对')
    if (await registrationFinished(prior)) throw error('TRANSFER_REQUIRED', '旧球员已完成登记，请按已完成资料的账号迁移流程办理')
    await assertNoProtectedHistory(prior)
    if (event.authorizationAgreed !== true) throw error('PLAYER_AUTH_REQUIRED', '请先确认本人登记及资料授权')
    const phone = verifiedPhone(identity.user)
    if (!phone) throw error('VERIFIED_PHONE_REQUIRED', '请先验证当前账号手机号')
    const oldUserId = String(prior.linkedUserId || prior.playerUserId || '')
    if (!oldUserId || oldUserId === String(identity.user._id)) throw error('PRIOR_PLAYER_CHANGED', '旧球员账号归属已变化，请重新加载')
    const oldInvites = await rows('parent_profile_invites', { playerId: String(prior._id) }, 20)
    if (oldInvites.length >= 20) throw error('PLAYER_HISTORY_REVIEW_REQUIRED', '资料邀请过多，请联系球队管理员核对')
    for (const invite of oldInvites) for (const collection of ['parent_identity_documents', 'parent_identity_verifications', 'parent_portraits']) {
      if ((await optionalRows(collection, { parentInvite: String(invite.token || '') }, 1)).length) throw error('PLAYER_SENSITIVE_REVIEW_REQUIRED', '旧档案已有证件或形象照，请联系球队管理员核对后换绑')
    }
    const linked = (await teamPlayers(preview.team.id, 500)).filter(item => String(item._id) !== String(prior._id) && linkedTo(item, identity))
    const duplicates = []
    for (const item of linked) {
      if (String(item.name || '').trim() !== String(prior.name || '').trim()) throw error('PLAYER_EXISTING_OTHER', '当前账号还关联其他球员，请联系球队管理员核对')
      duplicates.push({ player: item, invites: await assertDisposableDuplicate(item) })
    }
    const allInvites = oldInvites.concat(duplicates.flatMap(item => item.invites))
    if (allInvites.length >= 20) throw error('PLAYER_HISTORY_REVIEW_REQUIRED', '资料邀请过多，请联系球队管理员核对')
    const tokens = allInvites.map(item => String(item.token || '')).filter(Boolean)
    const sessions = tokens.length ? await rows('parent_h5_sessions', { parentInvite: db.command.in(tokens), active: true }, 100) : []
    const now = db.serverDate()
    await db.runTransaction(async transaction => {
      const current = one(await transaction.collection('players').doc(String(prior._id)).get())
      if (!current || String(current.teamId || '') !== preview.team.id || String(current.linkedUserId || '') !== oldUserId ||
          String(current.name || '') !== String(prior.name || '') || String(current.birthDate || current.birthday || '') !== String(prior.birthDate || prior.birthday || '') ||
          String(current.profileStatus || '') === 'complete' || String(current.parentProfileSubmissionStatus || '') === 'submitted' || current.parentProfileCompletedAt) {
        throw error('PRIOR_PLAYER_CHANGED', '旧球员状态已变化，请重新加载')
      }
      for (const item of duplicates) {
        const duplicate = one(await transaction.collection('players').doc(String(item.player._id)).get())
        if (!duplicate || !linkedTo(duplicate, identity) || String(duplicate.profileStatus || '') !== 'pending') throw error('PLAYER_DUPLICATE_CHANGED', '当前账号资料已变化，请重新加载')
        await transaction.collection('players').doc(String(duplicate._id)).update({ data: {
          status: 'archived', teamId: '', teamCode: '', archivedTeamId: preview.team.id,
          linkedUserId: '', linkedOpenId: '', playerUserId: '', playerOpenId: '',
          replacedByPlayerId: String(prior._id), archivedReason: 'incomplete_account_adoption', archivedAt: now, updateTime: now
        } })
      }
      await transaction.collection('players').doc(String(prior._id)).update({ data: {
        linkedUserId: String(identity.user._id), linkedOpenId: String(identity.openId || ''),
        playerUserId: String(identity.user._id), playerOpenId: String(identity.openId || ''),
        playerPhone: phone, contactPhone: phone, authorizationAgreed: true, authorizationConfirmedAt: now,
        accountAdoptedAt: now, accountAdoptionSource: 'incomplete_registration', updateTime: now
      } })
      for (const invite of allInvites) if (String(invite.status || '') === 'active') {
        await transaction.collection('parent_profile_invites').doc(String(invite._id)).update({ data: { status: 'expired', expiredAt: now, updateTime: now } })
      }
      for (const session of sessions) await transaction.collection('parent_h5_sessions').doc(String(session._id)).update({ data: { active: false, revokedAt: now, updateTime: now } })
    })
    const adopted = Object.assign({}, prior, { linkedUserId: identity.user._id, linkedOpenId: identity.openId, playerPhone: phone, contactPhone: phone })
    const parentInvite = await ensureProfileInvite({ _id: preview.team.id, name: preview.team.name }, adopted, String(prior.orgId || ''), String(identity.user._id))
    return { success: true, adoptedIncomplete: true, player: { id: String(prior._id), name: String(prior.name), birthDate: String(prior.birthDate || prior.birthday || ''), profileStatus: 'pending' }, team: preview.team, parentProfileUrl: profileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
  }

  async function request(event, identity) {
    const preview = await invitePreview(event, identity)
    const candidate = await priorCandidate(event, identity, preview, preview.existingPlayer && preview.existingPlayer.id)
    if (!candidate) throw error('PRIOR_PLAYER_NOT_FOUND', '旧球员档案已变化，请重新核对姓名和生日')
    const currentPhone = verifiedPhone(identity.user)
    if (event.authorizationAgreed !== true || !currentPhone) throw error('TRANSFER_AUTH_REQUIRED', '请先验证手机号并确认本人资料授权')
    const complete = await registrationFinished(candidate)
    if (!complete) throw error('TRANSFER_NOT_REQUIRED', '旧球员尚未完成登记，请直接选择沿用旧资料')
    const oldUserId = String(candidate.linkedUserId || candidate.playerUserId || '')
    if (!oldUserId || oldUserId === String(identity.user._id)) throw error('TRANSFER_OWNERSHIP_CHANGED', '旧账号绑定已变化，请重新加载')
    const pending = await rows('team_invitations', { type: 'player_account_transfer', teamId: preview.team.id, newUserId: String(identity.user._id) }, 20)
    const active = pending.filter(item => ['awaiting_old_approval', 'approved'].includes(String(item.status || '')) && toTime(item.expiresAt) > Date.now())
    if (active.length === 1 && String(active[0].playerId || '') === String(candidate._id) && String(active[0].oldUserId || '') === oldUserId) {
      return { success: true, requestPending: true, requestId: String(active[0]._id), approved: active[0].status === 'approved', registrationComplete: complete, message: active[0].status === 'approved' ? '旧账号已授权，请填写6位码' : '已发起沿用申请，请旧账号确认授权' }
    }
    const now = db.serverDate()
    for (const item of pending) if (['awaiting_old_approval', 'approved'].includes(String(item.status || ''))) {
      await db.collection('team_invitations').doc(String(item._id)).update({ data: { status: 'replaced', updateTime: now } })
    }
    const created = await db.collection('team_invitations').add({ data: {
      type: 'player_account_transfer', purpose: 'self_player_account_move', status: 'awaiting_old_approval',
      playerId: String(candidate._id), teamId: preview.team.id, orgId: String(candidate.orgId || ''),
      oldUserId, oldOpenId: String(candidate.linkedOpenId || ''),
      newUserId: String(identity.user._id), newOpenId: String(identity.openId || ''),
      newPhoneMasked: currentPhone.slice(0, 3) + '****' + currentPhone.slice(-4),
      playerName: String(candidate.name || ''), birthDate: String(candidate.birthDate || candidate.birthday || ''),
      registrationComplete: complete, attemptCount: 0, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createTime: now, updateTime: now
    } })
    return { success: true, requestPending: true, requestId: String(created._id || ''), registrationComplete: complete, message: '已发起沿用申请，请旧账号确认授权' }
  }

  async function overwriteIncomplete(event, identity, preview, invite, team, player) {
    if (String(player.registrantType || '') !== 'self' || !(linkedTo(player, identity)) || await registrationFinished(player)) {
      throw error('PLAYER_PROFILE_CONFLICT', '当前账号档案与填写资料不一致，请联系球队管理员核对')
    }
    await assertNoProtectedHistory(player)
    const name = String(event.name || '').trim()
    const birthDate = String(event.birthDate || '').trim()
    const birth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate + 'T00:00:00Z') : null
    if (name.length < 2 || !birth || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate || birth > new Date()) throw error('PLAYER_INPUT_INVALID', '请填写有效的姓名和出生日期')
    const age = new Date().getFullYear() - birth.getUTCFullYear() - (new Date().getMonth() + 1 < birth.getUTCMonth() + 1 || (new Date().getMonth() === birth.getUTCMonth() && new Date().getDate() < birth.getUTCDate()) ? 1 : 0)
    if (age < 18) throw error('PLAYER_SELF_AGE_REQUIRED', '未成年球员须按监护人登记')
    if (event.authorizationAgreed !== true) throw error('PLAYER_AUTH_REQUIRED', '请确认本人登记及资料授权')
    const phone = verifiedPhone(identity.user)
    if (!phone) throw error('VERIFIED_PHONE_REQUIRED', '请先验证当前账号手机号')
    const duplicates = (await teamPlayers(preview.team.id, 500)).filter(item => String(item._id) !== String(player._id) &&
      String(item.name || '').trim() === name && String(item.birthDate || item.birthday || '') === birthDate &&
      !['archived', 'deleted'].includes(String(item.status || '').toLowerCase()))
    if (duplicates.length) {
      const prior = await priorChoice(event, identity, preview, player._id)
      if (prior) return prior
      throw error('PLAYER_IDENTITY_OCCUPIED', '该姓名和生日已有其他球员档案，请联系球队管理员核对')
    }
    const invites = await rows('parent_profile_invites', { playerId: String(player._id) }, 20)
    if (invites.length >= 20) throw error('PLAYER_HISTORY_REVIEW_REQUIRED', '资料邀请过多，请联系球队管理员核对')
    const tokens = invites.map(item => String(item.token || '')).filter(Boolean)
    const sessions = tokens.length ? await rows('parent_h5_sessions', { parentInvite: db.command.in(tokens), active: true }, 100) : []
    const now = db.serverDate()
    await db.runTransaction(async transaction => {
      const fresh = one(await transaction.collection('players').doc(String(player._id)).get())
      if (!fresh || !linkedTo(fresh, identity) || String(fresh.teamId || '') !== preview.team.id ||
          String(fresh.profileStatus || '') === 'complete' || String(fresh.parentProfileSubmissionStatus || '') === 'submitted' || fresh.parentProfileCompletedAt) {
        throw error('PLAYER_PROFILE_CHANGED', '球员档案状态已变化，请重新加载')
      }
      await transaction.collection('players').doc(String(player._id)).update({ data: {
        name, birthDate, birthday: birthDate, playerPhone: phone, contactPhone: phone,
        registrantType: 'self', applicantRole: 'self', profileStatus: 'pending', needsParentCompletion: true,
        identityStatus: 'pending', identityVerificationId: '', photoUrl: '', photoFileID: '', recentPortraitId: '',
        authorizationAgreed: true, authorizationConfirmedAt: now, incompleteProfileReplacedAt: now, updateTime: now
      } })
      for (const oldInvite of invites) if (String(oldInvite.status || '') === 'active') {
        await transaction.collection('parent_profile_invites').doc(String(oldInvite._id)).update({ data: { status: 'expired', expiredAt: now, updateTime: now } })
      }
      for (const session of sessions) await transaction.collection('parent_h5_sessions').doc(String(session._id)).update({ data: { active: false, revokedAt: now, updateTime: now } })
    })
    const updatedPlayer = Object.assign({}, player, { name, birthDate, birthday: birthDate, playerPhone: phone, contactPhone: phone, identityVerificationId: '', recentPortraitId: '' })
    const parentInvite = await ensureProfileInvite(team, updatedPlayer, String(invite.orgId || ''), String(identity.user._id))
    return { success: true, replacedIncomplete: true, player: { id: String(player._id), name, birthDate, profileStatus: 'pending' }, team: preview.team, parentProfileUrl: profileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
  }

  async function assertDisposableDuplicate(player) {
    if (String(player.source || '') !== 'team_player_invite' || String(player.profileStatus || '') !== 'pending' ||
        String(player.registrantType || '') !== 'self' || String(player.organizerReviewStatus || '').toLowerCase() === 'approved' ||
        await registrationFinished(player)) {
      throw error('TRANSFER_DUPLICATE_REVIEW_REQUIRED', '当前账号已有已处理的球员档案，请联系球队管理员核对')
    }
    await assertNoProtectedHistory(player)
    const invites = await rows('parent_profile_invites', { playerId: String(player._id) }, 20)
    if (invites.length >= 20) throw error('TRANSFER_DUPLICATE_REVIEW_REQUIRED', '资料邀请过多，请联系球队管理员核对')
    return invites
  }

  async function finish(event, identity) {
    const code = String(event.transferCode || '').trim()
    if (!/^\d{6}$/.test(code)) throw error('TRANSFER_CODE_INVALID', '请输入旧账号生成的6位授权码')
    const preview = await invitePreview(event, identity)
    const candidates = (await rows('team_invitations', { type: 'player_account_transfer', teamId: preview.team.id, newUserId: String(identity.user._id) }, 20))
      .filter(item => ['approved', 'redeemed'].includes(String(item.status || '')))
    if (candidates.length !== 1) throw error('TRANSFER_REQUEST_REQUIRED', '当前账号没有可领取的授权请求，请重新选择沿用旧资料')
    const ticket = candidates[0]
    if (ticket.status === 'approved' && Number(ticket.attemptCount || 0) >= 5) throw error('TRANSFER_CODE_LOCKED', '授权码错误次数过多，请新账号重新发起')
    const codeHash = crypto.createHash('sha256').update(String(ticket._id) + ':' + code).digest('hex')
    if (codeHash !== String(ticket.codeHash || '')) {
      if (ticket.status === 'approved') {
        const attempts = Number(ticket.attemptCount || 0) + 1
        await db.collection('team_invitations').doc(String(ticket._id)).update({ data: { attemptCount: attempts, status: attempts >= 5 ? 'locked' : 'approved', updateTime: db.serverDate() } })
      }
      throw error('TRANSFER_CODE_INVALID', '授权码不正确，请核对后重试')
    }
    if (String(ticket.oldUserId || '') === String(identity.user._id)) throw error('TRANSFER_SAME_ACCOUNT', '请在新账号中输入迁移码')
    const accountPhone = verifiedPhone(identity.user)
    if (!accountPhone) throw error('VERIFIED_PHONE_REQUIRED', '请先验证新账号手机号')
    if (event.authorizationAgreed !== true) throw error('TRANSFER_AUTH_REQUIRED', '请先确认本人登记及资料授权')
    const player = one(await db.collection('players').doc(String(ticket.playerId)).get())
    if (!player || String(player.teamId || '') !== preview.team.id) {
      throw error('TRANSFER_SOURCE_CHANGED', '原球员档案已变化，请在旧账号重新生成迁移码')
    }
    if (ticket.status === 'redeemed' && String(ticket.newUserId || '') === String(identity.user._id) && linkedTo(player, identity)) {
      const parentInvite = await ensureProfileInvite({ _id: preview.team.id, name: preview.team.name }, player, String(ticket.orgId || ''), String(identity.user._id))
      return { success: true, transferred: true, idempotent: true, player: { id: String(player._id), name: String(player.name), birthDate: String(player.birthDate) }, team: preview.team, parentProfileUrl: profileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
    }
    if (String(player.birthDate || player.birthday || '') !== String(ticket.birthDate || '') || String(player.name || '') !== String(ticket.playerName || '')) throw error('TRANSFER_SOURCE_CHANGED', '原球员资料已变化，请在旧账号重新生成迁移码')
    const complete = ticket.registrationComplete === true || (ticket.registrationComplete == null && await registrationFinished(player))
    const nextName = String(event.name || '').trim()
    const nextBirthDate = String(event.birthDate || '').trim()
    if (complete) {
      if (nextName !== String(player.name || '').trim() || nextBirthDate !== String(player.birthDate || player.birthday || '')) throw error('TRANSFER_PLAYER_MISMATCH', '已完成球员的姓名或生日不可在换绑时修改')
    } else {
      if (await registrationFinished(player)) throw error('TRANSFER_SOURCE_CHANGED', '原球员登记已完成，请在旧账号重新生成迁移码')
      await assertNoProtectedHistory(player)
      const birth = /^\d{4}-\d{2}-\d{2}$/.test(nextBirthDate) ? new Date(nextBirthDate + 'T00:00:00Z') : null
      if (nextName.length < 2 || !birth || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== nextBirthDate || birth > new Date()) throw error('TRANSFER_PLAYER_MISMATCH', '请填写有效的姓名和出生日期')
      const today = new Date()
      const age = today.getFullYear() - birth.getUTCFullYear() - (today.getMonth() < birth.getUTCMonth() || (today.getMonth() === birth.getUTCMonth() && today.getDate() < birth.getUTCDate()) ? 1 : 0)
      if (age < 18) throw error('TRANSFER_SELF_AGE_REQUIRED', '未成年球员须按监护人登记')
    }
    if (String(player.linkedUserId || '') !== String(ticket.oldUserId || '')) throw error('TRANSFER_SOURCE_CHANGED', '原球员绑定已变化，请在旧账号重新生成迁移码')
    if (ticket.status !== 'approved' || !toTime(ticket.expiresAt) || toTime(ticket.expiresAt) <= Date.now()) throw error('TRANSFER_CODE_EXPIRED', '授权码已失效，请新账号重新发起')
    const linked = (await teamPlayers(preview.team.id, 500)).filter(item => String(item._id) !== String(player._id) && linkedTo(item, identity))
    const occupied = (await teamPlayers(preview.team.id, 500)).some(item => String(item._id) !== String(player._id) && !linkedTo(item, identity) &&
      !['archived', 'deleted'].includes(String(item.status || '').toLowerCase()) &&
      String(item.name || '').trim() === nextName && String(item.birthDate || item.birthday || '') === nextBirthDate)
    if (occupied) throw error('TRANSFER_PLAYER_CONFLICT', '同队还有相同姓名生日的球员，请联系球队管理员核对')
    const duplicates = []
    for (const item of linked) {
      if (String(item.name || '').trim() !== String(player.name || '').trim()) throw error('TRANSFER_EXISTING_PLAYER', '新账号已关联其他球员，请联系球队管理员核对')
      const invites = await assertDisposableDuplicate(item)
      duplicates.push({ player: item, invites })
    }
    const allInvites = (await rows('parent_profile_invites', { playerId: String(player._id) }, 20)).concat(duplicates.flatMap(item => item.invites))
    if (allInvites.length >= 20) throw error('TRANSFER_INVITES_REVIEW_REQUIRED', '资料邀请过多，请联系球队管理员核对')
    const tokens = allInvites.map(item => String(item.token || '')).filter(Boolean)
    const sessions = tokens.length ? await rows('parent_h5_sessions', { parentInvite: db.command.in(tokens), active: true }, 100) : []
    const now = db.serverDate()
    await db.runTransaction(async transaction => {
      const freshTicket = one(await transaction.collection('team_invitations').doc(String(ticket._id)).get())
      const freshPlayer = one(await transaction.collection('players').doc(String(player._id)).get())
      if (!freshTicket || freshTicket.status !== 'approved' || String(freshTicket.newUserId || '') !== String(identity.user._id) ||
          String(freshTicket.codeHash || '') !== codeHash || Number(freshTicket.attemptCount || 0) >= 5 ||
          !toTime(freshTicket.expiresAt) || toTime(freshTicket.expiresAt) <= Date.now() ||
          !freshPlayer || String(freshPlayer.linkedUserId || '') !== String(ticket.oldUserId || '')) {
        throw error('TRANSFER_SOURCE_CHANGED', '球员绑定已变化，请重新获取迁移码')
      }
      for (const item of duplicates) {
        const fresh = one(await transaction.collection('players').doc(String(item.player._id)).get())
        if (!fresh || !linkedTo(fresh, identity) || String(fresh.profileStatus || '') !== 'pending') throw error('TRANSFER_DUPLICATE_CHANGED', '新账号档案已变化，请联系球队管理员核对')
        await transaction.collection('players').doc(String(fresh._id)).update({ data: {
          status: 'archived', teamId: '', teamCode: '', archivedTeamId: preview.team.id,
          linkedUserId: '', linkedOpenId: '', playerUserId: '', playerOpenId: '',
          replacedByPlayerId: String(player._id), archivedReason: 'account_transfer_duplicate', archivedAt: now, updateTime: now
        } })
      }
      const playerPatch = {
        linkedUserId: String(identity.user._id), linkedOpenId: String(identity.openId || ''),
        playerUserId: String(identity.user._id), playerOpenId: String(identity.openId || ''),
        playerPhone: accountPhone, contactPhone: accountPhone,
        accountTransferredAt: now, accountTransferId: String(ticket._id), updateTime: now
      }
      if (!complete) Object.assign(playerPatch, {
        name: nextName, birthDate: nextBirthDate, birthday: nextBirthDate,
        profileStatus: 'pending', needsParentCompletion: true, identityStatus: 'pending',
        identityVerificationId: '', photoUrl: '', photoFileID: '', recentPortraitId: '',
        authorizationAgreed: true, authorizationConfirmedAt: now, incompleteProfileReplacedAt: now
      })
      await transaction.collection('players').doc(String(player._id)).update({ data: playerPatch })
      for (const invite of allInvites) if (String(invite.status || '') === 'active') {
        await transaction.collection('parent_profile_invites').doc(String(invite._id)).update({ data: { status: 'expired', expiredAt: now, updateTime: now } })
      }
      for (const session of sessions) await transaction.collection('parent_h5_sessions').doc(String(session._id)).update({ data: { active: false, revokedAt: now, updateTime: now } })
      await transaction.collection('team_invitations').doc(String(ticket._id)).update({ data: {
        status: 'redeemed', newUserId: String(identity.user._id), newOpenId: String(identity.openId || ''),
        archivedDuplicateIds: duplicates.map(item => String(item.player._id)), redeemedAt: now, updateTime: now
      } })
    })
    const transferredPlayer = Object.assign({}, player, { linkedUserId: identity.user._id, linkedOpenId: identity.openId, playerPhone: accountPhone, contactPhone: accountPhone }, complete ? {} : { name: nextName, birthDate: nextBirthDate, birthday: nextBirthDate, identityVerificationId: '', recentPortraitId: '' })
    const parentInvite = await ensureProfileInvite({ _id: preview.team.id, name: preview.team.name }, transferredPlayer, String(ticket.orgId || ''), String(identity.user._id))
    return { success: true, transferred: true, registrationComplete: complete, player: { id: String(player._id), name: String(transferredPlayer.name), birthDate: String(transferredPlayer.birthDate) }, team: preview.team, parentProfileUrl: profileInviteUrl(parentInvite.token, preview.invitation.participantMode) }
  }

  return { begin, finish, request, inspect, adoptIncomplete, overwriteIncomplete, priorChoice, registrationFinished }
}
