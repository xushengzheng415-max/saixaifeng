const assert=require('node:assert/strict'),crypto=require('node:crypto')
const {createPublicTournamentPlayerCard}=require('../cloudfunctions/webLoginApi/publicTournamentPlayerCard.cjs')
const player={_id:'p',playerCardDisplayTemplateId:'template'},grantId=crypto.createHash('sha256').update(JSON.stringify(['p','template'])).digest('hex')
const scope={type:'tournament',targetId:'cup'},rows={players:{p:player},player_card_templates:{template:{_id:'template',tier:'bronze',status:'published',cardKind:'progression',setId:'set',published:{preload:scope}}},player_card_library:{[grantId]:{playerId:'p',templateId:'template',grantSource:'platform_confirmed_award',preload:scope}},player_card_sets:{set:{status:'published',kind:'progression',published:{preload:scope,members:{bronze:{templateId:'template'}}}}}}
const calls=[];let listed=true,failedRead=false
const db={collection:name=>({doc:id=>({get:async()=>{if(failedRead&&name==='player_card_templates')throw Error('database unavailable');return {data:structuredClone(rows[name]?.[id]||null)}}})})}
const handler=createPublicTournamentPlayerCard({cloud:{database:()=>db},handleFanRankings:async()=>({success:true,data:{players:listed?[{playerId:'p'}]:[]}}),readCardsForPlayer:async(c,d,players,options)=>{calls.push(options);return [{playerId:'p',status:'ready',cardUrl:'https://fixture/complete.png',templateId:options.baseOnly?'base':'template',publishedVersion:6}]}})
const event={playerId:'p',tournamentId:'cup'}
;(async()=>{
 assert.equal((await handler(event)).card.templateId,'template');assert.equal(calls.at(-1).baseOnly,false);assert.equal(calls.at(-1).restrictedAssets,true)
 const original=structuredClone(rows)
 for(const mutation of [()=>rows.player_card_library[grantId].status='revoked',()=>rows.player_card_library[grantId].preload={type:'tournament',targetId:'other'},()=>rows.player_card_templates.template.published.preload={type:'tournament',targetId:'other'},()=>rows.player_card_templates.template.cardKind='honor',()=>rows.player_card_sets.set.published.preload={type:'tournament',targetId:'other'},()=>rows.player_card_sets.set.published.members={},()=>delete rows.player_card_library[grantId]]){
  for(const key of Object.keys(original))rows[key]=structuredClone(original[key]);mutation();assert.equal((await handler(event)).card.templateId,'base');assert.equal(calls.at(-1).baseOnly,true)
 }
 for(const key of Object.keys(original))rows[key]=structuredClone(original[key])
 listed=false;const n=calls.length;assert.equal((await handler(event)).code,'PUBLIC_CARD_NOT_LISTED');assert.equal(calls.length,n)
 listed=true;failedRead=true;await assert.rejects(handler(event),/database unavailable/)
 console.log('PASS: only listed player + explicitly awarded current-event progression display; hidden original pixels restricted; revoked/foreign-event/honor/missing grants stay base-only; public list and read failures cannot be bypassed')
})().catch(e=>{console.error(e);process.exitCode=1})
