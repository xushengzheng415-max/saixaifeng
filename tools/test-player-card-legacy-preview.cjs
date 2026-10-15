const assert=require('node:assert/strict')
const {createPlayerCardPublish}=require('../cloudfunctions/webLoginApi/playerCardPublish.cjs')
const rows={
 player_card_publish_jobs:{job:{status:'review',templateId:'template',version:2,generatedPlayerIds:['player'],skipped:[]}},
 player_card_template_versions:{template_2:{templateId:'template',version:2,cardTypeId:'bronze',backgroundFileId:'cloud://background',maskFileId:'cloud://mask',preload:{type:'tournament',targetId:'event'},photo:{x:185,y:133,scale:115}}},
 players:{player:{_id:'player',name:'预览球员',jerseyNumber:0}},
 player_card_renders:{player_template_2:{status:'ready',fileId:'cloud://old-image-with-bleed',portraitFileId:'cloud://original-photo',crop:{zoom:1,x:0,y:0}}}
}
const db={collection:name=>({doc:id=>({get:async()=>({data:rows[name]?.[id]||null})})})}
let uploads=0
const cloud={database:()=>db,uploadFile:async()=>{uploads++;throw Error('preview must not persist cards')},getTempFileURL:async({fileList})=>({fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://fixture/'+fileID.slice(8)}))})}
;(async()=>{
 const service=createPlayerCardPublish({cloud})
 const response=await service.previews('job',0,24,{dynamicReview:true})
 assert.equal(response.historicalBatch,true)
 assert.equal(response.cards[0].imageUrl,'')
 assert.equal(response.cards[0].cardScene.assets.mask,'https://fixture/mask')
 assert.equal(response.cards[0].cardScene.assets.portrait,'https://fixture/original-photo')
 assert.equal(response.cards[0].cardScene.values.number,'0')
 assert.equal(uploads,0)
 const legacy=await service.previews('job',0,24)
 assert.equal(legacy.cards[0].imageUrl,'https://fixture/old-image-with-bleed')
 delete rows.player_card_renders.player_template_2.portraitFileId
 const missing=await service.previews('job',0,24,{dynamicReview:true})
 assert.equal(missing.cards[0].status,'failed');assert.ok(!missing.cards[0].imageUrl)
 console.log('PASS: historical review uses snapshot mask and original portrait dynamically; no stale PNG fallback or persistent regeneration; legacy readers preserved')
})().catch(error=>{console.error(error);process.exitCode=1})
