import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createChunkUploadError} from '../web-admin-vue/src/utils/chunkUploadError.js'
import {resolveChunkUploadTarget,isPayloadTooLargeError} from '../web-admin-vue/src/utils/chunkUploadPath.js'
const source=fs.readFileSync(process.env.CLOUD_UPLOAD_QA_SOURCE||'web-admin-vue/src/utils/cloud.js','utf8')
const start=source.indexOf('export async function uploadLargeFileViaCloud('),end=source.indexOf('\n/**',start)
assert.ok(start>=0&&end>start)
const make=new Function('callFunction','isDemoMode','uploadFileViaCloud','resolveChunkUploadTarget','isPayloadTooLargeError','_arrayBufferToBase64','createChunkUploadError',source.slice(start,end).replace(/^export /,'')+'\nreturn uploadLargeFileViaCloud')
const file=new File(['isolated fixture'],'fixture.docx')
const records=[]
const upload=make(async(name,params)=>{records.push(params.action);return {success:false,code:'TOURNAMENT_STAFF_SCOPE_DENIED',error:'当前子账号没有该操作权限'}},()=>false,null,resolveChunkUploadTarget,isPayloadTooLargeError,value=>Buffer.from(value).toString('base64'),createChunkUploadError)
await assert.rejects(upload('football/team-registration-imports/event-a/fixture.docx',file),error=>error.code==='TOURNAMENT_STAFF_SCOPE_DENIED'&&error.message==='当前子账号没有该操作权限')
assert.deepEqual(records,['startChunk'],'a rejected init must not upload chunks or attempt merge')
const calls=[]
const ok=make(async(name,params)=>{calls.push(params);return params.action==='startChunk'?{success:true,uploadId:'isolated-upload'}:params.action==='finishChunk'?{success:true,fileID:'cloud://isolated/result.docx'}:{success:true}},()=>false,null,resolveChunkUploadTarget,isPayloadTooLargeError,value=>Buffer.from(value).toString('base64'),createChunkUploadError)
assert.equal((await ok('football/team-registration-imports/event-a/fixture.docx',file)).fileId,'cloud://isolated/result.docx')
assert.equal(calls[0].folder,'football/team-registration-imports/event-a')
assert.equal(calls.at(-1).action,'finishChunk')
assert.equal(createChunkUploadError(null,'请重试').message,'请重试')
console.log('PASS: actual upload client preserves backend rejection reason/code and stops writes; successful upload still reaches merge with scoped path')
