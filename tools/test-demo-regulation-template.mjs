import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../web-admin-vue/node_modules/vite/dist/node/index.js'
import JSZip from '../web-admin-vue/node_modules/jszip/lib/index.js'
import { createDemoWorkspace } from '../web-admin-vue/src/utils/demoWorkspace.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web-admin-vue')
globalThis.fetch=()=>{throw new Error('Demo recognition must stay local')}
const server=await createServer({root,configFile:path.join(root,'vite.config.js'),base:'/preview/admin/',server:{middlewareMode:true},appType:'custom'})
try{
  const sample=await server.ssrLoadModule('/src/utils/demoRegulations.js')
  const rules=await server.ssrLoadModule('/src/utils/regulationRecognition.js')
  const original=fs.readFileSync(path.join(root,'public/assets/demo-regulations/youth-football-regulations.docx'))
  const uploaded=await sample.recognizeDemoRegulation(new File([original],sample.demoRegulationName))
  assert.deepEqual(uploaded,sample.demoRegulationData())
  const zip=await JSZip.loadAsync(original)
  zip.file('docProps/core.xml',(await zip.file('docProps/core.xml').async('string'))+'\n')
  const savedAgain=await zip.generateAsync({type:'uint8array'})
  assert.deepEqual(await sample.recognizeDemoRegulation(new File([savedAgain],'重新保存的范本.docx')),uploaded,'unchanged document text must remain recognized after a Word metadata change')
  assert.equal(sample.matchesDemoRegulationText('成人足球规则'),false)
  await assert.rejects(sample.recognizeDemoRegulation(new File(['other rules'],'another.pdf')),/Word/)
  assert.equal(uploaded.basicInfo.startDate,'2026-07-01')
  const source=uploaded.divisions[0]
  const mapped=rules.recognizedDivisionRulePayload(source,uploaded.sharedRegulationDetails)
  assert.equal(mapped.substitutionMode,'free')
  assert.equal(mapped.substitutionReentryAllowed,true)
  assert.equal(mapped.matchMinutes,50)
  assert.equal(mapped.rosterLimit,12)
  assert.equal(mapped.regulationDetails.minimumPlayersToContinue,5)
  assert.equal(source.expectedTeams,8)
  assert.equal(source.groupCount,2)
  assert.equal(source.teamsPerGroup,4)
  assert.equal(source.birthDateStart,undefined)
  assert.equal(uploaded.basicInfo.province,undefined)
  assert.equal(uploaded.basicInfo.contactPhone,undefined)
  const workspace=createDemoWorkspace()
  const event=workspace.request('dbQuery',{collection:'tournaments',operation:'add',data:{name:uploaded.basicInfo.name,regulationDivisionSuggestions:uploaded.divisions}}).data
  workspace.request('dbQuery',{collection:'divisions',operation:'add',data:{tournamentId:event._id,...source,...mapped,maxPlayersPerTeam:source.rosterLimit}})
  const divisions=workspace.request('dbQuery',{collection:'divisions',operation:'list',where:{tournamentId:event._id}}).data
  assert.equal(divisions.length,1,'template must not leave an extra default division')
  const teams=workspace.request('dbQuery',{collection:'teams',operation:'list',where:{ageGroup:source.ageGroup,synthetic:true}}).data
  assert.equal(teams.length,8)
  assert.ok(teams.every(team=>team.playerCount===12))
  console.log('PASS: original and re-saved Word recognized locally; unsupported source rejected; 8-side/50 minutes/12 players/free reentry preserved; unknown age and contacts not fabricated; one division and 8 matching virtual teams')
}finally{await server.close()}
