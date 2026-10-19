const assert=require('node:assert/strict'),fs=require('fs'),Module=require('module'),path=require('path')
const {parseTables}=require('../cloudfunctions/webLoginApi/refereeReportAnalysis.cjs'),images=require('../cloudfunctions/webLoginApi/refereeReportImage.cjs'),slices=require('../miniprogram/utils/refereeReportSlices')
const xs=[0,18,108,132,160,188,216,244,292,312,332,350,440,464,492,520,548,576,624,644,664],labels=['序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌']
function fixture(rightHeader='队姓名'){
 const body=[],words=[]
 function add(r,c,ce,w){const y=r*28,skew=y*.05;body.push({row_start:r,col_start:c,col_end:ce,row_end:r+1,words:w,cell_location:[{x:xs[c]+skew,y},{x:xs[ce]+skew,y},{x:xs[ce]+skew+1.4,y:y+28},{x:xs[c]+skew+1.4,y:y+28}]})}
 add(0,0,10,'主队：合成甲队');add(0,10,20,'客队：合成乙队')
 for(let side=0;side<2;side++)for(let c=0;c<10;c++)add(1,side*10+c,side*10+c+1,c===1&&side?rightHeader:labels[c])
 for(let i=0;i<16;i++)for(let side=0;side<2;side++)for(let c=0;c<10;c++)add(i+2,side*10+c,side*10+c+1,c===0?String(i+1):i<(side?12:16)?c===1?(side?'客':'主')+['甲','乙','丙','丁','戊','己','庚','辛'][i%8]:c===2?String(i+1):c===3&&i%3===0?'√':'':'')
 return {tables_result:[{body,table_location:[{x:0,y:0},{x:700,y:0},{x:700,y:510},{x:0,y:510}]}]}
}
async function run(){
 for(const word of ['队姓名','','队员姓各']){
  const parsed=parseTables(fixture(word),{}, {},null,{blankRoleAsBench:true,circledGoals:true});assert.equal(parsed.teams.home.length,16,word);assert.equal(parsed.teams.away.length,12,word)
  for(const row of parsed.teams.home){assert.ok(row.reviewRegion.left+row.reviewRegion.width<370);assert.equal(row.evidenceSide,'home');assert.equal(row.reviewPolygon.length,4)}
  for(const row of parsed.teams.away){assert.ok(row.reviewRegion.left>340);assert.equal(row.evidenceSide,'away')}
 }
 const missing=fixture('');missing.tables_result[0].body=missing.tables_result[0].body.filter(c=>!(c.row_start===0&&c.col_start===10));assert.equal(parseTables(missing,{}).teams.away.length,12,'serial/name structure recovers missing title and header')
 const mislabeled=fixture();mislabeled.tables_result[0].body.find(c=>c.row_start===0&&c.col_start===10).words='主队：合成乙队';assert.equal(parseTables(mislabeled,{}).teams.away.length,12,'paired panels remain left-home/right-away despite title typo')
 const notes=fixture();for(const c of notes.tables_result[0].body)if(c.row_start>1&&[3,13].includes(c.col_start))c.words='中场';assert.equal(parseTables(notes,{}).teams.away.length,12,'event notes cannot become a third name panel')
 const raw=fixture(),cell=raw.tables_result[0].body.find(c=>c.row_start===2&&c.col_start===12);cell.words='√';const role=parseTables(raw,{}, {},null,{blankRoleAsBench:true}).teams.away[0];assert.equal(role.role,'starter','tick in number column belongs to same player row')
 raw.tables_result[0].body.find(c=>c.row_start===2&&c.col_start===13).words='○';assert.equal(parseTables(raw,{}, {},null,{blankRoleAsBench:true}).teams.away[0].role,'unknown','conflicting marks do not silently become starter')
 const before={teams:{home:[{number:'8',name:'主甲',role:'starter',roleSource:'recognized_mark',goals:'',reviewNotes:[]}],away:[]}},after={teams:{home:[{number:'8',name:'主甲',role:'substitute',roleSource:'blank_as_substitute',goals:'',reviewNotes:[]}],away:[]}};images.retainClearGoals(before,after);assert.equal(after.teams.home[0].role,'starter');assert.ok(after.teams.home[0].reviewNotes.length)
 const parsed=parseTables(fixture(),{});images.uploadedRegions(parsed,{width:720,height:1280},null);const row=parsed.teams.home[0],layout=slices.plan(row,{width:720,height:1280,regionCoordinateSpace:'uploaded_image'});assert.ok(layout.parts.every(p=>p.clip.length===4))
 let clips=0,draws=0;const canvas={createImage(){const image={width:720,height:1280};Object.defineProperty(image,'src',{set(){queueMicrotask(()=>image.onload())}});return image},getContext(){return {fillRect(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){clips++},drawImage(){draws++}}}},component={createSelectorQuery(){return {select(){return this},fields(){return this},exec(fn){fn([{node:canvas}])}}}}
 await slices.render(component,'isolated.jpg',row,{width:720,height:1280,regionCoordinateSpace:'uploaded_image'},{canvasToTempFilePath(o){o.success({tempFilePath:'slice.png'})}},()=>true);assert.equal(clips,2);assert.equal(draws,2)
 assert.throws(()=>slices.plan({...row,reviewPolygon:[{x:NaN,y:1}]},{width:720,height:1280,regionCoordinateSpace:'uploaded_image'}),/边界/)
 console.log('PASS: 表头错字/缺失及缺客队标题仍按独立序号姓名列分主16客12，主切片不越中线，客切片不含主队，号码栏勾号与冲突，原图坐标及表头/整行双重斜边裁切、复识别不静默回退首发；仅合成数据')
}
run().catch(e=>{console.error(e);process.exitCode=1})
