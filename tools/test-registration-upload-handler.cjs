const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const dir=path.resolve(process.env.UPLOAD_HANDLER_QA_DIR||'cloudfunctions/uploadFile')
const tables=new Map(),bucket=new Map();let sequence=0,granted=true
function records(name){if(!tables.has(name))tables.set(name,new Map());return tables.get(name)}
function matches(row,filter){return Object.entries(filter).every(([key,value])=>value&&value.gt!==undefined?row[key]>value.gt:row[key]===value)}
function query(name,filter={},skip=0,limit=100){return {
 where(next){return query(name,{...filter,...next},skip,limit)},limit(next){return query(name,filter,skip,next)},skip(next){return query(name,filter,next,limit)},orderBy(){return this},
 async get(){return {data:[...records(name).values()].filter(row=>matches(row,filter)).sort((a,b)=>(a.chunkIndex||0)-(b.chunkIndex||0)).slice(skip,skip+limit)}},
 async count(){return {total:[...records(name).values()].filter(row=>matches(row,filter)).length}},
 async add({data}){const id=data._id||'isolated-'+(++sequence);records(name).set(id,{...data,_id:id});return {_id:id}},
 doc(id){return {async get(){return {data:records(name).get(id)||null}},async remove(){records(name).delete(id);return {}},async update({data}){records(name).set(id,{...records(name).get(id),...data});return {}}}},
 async remove(){for(const [id,row]of records(name))if(matches(row,filter))records(name).delete(id);return {}}
}}
const db={command:{gt:value=>({gt:value})},collection:name=>query(name),serverDate:()=>new Date()}
const token='isolated-upload-test-token'
records('auth_sessions').set('session',{tokenHash:crypto.createHash('sha256').update(token).digest('hex'),active:true,expiresAt:new Date(Date.now()+60000),userId:'user-a',activeOrgId:'org-a'})
records('users').set('user-a',{_id:'user-a',orgId:'org-a'})
const cloud={DYNAMIC_CURRENT_ENV:'isolated',init(){},database:()=>db,async uploadFile({cloudPath,fileContent}){const id='cloud://isolated.bucket/'+cloudPath;bucket.set(id,Buffer.from(fileContent));return {fileID:id}},async getTempFileURL({fileList}){return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://isolated.invalid/file'}))}}}
const policy={async isStaff(){return true},async owner(){return false},async hasRight(_db,user,org,event,right){return granted&&user==='user-a'&&org==='org-a'&&event==='event-a'&&right==='event.registration'}}
const mod={exports:{}},localRequire=require('node:module').createRequire(path.join(dir,'index.js'))
vm.runInNewContext(fs.readFileSync(path.join(dir,'index.js'),'utf8'),{module:mod,exports:mod.exports,require:name=>name==='wx-server-sdk'?cloud:name==='./staffPolicy.cjs'?policy:localRequire(name),Buffer,console:{log(){},warn(){},error(){}},process:{env:{}},setTimeout,clearTimeout},{filename:path.join(dir,'index.js')})
const call=params=>mod.exports.main({__authToken:token,__actorUserId:'user-a',__actorOrgId:'org-a',__staffTournamentId:'event-a',...params})
async function run(){
 const start=await call({action:'startChunk',folder:'football/team-registration-imports/event-a',fileName:'isolated.docx',totalChunks:2})
 assert.equal(start.success,true,JSON.stringify(start));const uploadId=start.uploadId
 const foreign=await call({action:'uploadChunk',uploadId,chunkIndex:0,data:'YQ==',__staffTournamentId:'event-b'})
 assert.equal(foreign.success,false);assert.equal(bucket.size,0)
 const parts=[Buffer.from('isolated first chunk'),Buffer.from('isolated second chunk')]
 for(let i=0;i<parts.length;i++)assert.equal((await call({action:'uploadChunk',uploadId,chunkIndex:i,data:parts[i].toString('base64')})).success,true)
 granted=false;assert.equal((await call({action:'finishChunk',uploadId})).success,false);assert.equal(bucket.size,0)
 granted=true;const finished=await call({action:'finishChunk',uploadId});assert.equal(finished.success,true,JSON.stringify(finished))
 assert.ok(bucket.get(finished.fileID).equals(Buffer.concat(parts)))
 assert.equal(records('chunk_sessions').size,0);assert.equal(records('chunk_data').size,0)
 assert.equal(records('tournament_staff_audit').size,1)
 assert.equal((await call({action:'getTempFileURL',fileID:finished.fileID})).success,true)
 console.log('PASS: actual upload handler accepts authorized staff init/chunks/merge, preserves bytes, cleans temporary state, audits upload; cross-event and revoked access denied without storage writes')
}
run().catch(error=>{console.error(error);process.exitCode=1})
