const assert=require('node:assert/strict')
const {readCards}=require('../cloudfunctions/webLoginApi/playerCardReader.cjs')
const prefix='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const signed=[]
const records=new Map([['parent_portraits/new',{status:'confirmed',transparentFileId:prefix+'standard.png'}]])
const db={collection:name=>({doc:id=>({get:async()=>({data:records.get(name+'/'+id)||null})})})}
const cloud={getTempFileURL:async({fileList})=>{signed.push(...fileList);return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://signed.example/'+encodeURIComponent(fileID)}))}}}
;(async()=>{
 const rows=await readCards(cloud,db,[
  {_id:'roster',photoUrl:prefix+'roster.jpg'},
  {_id:'registered',recentPortraitId:'new',photoUrl:prefix+'old.jpg'},
  {_id:'missing'},
  {_id:'external',photoUrl:'https://untrusted.example/person.jpg'}
 ])
 assert.equal(rows[0].status,'unavailable')
 assert.equal(rows[0].portraitStatus,'ready')
 assert.equal(rows[1].portraitFileId,prefix+'standard.png')
 assert.equal(rows[2].portraitStatus,'missing')
 assert.equal(rows[3].portraitStatus,'missing')
 assert.deepEqual(signed,[prefix+'roster.jpg',prefix+'standard.png'])
 assert.ok(rows.every(row=>!row.cardUrl))
 console.log('Roster and registered portraits display independently of card generation; no fake card or external asset signing')
})().catch(error=>{console.error(error);process.exitCode=1})
