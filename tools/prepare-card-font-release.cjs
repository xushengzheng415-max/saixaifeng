const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process')
const root=path.resolve('work/card-font-release-20261028'),source=path.resolve('cloudfunctions/webLoginApi')
const fonts=require('../cloudfunctions/webLoginApi/player-card-text-styles.json').fonts.filter(f=>!['sans','brush','sport'].includes(f.id))
const manifest=require('../cloudfunctions/webLoginApi/player-card-font-manifest.json')
const desired=fs.readFileSync(path.join(source,'playerCardDynamic.cjs'),'utf8').replace(/\r\n/g,'\n')
const newMeta=desired.split('\n').filter(l=>l.startsWith('const fontContract=')||l.startsWith('const fonts=')).join('\n')
const readPatch=desired.slice(desired.indexOf(' if(!snapshot)return null'),desired.indexOf('\n}\nasync function publish'))
const report={}
function hashes(dir){const result={};function visit(base){for(const item of fs.readdirSync(base,{withFileTypes:true})){if(item.name==='node_modules')continue;const p=path.join(base,item.name);if(item.isDirectory())visit(p);else result[path.relative(dir,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}}visit(dir);return result}
for(const name of ['webLoginApi','getMiniWorkspace','playerCardPublishWorker']){
 const before=path.join(root,'before',name),after=path.join(root,'after',name)
 fs.cpSync(before,after,{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')})
 const contract=JSON.parse(fs.readFileSync(path.join(before,'player-card-text-styles.json'),'utf8'))
 contract.fonts=contract.fonts.filter(f=>!fonts.some(n=>n.id===f.id));contract.fonts.push(...fonts)
 fs.writeFileSync(path.join(after,'player-card-text-styles.json'),JSON.stringify(contract,null,2)+'\n')
 const originalManifest=JSON.parse(fs.readFileSync(path.join(before,'player-card-font-manifest.json'),'utf8'))
 for(const font of fonts)for(const filename of font.files){if(!originalManifest.some(f=>f.name===filename))originalManifest.push(manifest.find(f=>f.name===filename));fs.mkdirSync(path.join(after,'fonts'),{recursive:true});fs.copyFileSync(path.join(source,'fonts',filename),path.join(after,'fonts',filename))}
 for(const file of ['Graduate-OFL.txt','Jersey25-OFL.txt','BlackOpsOne-OFL.txt','ADDED-FONTS.json'])fs.copyFileSync(path.join(source,'fonts',file),path.join(after,'fonts',file))
 fs.writeFileSync(path.join(after,'player-card-font-manifest.json'),JSON.stringify(originalManifest,null,2)+'\n')
 let code=fs.readFileSync(path.join(before,'playerCardDynamic.cjs'),'utf8').replace(/\r\n/g,'\n')
 const oldMeta=code.split('\n').find(l=>l.startsWith('const fonts='));if(!oldMeta)throw new Error('Missing font marker '+name)
 code=code.replace(oldMeta,newMeta)
 const start=code.indexOf(' return snapshot?{...await descriptor('),end=code.indexOf('\n}',start)
 if(start<0||end<0)throw new Error('Missing read marker '+name)
 code=code.slice(0,start)+readPatch+code.slice(end)
 fs.writeFileSync(path.join(after,'playerCardDynamic.cjs'),code)
 if(name==='webLoginApi'){
  const p=path.join(after,'playerCardAccess.cjs'),s=fs.readFileSync(p,'utf8');if(!s.includes('restrictedAssets:Boolean(staffScope),dynamic:'))throw new Error('Access compatibility marker missing')
  fs.writeFileSync(p,s.replace('restrictedAssets:Boolean(staffScope),dynamic:','restrictedAssets:Boolean(staffScope),preserveDynamic:event.action===\'exportPlayerCardForViewer\',dynamic:'))
 }
 if(name==='getMiniWorkspace'){
  const p=path.join(after,'index.js'),s=fs.readFileSync(p,'utf8'),marker="allowed,{dynamic:event.action==='playerCardExport'||"
  if(!s.includes(marker))throw new Error('Mini export marker missing')
  fs.writeFileSync(p,s.replace(marker,"allowed,{preserveDynamic:event.action==='playerCardExport',dynamic:event.action==='playerCardExport'||"))
 }
 const previous=hashes(before),current=hashes(after)
 const changed=Object.keys(current).filter(f=>current[f]!==previous[f])
 const removed=Object.keys(previous).filter(f=>!current[f]);if(removed.length)throw new Error('Unexpected removed files')
 for(const file of changed)if(!['player-card-text-styles.json','player-card-font-manifest.json','playerCardDynamic.cjs',...(name==='webLoginApi'?['playerCardAccess.cjs']:[]),...(name==='getMiniWorkspace'?['index.js']:[])].includes(file)&&!file.startsWith('fonts/'))throw new Error('Unapproved delta '+file)
 for(const file of changed.filter(f=>/\.(cjs|js)$/.test(f)))cp.execFileSync(process.execPath,['--check',path.join(after,file)])
 report[name]={changed,hashes:Object.fromEntries(changed.map(f=>[f,current[f]])),unchangedFiles:Object.keys(previous).length-changed.filter(f=>previous[f]).length,removed}
 console.log(name+': '+changed.length+' allowed file changes; all other runtime/dependency files unchanged')
}
fs.writeFileSync(path.join(root,'delta.json'),JSON.stringify(report,null,2))
