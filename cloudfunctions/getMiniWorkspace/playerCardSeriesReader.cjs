'use strict'
const crypto=require('node:crypto')
const gid=(playerId,templateId)=>crypto.createHash('sha256').update(JSON.stringify([String(playerId),String(templateId)])).digest('hex')
async function resolveSeriesPlayer(db,player,score,document){
  const selected=String(player.playerCardDisplayTemplateId||'')
  if(!selected||!['bronze','silver','gold'].includes(score?.tier)||score?.status!=='ready')return player
  const template=await document(db,'player_card_templates',selected)
  if(template?.cardKind!=='progression'||!template.setId)return player
  const [set,anchor]=await Promise.all([document(db,'player_card_sets',template.setId),document(db,'player_card_library',gid(player._id,selected))])
  const validGrant=(grant,id)=>grant&&grant.status!=='revoked'&&String(grant.playerId)===String(player._id)&&String(grant.templateId)===String(id)
  if(set?.kind!=='progression'||set.status!=='published'||!set.published||!validGrant(anchor,selected))return player
  const target=set.published.members?.[score.tier]?.templateId
  if(!target||target===selected)return player
  const grant=await document(db,'player_card_library',gid(player._id,target))
  if(!validGrant(grant,target))return player
  return {...player,playerCardDisplayTemplateId:target}
}
module.exports={resolveSeriesPlayer}
