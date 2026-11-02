import path from 'node:path'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {pcSourceHash} from './pc-release-metadata.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=prefix=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)
const formalRef=arg('--formal-ref=')||'github/main',previewRef=arg('--preview-ref=')||'github/preview'
const report={formalRef,previewRef,formalSourceSha256:pcSourceHash(root,formalRef),previewSourceSha256:pcSourceHash(root,previewRef),checkedAt:new Date().toISOString()}
report.sourceAligned=report.formalSourceSha256===report.previewSourceSha256
if(process.argv.includes('--live')){
 report.live={}
 for(const [channel,base]of [['production','admin'],['preview','preview/admin']]){
  const url='https://www.sxffootball.cn/'+base+'/pc-release.json'
  const response=await fetch(url+'?pc-alignment='+Date.now(),{headers:{'Cache-Control':'no-cache'}})
  if(!response.ok)throw Error(channel+' PC版本标识读取失败 HTTP '+response.status)
  const data=await response.json()
  if(data.app!=='sxf-organizer-pc'||data.channel!==channel||data.sourceDirty||data.pcSourceSha256!==report.formalSourceSha256)throw Error(channel+' 线上PC版本与正式源码不一致')
  report.live[channel]={url,http:response.status,...data}
 }
 const desktop=JSON.parse(execFileSync('git',['show',formalRef+':desktop-windows/package.json'],{cwd:root,encoding:'utf8'}))
 const feedResponse=await fetch('https://www.sxffootball.cn/desktop/windows/latest.json?pc-alignment='+Date.now()),feed=await feedResponse.json()
 if(!feedResponse.ok||feed.version!==desktop.version)throw Error('Windows客户端源码版本与发布清单不一致')
 report.desktop={sourceVersion:desktop.version,publishedVersion:feed.version,url:feed.url,sha256:feed.sha256,bytes:feed.bytes}
}
const output=arg('--output=');if(output)fs.writeFileSync(path.resolve(root,output),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
if(!report.sourceAligned)process.exitCode=1
