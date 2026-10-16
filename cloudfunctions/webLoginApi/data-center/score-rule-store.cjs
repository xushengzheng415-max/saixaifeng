'use strict'
const crypto=require('node:crypto'),{readAll,readByIds}=require('./reader.cjs'),rules=require('./score-rules.cjs')
const SETTINGS='platform_settings',CONFIG_ID='player-card-score-rules'
const floorId=(version,playerId)=>'card-score-floor-'+crypto.createHash('sha256').update(JSON.stringify([version,String(playerId)])).digest('hex')
async function config(db){return (await readAll(db,SETTINGS,{_id:CONFIG_ID}))[0]||null}
async function context(db,playerIds=[]){
  const row=await config(db),active=row?.active||rules.defaults()
  const parameters=rules.parameters(active.parameters),version=String(active.version||'')
  if(!version)throw Object.assign(new Error('积分规则版本缺失，请联系平台核查'),{code:'CARD_RULE_INVALID'})
  const floors=active.floorVersion?await readByIds(db,SETTINGS,'_id',playerIds.map(id=>floorId(active.floorVersion,id))):[]
  if(floors.some(row=>row.ruleVersion!==active.floorVersion||!['bronze','silver','gold'].includes(row.tier)))throw Object.assign(new Error('卡级保留记录异常，请联系平台核查'),{code:'CARD_RULE_FLOOR_INVALID'});const byId=new Map(floors.map(row=>[String(row.playerId),row.tier]))
  const profiles=await readByIds(db,'players','_id',playerIds,{fields:{playerCardSchemaVersion:true,playerCardVersion:true,playerCardTier:true}}),tiers=['bronze','silver','gold']
  for(const profile of profiles)if(['player-card/4','player-card/5'].includes(profile.playerCardSchemaVersion)&&Number.isSafeInteger(profile.playerCardVersion)&&profile.playerCardVersion>0&&tiers.includes(profile.playerCardTier)){const id=String(profile._id),earned=profile.playerCardTier;if(tiers.indexOf(earned)>tiers.indexOf(byId.get(id)))byId.set(id,earned)}
  return {rules:{...active,parameters},floorById:byId}
}
module.exports={SETTINGS,CONFIG_ID,floorId,config,context}
