const assert = require('node:assert/strict')
const fs = require('node:fs'), path=require('node:path'),crypto=require('node:crypto')
const {normalizeLayout} = require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
const {normalizeTextStyle,gradientCoordinates} = require('../cloudfunctions/webLoginApi/playerCardTextStyle.cjs')
const {renderCard} = require('../cloudfunctions/webLoginApi/playerCardRender.cjs')
const {PNG} = require('../cloudfunctions/webLoginApi/node_modules/pngjs')
assert.equal(normalizeTextStyle().font,'sans')
for(const value of [{font:'external-url'},{gradient:{start:'url(evil)'}},{gradient:{angle:361}},{stroke:{width:50}},{shadow:{opacity:2}},{letterSpacing:100},{shadow:[]}]) assert.throws(()=>normalizeTextStyle(value))
assert.deepEqual(gradientCoordinates(0),{x1:0,y1:50,x2:100,y2:50})
const layout=normalizeLayout()
assert.equal(layout.name.fillMode,'solid','old layouts remain valid with default text styles')
const styled=normalizeLayout({...layout,name:{...layout.name,font:'brush',fillMode:'gradient',letterSpacing:1,
  gradient:{start:'#fff3ba',middle:'#e9c46b',end:'#ad7623',middleEnabled:true,angle:90},stroke:{width:.6,color:'#755018'},shadow:{enabled:true,color:'#000000',opacity:.6,x:1,y:2,blur:1}},
  number:{...layout.number,font:'sport',fillMode:'gradient',stroke:{width:.6,color:'#755018'}}})
assert.deepEqual(normalizeLayout(styled),styled,'style payload survives normalization unchanged')
const root=path.join(__dirname,'..'),background=fs.readFileSync(path.join(root,'web-admin-vue/public/images/player-card-layers/gold-background.png')),
  mask=fs.readFileSync(path.join(root,'web-admin-vue/public/images/player-card-layers/foreground-mask-source.png')),
  portrait=fs.readFileSync(path.join(root,'cloudfunctions/webLoginApi/player-card-preview-portrait.png'))
const input={backgroundBuffer:background,maskBuffer:mask,portraitBuffer:portrait,
  player:{name:'张宇轩',jerseyNumber:'10',position:'FW',jerseyName:'ZHANG YUXUAN',height:178,weight:72,nationality:'中国'},template:{layout:styled,photo:{x:150,y:35,scale:108}}}
const plain=renderCard({...input,template:{...input.template,layout}}),output=renderCard(input)
const digest=value=>crypto.createHash('sha256').update(value).digest('hex')
for(const effect of [{font:'brush'},{fontStyle:'italic'},{letterSpacing:3},{fillMode:'gradient'}, {stroke:{width:1,color:'#ffffff'}}, {shadow:{enabled:true,color:'#000000',opacity:.8,x:2,y:3,blur:2}}]) {
  const fields=normalizeLayout({...layout,name:{...layout.name,...effect}})
  assert.notEqual(digest(plain),digest(renderCard({...input,template:{...input.template,layout:fields}})),JSON.stringify(effect)+' changes actual pixels')
}
assert.equal(PNG.sync.read(output).width,900);assert.equal(PNG.sync.read(output).height,1290)
assert.notEqual(crypto.createHash('sha256').update(plain).digest('hex'),crypto.createHash('sha256').update(output).digest('hex'),'styles change actual PNG pixels')
assert.deepEqual(renderCard(input),output,'same renderer and inputs produce identical output')
if(process.env.PLAYER_CARD_STYLE_OUTPUT) fs.writeFileSync(process.env.PLAYER_CARD_STYLE_OUTPUT,output)
console.log('PASS: legacy styles, gradients, stroke/shadow/font validation, actual rendered PNG and deterministic output')
