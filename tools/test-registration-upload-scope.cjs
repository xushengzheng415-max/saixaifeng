const assert=require('node:assert/strict')
const fs=require('node:fs')
const a=require('../cloudfunctions/webLoginApi/staffUploadRights.cjs')
const b=require('../cloudfunctions/uploadFile/staffUploadRights.cjs')
assert.equal(fs.readFileSync(require.resolve('../cloudfunctions/webLoginApi/staffUploadRights.cjs'),'utf8'),fs.readFileSync(require.resolve('../cloudfunctions/uploadFile/staffUploadRights.cjs'),'utf8'))
const session={staffTournamentId:'event-a',staffOrgId:'org-a',staffUserId:'user-a',folder:'football/team-registration-imports/event-a'}
const db={collection(name){assert.equal(name,'chunk_sessions');return {doc(id){return {async get(){return {data:id==='valid-upload'?session:null}}}}}}}
async function run(api){
  const right=params=>api.staffUploadRight(db,params,'event-a','org-a','user-a')
  assert.equal(await api.folderRight(db,session.folder,'event-a'),'event.registration')
  assert.equal(await api.folderRight(db,session.folder,'event-b'),'')
  assert.equal(await right({action:'startChunk',folder:session.folder,fileName:'team.docx'}),'event.registration')
  for(const params of [
    {action:'startChunk',folder:'football/team-registration-imports/event-b',fileName:'team.docx'},
    {action:'startChunk',folder:session.folder,fileName:'payload.exe'},
    {action:'startChunk',folder:session.folder,fileName:'../team.docx'},
    {action:'uploadBase64',folder:session.folder,fileName:'team.docx'},
    {action:'startChunk',folder:session.folder+'/extra',fileName:'team.docx'}
  ])assert.equal(await right(params),'')
  for(const action of ['uploadChunk','finishChunk','abortChunk']){
    assert.equal(await right({action,uploadId:'valid-upload'}),'event.registration')
    assert.equal(await api.staffUploadRight(db,{action,uploadId:'valid-upload'},'event-b','org-a','user-a'),'')
    assert.equal(await api.staffUploadRight(db,{action,uploadId:'valid-upload'},'event-a','org-b','user-a'),'')
    assert.equal(await api.staffUploadRight(db,{action,uploadId:'valid-upload'},'event-a','org-a','user-b'),'')
    assert.equal(await right({action,uploadId:'missing'}),'')
  }
  const fileID='cloud://isolated-env.bucket/football/team-registration-imports/event-a/team.docx'
  assert.equal(await right({action:'getTempFileURL',fileID}),'event.registration')
  assert.equal(await right({action:'getTempFileURL',fileID:fileID.replace('event-a','event-b')}),'')
  assert.equal(await right({action:'getTempFileURL',fileID:fileID.replace('.docx','.exe')}),'')
  assert.equal(await api.folderRight(db,'player-photos/imports/event-a','event-a'),'event.registration')
}
Promise.resolve().then(()=>run(a)).then(()=>run(b)).then(()=>console.log('PASS: scoped Word upload lifecycle allowed; cross-event/org/user, invalid extension/path and stale upload IDs rejected')).catch(error=>{console.error(error);process.exitCode=1})
