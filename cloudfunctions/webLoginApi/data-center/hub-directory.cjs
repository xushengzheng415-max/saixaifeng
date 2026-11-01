'use strict'
const {readByIds}=require('./reader.cjs')
const {text}=require('./hub-contract.cjs')
const failure=(code,message)=>Object.assign(new Error(message),{code})
const MARKERS=['synthetic','isTest','syntheticDatasetId','syntheticKey','source','originType','dataKind','isDeleted','status']
const FIELDS={teams:['_id','name','teamName','logo','logoUrl','city','cityName','platformJoinedAt','firstRegisteredAt','createTime','createdAt',...MARKERS],players:['_id','name','teamId','teamCode','playerId','playerCode','jerseyNumber','number','position','jerseyName','nationality','birthDate','birthday','height','weight','nativePlace','platformJoinedAt','firstRegisteredAt','createTime','createdAt',...MARKERS]}
FIELDS.teams.push('businessNumber','numbering','parentTeamId','provinceCode','provinceName','province','cityCode','registrationRegion')
FIELDS.players.push('businessNumber','numbering','nativePlaceProvinceCode','nativePlaceCityLetter','nativePlaceRegion')
function unpack(cursor,kind,teamId,keyword=''){if(!cursor)return '';try{if(typeof cursor!=='string'||cursor.length>1000)throw Error();const row=JSON.parse(Buffer.from(cursor,'base64url').toString());if(row.kind!==kind||row.teamId!==teamId||(row.keyword||'')!==keyword||typeof row.after!=='string'||!row.after||row.after.length>128)throw Error();return row.after}catch{throw failure('DATA_CURSOR_INVALID','分页位置无效，请重新查询')}}
async function directoryPage(db,event,views){
 const kind=event.kind||'players',teamId=text(event.teamId),keyword=text(event.keyword),size=event.pageSize??50
 if(!['players','teams'].includes(kind)||!Number.isInteger(size)||size<1||size>100||teamId.length>100||keyword.length>50)throw failure('DATA_SCOPE_INVALID','目录类型、关键词或分页大小无效')
 if(kind==='teams'&&teamId)throw failure('DATA_SCOPE_INVALID','球队目录不支持球员所属队筛选')
 const {synthetic}=await import('./statistics.mjs'),parentCache=new Map()
 const acceptable=row=>row&&row.isDeleted!==true&&text(row.status)!=='deleted'&&!synthetic(row)
 if(teamId){const team=(await readByIds(db,'teams','_id',[teamId]))[0];if(!acceptable(team))throw failure('DATA_TEST_EXCLUDED','球队不存在、已删除或属于测试来源');parentCache.set(teamId,team)}
 let after=unpack(event.cursor,kind,teamId,keyword),scanned=0,exhausted=false
 const items=[],excluded={test:0,deleted:0,unverifiedTeam:0,conflictingTeam:0},scanBudget=1000
 while(items.length<size&&scanned<scanBudget){
  let where=teamId?db.command.or([{teamId},{teamCode:teamId}]):{}
  if(keyword){const regexp=db.RegExp({regexp:keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),options:'i'}),fields=kind==='players'?['name','businessNumber','playerId','playerCode','_id']:['name','teamName','businessNumber','city','cityName','_id'];const search=db.command.or(fields.map(key=>({[key]:regexp})));where=teamId?db.command.and([where,search]):search}
  const condition=after?db.command.and([where,{_id:db.command.gt(after)}]):where
  let raw
  try{raw=(await db.collection(kind).where(condition).field(Object.fromEntries(FIELDS[kind].map(k=>[k,true]))).orderBy('_id','asc').limit(Math.min(100,size-items.length,scanBudget-scanned)).get()).data||[]}
  catch(e){throw failure('DATA_READ_FAILED','目录读取失败，请重试或检查索引')}
  if(!raw.length){exhausted=true;break}
  if(kind==='players'){
   const ids=[...new Set(raw.map(x=>text(x.teamId||x.teamCode)).filter(x=>x&&!parentCache.has(x)))]
   const parents=await readByIds(db,'teams','_id',ids,{fields:Object.fromEntries(['_id','name','teamName','logo','logoUrl',...MARKERS].map(k=>[k,true]))})
   ids.forEach(id=>parentCache.set(id,null));parents.forEach(row=>parentCache.set(text(row._id),row))
  }
  for(const row of raw){const key=text(row._id);if(!key||after&&key<=after)throw failure('DATA_CURSOR_INVALID','目录分页顺序异常');after=key;scanned++
   if(synthetic(row)){excluded.test++;continue}
   if(row.isDeleted===true||row.status==='deleted'){excluded.deleted++;continue}
   if(kind==='players'){
    if(row.teamId&&row.teamCode&&text(row.teamId)!==text(row.teamCode)){excluded.conflictingTeam++;continue}
    const parentId=text(row.teamId||row.teamCode),parent=parentCache.get(parentId)
    if(parentId&&synthetic(parent)){excluded.test++;continue}
    if(parentId&&!acceptable(parent)){excluded.unverifiedTeam++;continue}
   }
   const item=views[kind](row)
   if(kind==='players'){const parent=parentCache.get(text(row.teamId||row.teamCode));item.currentTeam=parent?{id:text(parent._id),name:text(parent.name||parent.teamName),logo:text(parent.logo||parent.logoUrl)}:null}
   items.push(item)
  }
 }
 const hasMore=!exhausted,nextCursor=hasMore?Buffer.from(JSON.stringify({kind,teamId,keyword,after})).toString('base64url'):null
 return {kind,items,page:{pageSize:size,hasMore,nextCursor,scanned,scanBudget,scanBudgetReached:scanned===scanBudget&&!exhausted},excluded}
}
module.exports={directoryPage,unpack}
