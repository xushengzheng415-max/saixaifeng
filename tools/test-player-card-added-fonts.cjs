const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto')
const renderer=require('../cloudfunctions/webLoginApi/playerCardRender.cjs')
const {normalizeLayout}=require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
const {contract}=require('../cloudfunctions/webLoginApi/playerCardTextStyle.cjs')
const {PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const background=fs.readFileSync('platform-admin-vue/public/images/player-card-layers/gold-background.png')
const mask=fs.readFileSync('platform-admin-vue/public/images/player-card-layers/foreground-mask-source.png')
const layout=normalizeLayout(),outputDir='output/player-card-fonts-20261028'
fs.mkdirSync(outputDir,{recursive:true})
const sheets=[]
const shared=fs.readFileSync('shared/player-card/draw.js','utf8')
for(const font of contract.fonts){
  assert.ok(shared.includes(font.family),font.id+' must resolve in shared canvas renderer')
  const field=font.category==='number'?'number':'name'
  const styled=normalizeLayout({...layout,[field]:{...layout[field],font:font.id,color:'#ffffff',stroke:{width:1,color:'#000000'}}})
  assert.equal(normalizeLayout(JSON.parse(JSON.stringify(styled)))[field].font,font.id)
  const image=renderer.renderCard({backgroundBuffer:background,maskBuffer:mask,template:{layout:styled},player:{name:'铁栋泽',jerseyNumber:'10',position:'FW',jerseyName:'TIE D.Z.'},size:1})
  fs.writeFileSync(outputDir+'/'+font.id+'.png',image)
  sheets.push({id:font.id,category:font.category,bytes:image})
}
for(const category of ['chinese','number']){
  const digests=sheets.filter(s=>s.category===category).map(s=>crypto.createHash('sha256').update(s.bytes).digest('hex'))
  assert.equal(new Set(digests).size,digests.length,'Each font must change real exported pixels; no silent fallback: '+category)
}
const scene=require('../cloudfunctions/webLoginApi/playerCardDynamic.cjs')
const makePlayer={_id:'font-preview',name:'铁栋泽',playerCardSourceFileId:'cloud://fixture/photo.png'}
const snapshot={templateId:'font-preview',version:1,cardTypeId:'bronze',backgroundFileId:'cloud://fixture/bg.png',maskFileId:'cloud://fixture/mask.png',layout}
scene.descriptor({}, {collection:()=>({doc:()=>({get:async()=>({data:null})})})},makePlayer,snapshot,{portraitFileId:'cloud://fixture/photo.png'},{resolveUrls:async ids=>new Map(ids.filter(Boolean).map(id=>[id,'https://example.invalid/'+id.split('/').pop()]))}).then(dto=>{
  for(const font of contract.fonts)assert.equal(dto.cardScene.fonts.find(row=>row.name===font.files[0]).family,font.family)
  console.log('PASS: 10 fonts normalize and survive JSON roundtrip; unique real PNG output for 6 Chinese and 4 number fonts; shared canvas and scene family metadata match')
}).catch(error=>{console.error(error);process.exitCode=1})
