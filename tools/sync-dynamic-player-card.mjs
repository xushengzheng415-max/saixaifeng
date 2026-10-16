import fs from 'node:fs'
import path from 'node:path'
const root=process.cwd(),check=process.argv.includes('--check')
const copies=[['shared/player-card/draw.js','service-account-h5/dynamic-card-renderer.js'],['shared/player-card/draw.js','miniprogram/utils/dynamic-card-draw.js']]
for(const file of ['playerCardPreviewAssets.cjs','playerCardDynamic.cjs','playerCardSource.cjs','playerCardReader.cjs','playerCardSeriesReader.cjs','playerCardPreload.cjs','playerCardRender.cjs','playerCardTextStyle.cjs','player-card-text-styles.json','playerCardFontCache.cjs','player-card-font-manifest.json'])copies.push(['cloudfunctions/webLoginApi/'+file,'cloudfunctions/getMiniWorkspace/'+file])
let failed=false
for(const [source,destination] of copies){const content=fs.readFileSync(path.join(root,source));if(check){if(!fs.existsSync(path.join(root,destination))||!content.equals(fs.readFileSync(path.join(root,destination)))){console.error('动态卡副本不一致:',destination);failed=true}}else fs.writeFileSync(path.join(root,destination),content)}
if(failed)process.exit(1)
console.log(check?'PASS: 三端动态球员卡模块一致':'动态球员卡模块已同步')
