const fs=require('fs'),path=require('path')
const root=path.resolve(process.argv[2] || 'cloudfunctions/webLoginApi')
const required=['index.js','refereeReportOcr.cjs','refereeReportAnalysis.cjs','refereeSubstitutionBatch.cjs','data-center/match-events.mjs']
const missing=required.filter(file=>!fs.existsSync(path.join(root,file)))
const code=missing.includes('index.js')?'':fs.readFileSync(path.join(root,'index.js'),'utf8')
for(const marker of ['recognizeRefereeReport','confirmRefereeReport','refereeSubstitutionBatch.cjs','buildEntries'])if(!code.includes(marker))missing.push(`接口标记:${marker}`)
if(missing.length){console.error('拒绝发布旧裁判表接口包：'+missing.join('、')+'。请拉取最新main，或以刚下载的线上包做差量更新。');process.exit(1)}
console.log('裁判表识别、分组保存及必要依赖检查通过')
