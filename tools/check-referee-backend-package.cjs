const fs=require('fs'),path=require('path')
const root=path.resolve(process.argv[2] || 'cloudfunctions/webLoginApi')
const required=['index.js','refereeReportOcr.cjs','refereeReportAnalysis.cjs','refereeSubstitutionBatch.cjs','paperReportProof.cjs','paperGoalReconcile.cjs','data-center/match-events.mjs']
const missing=required.filter(file=>!fs.existsSync(path.join(root,file)))
const code=missing.includes('index.js')?'':fs.readFileSync(path.join(root,'index.js'),'utf8')
for(const marker of ['recognizeRefereeReport','confirmRefereeReport','refereeSubstitutionBatch.cjs','buildEntries'])if(!code.includes(marker))missing.push(`接口标记:${marker}`)
for(const [source,dependency] of [['index.js','miniPaperReportSession.cjs'],['refereeReportAnalysis.cjs','refereeReportNotes.cjs'],['refereeReportAnalysis.cjs','refereeReportPanels.cjs'],['refereeReportOcr.cjs','refereeGoalFocus.cjs'],['refereeReportOcr.cjs','refereeReportImage.cjs']]){
  const file=path.join(root,source)
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes(dependency)&&!fs.existsSync(path.join(root,dependency)))missing.push(dependency)
}
const ocrPath=path.join(root,'refereeReportOcr.cjs')
if(fs.existsSync(ocrPath) && !fs.readFileSync(ocrPath,'utf8').includes("require('./paperReportProof.cjs').signImport"))missing.push('识别接口保存签名仍为旧版')
if(missing.length){console.error('拒绝发布旧裁判表接口包：'+missing.join('、')+'。请拉取最新main，或以刚下载的线上包做差量更新。');process.exit(1)}
console.log('裁判表识别、分组保存及必要依赖检查通过')
