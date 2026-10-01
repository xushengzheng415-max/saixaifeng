const crypto = require('node:crypto')
const { renderCard } = require('./playerCardRender.cjs')
const preload = require('./playerCardPreload.cjs')

const TEMPLATES = 'player_card_templates'
const VERSIONS = 'player_card_template_versions'
const STATES = 'player_card_template_states'
const RENDERS = 'player_card_renders'
const JOBS = 'player_card_publish_jobs'
const RENDER_VERSION = 'resvg/1'
const TYPES = ['bronze', 'silver', 'gold']

const dataOf = result => Array.isArray(result && result.data) ? result.data[0] : result && result.data
async function document(db, collection, id) {
  try { return dataOf(await db.collection(collection).doc(String(id)).get()) }
  catch (error) {
    if (/document.*(not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(String(error.message || error.errMsg || error.code || ''))) return null
    throw error
  }
}
const versionId = (templateId, version) => `${templateId}_${version}`
const renderId = (playerId, templateId, version) => `${playerId}_${templateId}_${version}`

async function activeTemplate(db, tier, scope) {
  if (!TYPES.includes(String(tier))) return null
  const state = await document(db, STATES, preload.stateId(tier, scope))
  if (!state || !state.active) return null
  const snapshot = await document(db, VERSIONS, versionId(state.active.templateId, state.active.version))
  return snapshot ? { ...snapshot, stateRevision: Number(state.revision || 0) } : null
}

async function asset(cloud, fileId, maxBytes = 5 * 1024 * 1024) {
  if (!String(fileId || '').startsWith('cloud://')) throw new Error('球员卡素材文件无效')
  const result = await cloud.downloadFile({ fileID: fileId })
  if (!result.fileContent || result.fileContent.length > maxBytes) throw new Error('球员卡素材缺失或过大')
  return result.fileContent
}

function cardFacts(player, team, score) {
  if (!score || score.status !== 'ready' || !score.tier) throw new Error('生涯积分尚未核定')
  return {
    name: String(player.name || '').trim(),
    jerseyNumber: String(player.jerseyNumber || ''),
    jerseyName: String(player.jerseyName || ''),
    position: String(player.position || ''),
    height: player.height == null ? null : player.height,
    weight: player.weight == null ? null : player.weight,
    nationality: String(player.nationality || ''),
    teamId: String(player.teamId || ''),
    teamName: String(team && (team.name || team.teamName) || ''),
    tier: score.tier,
    scoreVersion: score.scoreVersion || ''
  }
}

async function renderPlayer(cloud, db, player, snapshot, score, overrides = {}) {
  const team = player.teamId ? await document(db, 'teams', player.teamId) : null
  const facts = cardFacts(player, team, score)
  const portraitId = String(overrides.portraitFileId || player.playerCardSourceFileId || '')
  if (!portraitId) throw new Error('标准形象照缺失，需先补拍')
  const logoId = String(team && (team.logoTransparent || team.logo || team.logoUrl) || '')
  const [backgroundBuffer, maskBuffer, portraitBuffer, teamLogoBuffer] = await Promise.all([
    asset(cloud, snapshot.backgroundFileId, 2 * 1024 * 1024),
    asset(cloud, snapshot.maskFileId, 2 * 1024 * 1024),
    asset(cloud, portraitId),
    logoId.startsWith('cloud://') ? asset(cloud, logoId, 1024 * 1024).catch(() => null) : null
  ])
  const png = renderCard({ backgroundBuffer, maskBuffer, portraitBuffer, teamLogoBuffer,
    template: snapshot, player: facts, crop: overrides.crop || player.playerCardCrop,
    personalLayout: overrides.layout || player.playerCardLayout })
  return { png, facts, portraitId }
}

async function generate(cloud, db, player, snapshot, score, overrides = {}) {
  const result = await renderPlayer(cloud, db, player, snapshot, score, overrides)
  const digest = crypto.createHash('sha256').update(result.png).digest('hex')
  const file = await cloud.uploadFile({ cloudPath: `restricted/player-cards/generated/${snapshot.templateId}/v${snapshot.version}/${player._id}/${crypto.randomBytes(10).toString('hex')}.png`, fileContent: result.png })
  return { fileId: file.fileID, digest, facts: result.facts, portraitId: result.portraitId }
}

async function savedPlayers(db, tier, scopeValue) {
  const scope = preload.normalizePreload(scopeValue)
  let allowedIds = null
  if (scope.type === 'tournament') {
    allowedIds = new Set()
    const snapshots = []
    let cursor = ''
    for (;;) {
      const where = { tournamentId:scope.targetId, ...(cursor ? { _id:db.command.gt(cursor) } : {}) }
      const page = (await db.collection('roster_snapshots').where(where).orderBy('_id','asc').limit(100).get()).data || []
      // Only the latest submitted snapshot for each team is authoritative.
      for (const row of page) snapshots.push(row)
      if (page.length < 100) break
      cursor = String(page[page.length-1]._id)
    }
    const latest = new Map()
    for (const row of snapshots) {
      if (!row.teamId) continue
      const old = latest.get(row.teamId)
      if (!old || Number(row.version || 0) > Number(old.version || 0)) latest.set(row.teamId,row)
    }
    for (const row of latest.values()) if (['approved','locked'].includes(row.status)) {
      for (const id of row.playerIds || []) if (typeof id === 'string') allowedIds.add(id)
      for (const item of row.players || []) if (item && (item.playerId || item.id || item._id)) allowedIds.add(String(item.playerId || item.id || item._id))
    }
  }
  const rows = []
  let after = ''
  for (;;) {
    const where = after ? { _id: db.command.gt(after) } : {}
    const page = (await db.collection('players').where(where).orderBy('_id', 'asc').limit(100).get()).data || []
    for (const player of page) if ((scope.type === 'platform' || (scope.type === 'player' && String(player._id) === scope.targetId) || (scope.type === 'team' && String(player.teamId || '') === scope.targetId) || (scope.type === 'tournament' && allowedIds.has(String(player._id)))) && player.playerCardFileId && String(player.playerCardBackgroundId || player.playerCardTier || '') === tier) rows.push(player)
    if (page.length < 100) return rows
    after = String(page[page.length - 1]._id)
  }
}

async function signedCard(cloud, db, player, type, scope) {
  const snapshot = await activeTemplate(db, type, scope)
  if (!snapshot) return { status: 'unavailable', fileId: '', templateVersion: 0 }
  const render = await document(db, RENDERS, renderId(player._id, snapshot.templateId, snapshot.version))
  if (!render || render.status !== 'ready' || Number(render.cardDataVersion) !== Number(player.playerCardVersion || 0)) {
    return { status: player.playerCardFileId ? 'pending' : 'unavailable', fileId: '', templateVersion: snapshot.version }
  }
  const urls = (await cloud.getTempFileURL({ fileList: [render.fileId] })).fileList || []
  return { status: 'ready', fileId: render.fileId, url: urls.find(item => item.fileID === render.fileId)?.tempFileURL || '',
    templateId: snapshot.templateId, templateVersion: snapshot.version, cardDataVersion: render.cardDataVersion, renderVersion: RENDER_VERSION }
}

module.exports = { TEMPLATES, VERSIONS, STATES, RENDERS, JOBS, TYPES, RENDER_VERSION,
  document, versionId, renderId, activeTemplate, asset, renderPlayer, generate, savedPlayers, signedCard }
