import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRegistrationKitColors, registrationColorToHex } from '../web-admin-vue/src/utils/registrationKitColors.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const table = { rows:[
  { cells:[{column:0,span:6,text:''},{column:6,span:4,text:'运动员服装(颜色)'},{column:10,span:4,text:'守门员服装(颜色)'}] },
  { cells:[{column:0,span:6,text:''},{column:6,span:1,text:'上衣'},{column:7,span:2,text:'短裤'},{column:9,span:1,text:'长袜'},{column:10,span:2,text:'上衣'},{column:12,span:1,text:'短裤'},{column:13,span:1,text:'长袜'}] },
  { cells:[{column:4,span:2,text:'A'},{column:6,span:1,text:'橙'},{column:7,span:2,text:'白'},{column:9,span:1,text:'白'},{column:10,span:2,text:'蓝白条'},{column:12,span:1,text:'黑'},{column:13,span:1,text:'白'}] },
  { cells:[{column:4,span:2,text:'B'},{column:6,span:1,text:'蓝白条'},{column:7,span:2,text:'黑'},{column:9,span:1,text:'白'},{column:10,span:2,text:'橙'},{column:12,span:1,text:'白'},{column:13,span:1,text:'白'}] }
] }

const parsed = parseRegistrationKitColors(table)
assert.deepEqual(parsed.kitColors, {
  primary:{ jersey:'#F47A1F', shorts:'#FFFFFF', socks:'#FFFFFF' },
  secondary:{ jersey:'#1455B5', shorts:'#161A18', socks:'#FFFFFF' }
})
assert.equal(parsed.kitColorLabels.secondary.jersey, '蓝白条')
assert.equal(registrationColorToHex('蓝白条'), '#1455B5')
assert.deepEqual(parsed.warnings, [])

const importer = read('web-admin-vue/src/components/tournament/TeamRegistrationWordImporter.vue')
const teamDetail = read('web-admin-vue/src/views/team/TeamDetail.vue')
const registrationFlow = read('cloudfunctions/tournamentRegistrationFlow/index.js')
const webLoginApi = read('cloudfunctions/webLoginApi/index.js')
const productRules = read('docs/PRODUCT_RULES.md')

assert.match(importer, /kitColors:\s*team\.kitColors/)
assert.match(importer, /主比赛服 A/)
assert.match(registrationFlow, /kitColorsSource:'registration_docx_import'/)
assert.match(teamDetail, /<section class="synthetic-player-panel">/)
assert.doesNotMatch(teamDetail, /<section v-if="isSyntheticTeam" class="synthetic-player-panel">/)
assert.match(teamDetail, /Promise\.all\(\[loadTournamentTeamContext\(\), loadPlayers\(\)\]\)/)
assert.match(webLoginApi, /const EVENT_PROFESSIONAL_FREE_PHASE = true/)
assert.match(webLoginApi, /professionalEntitlementStatus:\s*EVENT_PROFESSIONAL_FREE_PHASE \? 'free_current_phase'/)
assert.match(productRules, /简易模式和专业模式当前均免费/)
assert.match(productRules, /球队球员基础资料属于赛事协作基础能力/)

console.log('team registration kit and free mode contract: PASS')
