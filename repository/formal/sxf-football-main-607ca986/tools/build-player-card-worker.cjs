const fs=require('node:fs'),path=require('node:path')
const source=path.resolve(process.argv[2]||'cloudfunctions/webLoginApi')
const target=path.resolve(process.argv[3]||'cloudfunctions/playerCardPublishWorker')
for(const name of ['playerCardPublish.cjs','playerCardSuite.cjs','playerCardSource.cjs','playerCardReader.cjs','playerCardRender.cjs','player-card-preview-portrait.png','fonts','data-center']){
  fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true})
}
console.log('Player card worker modules synchronized')
