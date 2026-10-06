const crypto = require('node:crypto')
const { renderCard } = require('./playerCardRender.cjs')
const preload = require('./playerCardPreload.cjs')

const TEMPLATES = 'player_card_templates'
const VERSIONS = 'player_card_template_versions'
const STATES = 'player_card_template_states'
const RENDERS = 'player_card_renders'
const JOBS = 'player_card_publish_jobs'
const {RENDER_VERSION}=require('./playerCardReader.cjs')
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

async function activeTemplate(db, tier, scope, templateId) {
  if (!TYPES.includes(String(tier))) return null
  let state = await document(db, STATES, preload.stateId(tier, scope, templateId))
  if (!state && templateId) { const base = await document(db,STATES,tier); if(base?.active?.templateId === templateId) state=base }
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

function cardFacts(player, team, score, snapshot) {
  const personalCustom=preload.normalizePreload(snapshot?.preload).type==='player'
  if(score?.status==='test_data_excluded')throw new Error('测试资料不能生成正式球员卡')
  if (!personalCustom&&(!score || score.status !== 'ready' || !score.tier)) throw new Error('生涯积分尚未核定')
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
    tier: score?.tier || snapshot?.cardTypeId || snapshot?.tier || '',
    scoreVersion: score?.scoreVersion || ''
  }
}

async function renderPlayer(cloud, db, player, snapshot, score, overrides = {}) {
  const team = player.teamId ? await document(db, 'teams', player.teamId) : null
  const cardPlayer=preload.normalizePreload(snapshot?.preload).type==='player'&&snapshot.positionOverride&&!player.position
    ? {...player,position:snapshot.positionOverride}:player
  const facts = cardFacts(cardPlayer, team, score, snapshot)
  const portraitId = String(overrides.portraitFileId || player.playerCardSourceFileId || '')
  if (!portraitId) throw new Error('标准形象照缺失，需先补拍')
  const logoId = require('./playerCardSource.cjs').teamLogoFileId(team)
  const [backgroundBuffer, maskBuffer, portraitBuffer, teamLogoBuffer] = await Promise.all([
    asset(cloud, snapshot.backgroundFileId, 2 * 1024 * 1024),
    asset(cloud, snapshot.maskFileId, 2 * 1024 * 1024),
    asset(cloud, portraitId),
    logoId.startsWith('cloud://') ? asset(cloud, logoId, 1024 * 1024).then(buffer=>require('./playerCardRender.cjs').isTransparentPng(buffer)?buffer:null).catch(() => null) : null
  ])
  await require('./playerCardRender.cjs').ensureFonts()
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

async function savedPlayers(db, tier, scopeValue, templateId) {
  const scope = preload.normalizePreload(scopeValue)
  let allowedIds = null
  if (templateId) {
    const grants = await preload.readAll(db, 'player_card_library', {templateId})
    const players = []
    for (const grant of grants) {
      if (!grant.fileId) continue
      const player = await document(db, 'players', grant.playerId)
      if (player) players.push({...player, playerCardSourceFileId:grant.portraitFileId || player.playerCardSourceFileId, playerCardCrop:grant.crop || player.playerCardCrop, preloadLibraryVersion:Number(grant.revision || 0)})
    }
    return players
  }
  if (scope.type === 'tournament') allowedIds = await preload.tournamentPlayerIds(db, scope.targetId)
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

async function publicationPlayers(db,tier) {
  const rows=[];let after=''
  for(;;){
    const page=(await db.collection('players').where(after?{_id:db.command.gt(after)}:{}).field({_id:true,playerCardFileId:true,playerCardBackgroundId:true,playerCardTier:true}).orderBy('_id','asc').limit(100).get()).data||[]
    for(const player of page){
      if(player.playerCardFileId){
        const type=String(player.playerCardBackgroundId||player.playerCardTier||'')
        if(!TYPES.includes(type))throw new Error('历史成卡缺少卡种关联，需先修复后发布')
        if(type===tier)rows.push(player)
      }else rows.push(player)
    }
    if(page.length<100)return rows
    after=String(page[page.length-1]._id)
  }
}

async function signedCard(cloud, db, player, type) {
  const [card] = await require('./playerCardReader.cjs').readCards(cloud,db,[{...player,playerCardBackgroundId:type}],{baseOnly:true})
  return {...card,url:card.cardUrl,templateVersion:card.publishedVersion}
}

module.exports = { TEMPLATES, VERSIONS, STATES, RENDERS, JOBS, TYPES, RENDER_VERSION,
  document, versionId, renderId, activeTemplate, asset, renderPlayer, generate, savedPlayers, publicationPlayers, signedCard }
