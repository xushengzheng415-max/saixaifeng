const assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {parseTables}=require('../cloudfunctions/webLoginApi/refereeReportAnalysis.cjs'),images=require('../cloudfunctions/webLoginApi/refereeReportImage.cjs'),media=require('../miniprogram/utils/refereeReportMedia'),draft=require('../miniprogram/utils/refereeReportDraft')
const xs=[0,20,100,125,155,185,215,245,285,315,345]
function raw(){
 const body=[],words=[]
 function cell(r,c,value){const x=xs[c],y=r*30;body.push({row_start:r,row_end:r+1,col_start:c,col_end:c+1,words:value,cell_location:[{x,y},{x:xs[c+1],y},{x:xs[c+1],y:y+30},{x,y:y+30}]})}
 const headers=['序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌']
 headers.forEach((value,c)=>cell(0,c,value))
 const names=['甲球员','','丙球员','','戊球员','己球员','主教练签名'],numbers=['53','0','','','0','',''],marks=['√','','','','√','0','']
 for(let i=0;i<7;i++)for(let c=0;c<10;c++)cell(i+1,c,c===0?String(i+1):c===1?names[i]:c===2?numbers[i]:c===3?marks[i]:'')
 const add=(r,c,value)=>words.push({words:value,location:{left:xs[c]+4,top:r*30+8,width:Math.min(45,xs[c+1]-xs[c]-8),height:12}})
 add(1,1,'甲球员');add(1,2,'53');add(2,1,'乙球员');add(2,2,'60');add(3,1,'丙球员');add(3,2,'68');add(5,1,'戊球员');add(5,2,'0');add(6,1,'己球员')
 return {table:{tables_result:[{table_location:[{x:0,y:0},{x:345,y:0},{x:345,y:240},{x:0,y:240}],body}]},text:{words_result:words},hand:{words_result:[]}}
}
function parse(r){return parseTables(r.table,r.text,{},r.hand,{blankRoleAsBench:true,circledGoals:true})}
async function run(){
 const r=raw(),result=parse(r),rows=result.teams.home
 assert.equal(rows.length,6);assert.equal(rows[0].number,'53');assert.equal(rows[0].name,'甲球员');assert.equal(rows[0].role,'starter')
 assert.equal(rows[1].name,'乙球员');assert.deepEqual(rows[1].numberCandidates,['60','0']);assert.equal(rows[1].role,'substitute');assert.equal(rows[2].number,'68')
 assert.equal(rows[3].name,'');assert.equal(rows[3].number,'');assert.equal(rows[4].number,'0');assert.equal(rows[4].name,'戊球员');assert.equal(rows[5].number,'');assert.equal(rows[5].role,'unknown')
 const people=[{id:'home53',name:'甲球员',jerseyNumber:53,teamSide:'home'},{id:'home60',name:'乙球员',jerseyNumber:60,teamSide:'home'},{id:'zero',name:'戊球员',jerseyNumber:0,teamSide:'home'},{id:'missing-number',name:'戊球员',jerseyNumber:'',teamSide:'home'},{id:'away53',name:'甲球员',jerseyNumber:53,teamSide:'away'}]
 const prepared=draft.prepare(result,people).home;assert.equal(prepared[0].playerId,'home53');assert.equal(prepared[1].playerId,'home60');assert.equal(prepared[4].playerId,'zero');assert.equal(prepared[5].playerId,'')
 const conflict=raw();conflict.hand.words_result.push({words:'○',location:{left:129,top:38,width:10,height:12}});assert.equal(parse(conflict).teams.home[0].role,'unknown')
 const original={teams:{home:[{number:'98',name:'甲球员',goals:'29,45'}],away:[]}},partial={teams:{home:[{number:'58',numberCandidates:['58','98'],name:'甲球员',goals:'45',reviewNotes:[]}],away:[]}};images.retainClearGoals(original,partial);assert.equal(partial.teams.home[0].goals,'29,45')
 const mismatch={teams:{home:[{number:'98',name:'甲球员',goals:'29,46',reviewNotes:[]}],away:[]}};images.retainClearGoals(original,mismatch);assert.equal(mismatch.teams.home[0].goals,'?')
 const p=new PNG({width:540,height:960});p.data.fill(255);const processed=images.normalize(PNG.sync.write(p),r.table);assert.ok(processed&&processed.transform.scale>1);assert.equal(processed.transform.sourceWidth,540)
 let compressed=0,compressOptions
 function platform(width,height){return {getImageInfo({src,success}){success({width:src==='compressed'?1600:width,height:src==='compressed'?2400:height,type:'jpg'})},compressImage(options){compressed++;compressOptions=options;options.success({tempFilePath:'compressed'})},getFileSystemManager(){return {getFileInfo({success}){success({size:2000000})}}}}}
 const kept=await media.prepare({tempFilePath:'original',size:619242},platform(1080,1920));assert.equal(kept.tempFilePath,'original');assert.equal(compressed,0)
 const small=await media.prepare({tempFilePath:'phone',size:54872},platform(540,960));assert.equal(small.lowResolution,true);assert.equal(compressed,0)
 const big=await media.prepare({tempFilePath:'camera',size:5000000},platform(4000,6000));assert.equal(big.tempFilePath,'compressed');assert.equal(compressOptions.compressedHeight,2400);assert.equal(big.width,1600)
 compressed=0;await media.prepare({tempFilePath:'tall',size:5000000},platform(900,9000));assert.equal(compressOptions.compressedHeight,9000)
 console.log('PASS: 同格号码/姓名/勾号绑定、53首发不串为邻行0号、漏号码不丢行、内部空白保留疑点、真实0号与缺失分离、同队候选双键匹配、冲突勾号、清楚分钟不回退、低清表格放大、原图直传和大图细节下限')
}
run().catch(error=>{console.error(error);process.exitCode=1})
