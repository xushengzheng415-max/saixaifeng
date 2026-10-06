const assert=require('node:assert/strict')
const {db,cloud,table,call}=require('./test-player-card-preload.cjs')
const {createPlayerCardTemplates,normalizeLayout}=require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
async function main() {
  const layout=normalizeLayout();layout.name.font='brush';layout.name.fillMode='gradient';layout.number.x=43;layout.name.shadow.enabled=true
  const photo={x:190,y:53,scale:90},badges={nationality:{x:89,y:354,size:28},team:{x:190,y:354,size:26}}
  const saved=await call('savePlayerCardLayoutPreset',{title:'立洋杯标准排版',layout,photo,badges,preload:{type:'player',targetId:'p1'},backgroundFileId:'must-not-copy',tier:'gold'})
  assert.equal(saved.success,true,saved.error)
  const fresh=createPlayerCardTemplates({cloud,authenticateWebSession:async()=>({success:true,principalType:'platform_owner',user:{isPlatformOwner:true},userId:'other-owner'})})
  const list=await fresh({action:'listPlayerCardLayoutPresets'})
  assert.equal(list.presets[0].id,saved.preset.id,'layout remains available across sessions')
  const detail=await fresh({action:'getPlayerCardLayoutPreset',presetId:saved.preset.id})
  assert.deepEqual(detail.preset.layout,layout);assert.deepEqual(detail.preset.photo,photo);assert.deepEqual(detail.preset.badges,badges)
  const record=table('player_card_layout_presets').get(saved.preset.id)
  for(const key of ['backgroundFileId','maskFileId','preload','tier','playerId']) assert(!Object.hasOwn(record,key),'layout reuse excludes '+key)
  detail.preset.layout.name.x=20
  assert.notEqual((await call('getPlayerCardLayoutPreset',{presetId:saved.preset.id})).preset.layout.name.x,20,'applying changes a copy, not the saved layout')
  assert.equal((await call('savePlayerCardLayoutPreset',{title:'立洋杯标准排版',layout,photo,badges})).code,'CARD_LAYOUT_PRESET_EXISTS')
  assert.equal((await call('listPlayerCardLayoutPresets',{keyword:'立洋杯'})).presets.length,1)
  assert.equal((await call('listPlayerCardLayoutPresets',{keyword:'.*'})).presets.length,0)
  assert.equal((await call('savePlayerCardLayoutPreset',{authToken:'organizer',title:'越权排版',layout,photo,badges})).code,'CARD_TEMPLATE_FORBIDDEN')
  assert.equal(table('player_card_layout_presets').size,1)
  assert.equal((await call('savePlayerCardLayoutPreset',{title:'错误排版',layout:{...layout,name:{...layout.name,font:'http://evil'}}})).code,'CARD_TEMPLATE_TEXT_STYLE_INVALID')
  assert.equal(table('player_card_templates').size,0,'saving layout does not create or publish a card')
  console.log('PASS: reusable layout persistence, styles/photo/badges, copy isolation, excluded assets/scope/tier, literal search, validation and owner permission')
}
main().catch(error=>{console.error(error);process.exitCode=1})
