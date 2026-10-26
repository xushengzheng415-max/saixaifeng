import assert from 'node:assert/strict'
import {renderTeamInvitationPosters,TEAM_ENTRY_STEPS} from '../web-admin-vue/src/utils/teamInvitationPoster.js'
const canvases=[]
function createCanvas(){
  const commands=[]
  const canvas={width:0,height:0,commands,toDataURL:type=>{assert.equal(type,'image/png');return `data:image/png;base64,fixture-${canvases.length}`}}
  const context={font:'30px',textAlign:'left',fillStyle:'',createLinearGradient:()=>({addColorStop(){}}),
    measureText(text){const size=Number(this.font.match(/(\d+)px/)?.[1] || 30);return {width:[...String(text)].length*size}},
    fillRect(x,y,w,h){assert.ok(y+h<=canvas.height,'Background/card must fit canvas')},
    drawImage(qr,x,y,w,h){assert.equal(qr.marker,'same-invite');assert.ok(y+h<canvas.height);commands.push({qr:true,x,y,w,h})},
    fillText(text,x,y){assert.ok(y<canvas.height-15,'Text must not be clipped');commands.push({text,x,y})}}
  canvas.getContext=()=>context;canvases.push(canvas);return canvas
}
const invite={envVersion:'release',testOnly:false,qrCodeUrl:'fixture://same-invite'}
const options={invitation:invite,createCanvas,loadImage:async url=>{assert.equal(url,invite.qrCodeUrl);return {marker:'same-invite'}}}
await renderTeamInvitationPosters({...options,tournament:{name:'隔离测试足球联赛',startDate:'2026-11-01',endDate:'2026-11-03',city:'郑州市'}})
assert.equal(canvases.length,2)
assert.ok(canvases[0].commands.some(row=>row.text==='报名组别：扫码后选择开放组别'))
assert.ok(canvases[1].commands.filter(row=>row.text).map(row=>row.text).join('').includes(TEAM_ENTRY_STEPS[0]))
assert.equal(canvases.reduce((count,canvas)=>count+canvas.commands.filter(row=>row.qr).length,0),2)
const initialHeight=canvases[0].height
await renderTeamInvitationPosters({...options,tournament:{name:'跨区域青少年足球赛事'.repeat(12),location:'场馆详细地址'.repeat(30)}})
assert.ok(canvases[2].height>initialHeight,'Long database text must expand the poster')
await assert.rejects(()=>renderTeamInvitationPosters({...options,invitation:{...invite,testOnly:true}}),/正式版/)
await assert.rejects(()=>renderTeamInvitationPosters({...options,invitation:{...invite,qrCodeUrl:''}}),/正式版/)
await assert.rejects(()=>renderTeamInvitationPosters({...options,loadImage:async()=>{throw Error('image failed')}}),/image failed/)
console.log('PASS: same official invite QR in both posters, generic division selection, onboarding steps, long text, invalid versions and image failures')
