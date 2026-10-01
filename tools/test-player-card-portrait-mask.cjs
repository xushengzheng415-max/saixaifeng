const fs=require('node:fs'),assert=require('node:assert/strict')
const {PNG}=require('pngjs')
const {renderCard,makePortraitMask}=require('../cloudfunctions/webLoginApi/playerCardRender.cjs')
const background=new PNG({width:300,height:430}),portrait=new PNG({width:300,height:430}),mask=new PNG({width:300,height:430})
for(let i=0;i<portrait.data.length;i+=4){portrait.data[i]=255;portrait.data[i+3]=255;mask.data[i+3]=255}
for(let y=0;y<430;y++)for(let x=0;x<300;x++){const i=(y*300+x)*4;const v=y<320?255:y<340?128:0;mask.data[i]=mask.data[i+1]=mask.data[i+2]=v}
const encoded=PNG.sync.write(mask),converted=PNG.sync.read(makePortraitMask(encoded))
const result=PNG.sync.read(renderCard({backgroundBuffer:PNG.sync.write(background),maskBuffer:encoded,portraitBuffer:PNG.sync.write(portrait),template:{photo:{x:150,y:250,scale:200},layout:{},badges:{}},size:1}))
for(const [x,y,a] of [[150,200,255],[200,410,0],[150,330,128]]){const i=(y*300+x)*4;assert.equal(converted.data[i+3],a);assert.ok(Math.abs(result.data[i+3]-a)<=1,`alpha at ${x},${y} must be ${a}`)}
console.log('PASS: black clips portrait outside transparent card, white reveals, gray fades once')
