// updateTeam - 更新球队信息（赛事中心后台用）
// v2.0 精简：只更新 v2.0 规范中的字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

async function syncTeamProfileReferences(teamId, before, after) {
  const id = String(teamId || '').trim()
  if (!id || !before || !after) return { changed: false, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const value = (record, keys) => { for (const key of keys) if (record && record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return String(record[key]).trim(); return '' }
  const beforeName = value(before, ['name', 'teamName']), afterName = value(after, ['name', 'teamName'])
  const beforeLogo = value(before, ['logo', 'logoUrl', 'logoTransparent', 'teamLogo']), afterLogo = value(after, ['logo', 'logoUrl', 'logoTransparent', 'teamLogo'])
  const nameChanged = beforeName !== afterName, logoChanged = beforeLogo !== afterLogo
  if (!nameChanged && !logoChanged) return { changed: false, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const patch = {}; if (nameChanged) patch.teamName = afterName; if (logoChanged) Object.assign(patch, { teamLogo: afterLogo, logo: afterLogo, logoUrl: afterLogo })
  const counts = { changed: true, tournamentTeams: 0, players: 0, matches: 0, invitations: 0 }
  const updateRows = async (collection, rows, data) => { for (const row of rows || []) if (row && row._id) await db.collection(collection).doc(row._id).update({ data: { ...data, updateTime: db.serverDate() } }); return (rows || []).filter(row => row && row._id).length }
  counts.tournamentTeams = await updateRows('tournament_teams', (await db.collection('tournament_teams').where({ teamId: id }).limit(1000).get()).data || [], patch)
  const invitationRows = (await db.collection('team_invitations').where({ teamId: id }).limit(1000).get()).data || []
  counts.invitations = await updateRows('team_invitations', invitationRows.filter(row => !['cancelled', 'canceled', 'expired', 'rejected'].includes(String(row.status || '').toLowerCase())), patch)
  if (nameChanged) counts.players = await updateRows('players', (await db.collection('players').where(db.command.or([{ teamId: id }, { teamCode: id }])).limit(1000).get()).data || [], { teamName: afterName })
  const matches = (await db.collection('matches').where(db.command.or([{ homeTeamId: id }, { awayTeamId: id }])).limit(1000).get()).data || []
  const historical = new Set(['completed', 'finished', 'archived', 'cancelled', 'canceled'])
  for (const match of matches) {
    if (!match || !match._id || historical.has(String(match.status || '').toLowerCase())) continue
    const matchPatch = {}
    if (String(match.homeTeamId || '') === id) { if (nameChanged) matchPatch.homeTeamName = afterName; if (logoChanged) matchPatch.homeTeamLogo = afterLogo }
    if (String(match.awayTeamId || '') === id) { if (nameChanged) matchPatch.awayTeamName = afterName; if (logoChanged) matchPatch.awayTeamLogo = afterLogo }
    if (Object.keys(matchPatch).length) { await db.collection('matches').doc(match._id).update({ data: { ...matchPatch, updateTime: db.serverDate() } }); counts.matches += 1 }
  }
  return counts
}

exports.main = async (event) => {
  try {
    const { id, _id, name, shortName, teamCode, province, city, cityName, teamType, establishedDate, logo, description, claimStatus, ownerPhone, creatorId } = event
    const docId = id || _id
    if (!docId) return { success: false, error: '缺少球队ID' }

    const currentResult = await db.collection('teams').doc(docId).get()
    const before = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
    if (!before) return { success: false, error: '球队不存在或已删除' }
    const updateData = {}
    // 核心字段
    if (name !== undefined) updateData.name = name
    if (shortName !== undefined) updateData.shortName = shortName
    if (province !== undefined) updateData.provinceCode = province
    if (city !== undefined) updateData.cityCode = city
    if (cityName !== undefined) updateData.cityName = cityName
    if (teamCode !== undefined) updateData.teamCode = teamCode
    if (teamType !== undefined) updateData.teamType = teamType
    if (ownerPhone !== undefined) {
      updateData.ownerPhone = ownerPhone
      updateData.creatorPhone = ownerPhone
      updateData.contactPhone = ownerPhone
      updateData.phoneNumber = ownerPhone
      updateData.phone = ownerPhone
      updateData.mobile = ownerPhone
    }
    // 可选字段
    if (establishedDate !== undefined) updateData.establishedDate = establishedDate
    if (logo !== undefined) updateData.logo = logo
    if (description !== undefined) updateData.description = description
    // 管理字段
    if (claimStatus !== undefined) updateData.claimStatus = claimStatus
    if (creatorId !== undefined) updateData.creatorId = creatorId

    updateData.updateTime = db.serverDate()
    await db.collection('teams').doc(docId).update({ data: updateData })
    const teamSync = await syncTeamProfileReferences(docId, before, { ...before, ...updateData })
    console.log('[updateTeam] 更新成功:', docId)
    return { success: true, teamSync }
  } catch (err) {
    console.error('[updateTeam] 错误:', err)
    return { success: false, error: err.message }
  }
}
