const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const folder=path.resolve(process.argv[2]||'cloudfunctions/webLoginApi')
async function main(){
  const source=fs.readFileSync(path.join(folder,'index.js'),'utf8')
  assert.ok(source.includes("require('./staffUploadRights.cjs')"),'package entry must use shared upload rights')
  const rights=require(path.join(folder,'staffUploadRights.cjs'))
  const db={collection(){throw Error('scope-only guard must not require real database access')}}
  const right=await rights.staffUploadRight(db,{action:'startChunk',folder:'football/team-registration-imports/guard-event',fileName:'guard.docx'},'guard-event','guard-org','guard-user')
  assert.equal(right,'event.registration','registration Word upload rule is missing or regressed')
  assert.equal(await rights.staffUploadRight(db,{action:'startChunk',folder:'football/team-registration-imports/other-event',fileName:'guard.docx'},'guard-event','guard-org','guard-user'),'','cross-event uploads must remain denied')
  assert.equal(await rights.staffUploadRight(db,{action:'startChunk',folder:'football/team-registration-imports/guard-event',fileName:'guard.exe'},'guard-event','guard-org','guard-user'),'','non-Word source upload must remain denied')
  console.log('PASS: actual backend package retains scoped registration Word uploads and denies cross-event/invalid file type')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
