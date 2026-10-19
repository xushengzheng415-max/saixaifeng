const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),Module=require('node:module')
const slices=require('../miniprogram/utils/refereeReportSlices'),images=require('../cloudfunctions/webLoginApi/refereeReportImage.cjs'),analysis=require('../cloudfunctions/webLoginApi/refereeReportAnalysis.cjs'),draft=require('../miniprogram/utils/refereeReportDraft')
const clone=value=>JSON.parse(JSON.stringify(value)),quality={width:1080,height:1920,regionCoordinateSpace:'uploaded_image'}
const row={key:'home-0',number:'53',name:'测试球员',role:'unknown',goals:'?',reviewRegion:{left:65,top:840,width:460,height:40},reviewHeaderRegion:{left:61,top:560,width:467,height:68},reviewNotes:['首发、替补标记不清，请核对']}
function canvasMock(width=1080,height=1920){const draws=[];return {draws,createImage(){let image={width,height};Object.defineProperty(image,'src',{set(){queueMicrotask(()=>image.onload&&image.onload())}});return image},getContext(){return {fillRect(){},drawImage(...args){draws.push(args.slice(1))}}}}}
function query(canvas){return {select(){return this},fields(){return this},exec(fn){fn([{node:canvas}])}}}
async function run(){
 const prepared=slices.plan(row,quality);assert.equal(prepared.parts.length,2);assert.equal(prepared.parts[0].left,61);assert.equal(prepared.parts[1].left,61);assert.equal(prepared.parts[1].top,840);assert.ok(prepared.width<=1600)
 assert.throws(()=>slices.plan(row,{...quality,regionCoordinateSpace:'processing'}),/定位/)
 assert.throws(()=>slices.plan({...row,reviewRegion:null},quality),/未定位/)
 assert.throws(()=>slices.plan({...row,reviewRegion:{...row.reviewRegion,top:NaN}},quality),/未定位/)
 assert.equal(slices.plan({...row,reviewHeaderRegion:{...row.reviewHeaderRegion,top:850}},quality).parts.length,1)
 const candidate={teams:{home:[clone(row)],away:[]}};images.uploadedRegions(candidate,{width:540,height:960},{left:5,top:190,scale:3});assert.equal(candidate.teams.home[0].reviewRegion.left,26);assert.equal(candidate.teams.home[0].reviewRegion.top,470)
 assert.equal(candidate.teams.home[0].reviewHeaderRegion.top,376)
 const bad={teams:{home:[{reviewRegion:{left:Infinity,top:0,width:2,height:2}}],away:[]}};images.uploadedRegions(bad,quality,null);assert.equal(bad.teams.home[0].reviewRegion,null)
 // Complete same-side row bounds include printed identity and cross-column handwriting.
 const cells=[];for(const [side,offset] of [[0,0],[1,500]])for(let r=0;r<2;r++)for(let c=0;c<10;c++){const x=offset+c*40,y=r*50;cells.push({row_start:r,col_start:side*10+c,col_end:side*10+c+1,row_end:r+1,words:r===0?['序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌'][c]:c===1?'测试球员':c===2?'53':c===3?'√':'',cell_location:[{x,y},{x:x+40,y},{x:x+40,y:y+50},{x,y:y+50}]})}
 const parsed=analysis.parseTables({tables_result:[{body:cells}]},{}, {},{}, {blankRoleAsBench:true})
 assert.equal(parsed.teams.home[0].reviewRegion.left,37);assert.equal(parsed.teams.away[0].reviewRegion.left,537);assert.equal(parsed.teams.home[0].reviewRegion.width,366);assert.equal(parsed.teams.home[0].reviewHeaderRegion.top,-3)
 const canvas=canvasMock(),componentCanvas={createSelectorQuery:()=>query(canvas)},platform={canvasToTempFilePath(options){options.success({tempFilePath:'slice.png'})}}
 const raster=await slices.render(componentCanvas,'uploaded.jpg',row,quality,platform,()=>true);assert.equal(raster.path,'slice.png');assert.deepEqual(canvas.draws.map(draw=>draw.slice(0,4)),prepared.parts.map(part=>[part.left,part.top,part.width,part.height]))
 assert.equal(canvas.draws.length,2)
 await assert.rejects(slices.render({createSelectorQuery:()=>query(canvasMock(540,960))},'different.jpg',row,quality,platform,()=>true),/方向或尺寸/)
 await assert.rejects(slices.render(componentCanvas,'uploaded.jpg',row,quality,platform,()=>false),/STALE/)
 await assert.rejects(slices.render(componentCanvas,'uploaded.jpg',row,quality,{canvasToTempFilePath(o){o.fail()}},()=>true),/切片未生成/)
 // Actual component: resolve by stable row key through filtered views; no cloud write on preview/confirm.
 let definition,renders=0,exports=0,previews=0
 const nativeCanvas=canvasMock(),wx={previewImage(){previews++},canvasToTempFilePath(options){exports++;options.success({tempFilePath:'native-slice.png'})}}
 const componentPath=path.resolve('miniprogram/components/referee-report-import/index.js')
 vm.runInNewContext(fs.readFileSync(componentPath,'utf8'),{Component:value=>definition=value,wx,require:Module.createRequire(componentPath),console})
 const component={...definition.methods,data:clone(definition.data),properties:{tournamentId:'event',match:{id:'match',homeName:'主队',awayName:'客队'},canLineup:true,canResult:true,players:[{id:'p53',name:row.name,jerseyNumber:'53',teamSide:'home'}],playersOnField:8},generation:1,localFile:{tempFilePath:'uploaded.jpg'},imageQuality:quality,teams:draft.prepare({teams:{home:[clone(row)],away:[]}},[{id:'p53',name:row.name,jerseyNumber:'53',teamSide:'home'}]),setData(patch){Object.assign(this.data,patch)},triggerEvent(){},createSelectorQuery(){renders++;return query(nativeCanvas)}}
 component.refresh();const event={currentTarget:{dataset:{index:0}}};component.viewSlice(event);await component._sliceWork;assert.equal(component.data.sliceImage,'native-slice.png');assert.equal(component.data.sliceRow.number,'53');assert.equal(exports,1);component.previewSlice();assert.equal(previews,1)
 component.closeSlice();component.viewSlice(event);await component._sliceWork;assert.equal(exports,1,'same image/row cached');assert.equal(renders,1)
 component.onRowChange({currentTarget:{dataset:{index:0,field:'role'}},detail:{value:1}});assert.equal(component.data.sliceRow.role,'starter');assert.equal(component.teams.home[0].reviewConfirmedFingerprint,'')
 component.confirmSlice();assert.equal(component.data.sliceOpen,true,'unclear minute remains pending')
 component.onRowChange({currentTarget:{dataset:{index:0,field:'goals'}},detail:{value:'29'}});component.confirmSlice();assert.equal(component.data.sliceOpen,false);assert.equal(draft.needsReview(component.teams.home[0]),false)
 assert.equal(component.data.rows.length,0,'confirmed row leaves pending list')
 component.viewSlice(event);component.closeSlice();await component._sliceWork;assert.equal(component.data.sliceOpen,false)
 component.sliceCache={};component.viewSlice(event);component.properties.match.id='other-match';await component._sliceWork;assert.equal(component.data.sliceImage,'','late results from other match ignored');definition.observers['match.id'].call(component);assert.equal(component.data.sliceOpen,false)
 component.resetSlices();assert.equal(Object.keys(component.sliceCache).length,0)
 const wxml=fs.readFileSync('miniprogram/components/referee-report-import/index.wxml','utf8');for(const match of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(match[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 assert.match(wxml,/查看切片/);assert.match(wxml,/确认此行/);assert.match(wxml,/查看整表/)
 console.log('PASS: 同队整行和表头定位、增强坐标映射、原图裁切参数、错误/重试/缓存、切片内编辑与疑点确认、筛选后身份不变、关闭/跨场迟到保护；无真实业务读写')
}
run().catch(error=>{console.error(error);process.exitCode=1})
