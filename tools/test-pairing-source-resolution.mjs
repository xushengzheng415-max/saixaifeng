import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('module')
const originalLoad = Module._load
Module._load = function(request,parent,isMain){
  if(request==='wx-server-sdk')return { DYNAMIC_CURRENT_ENV:'test',init(){},database(){return { serverDate(){return 'SERVER_DATE'} }} }
  return originalLoad.call(this,request,parent,isMain)
}
const resolver = require('../cloudfunctions/resultCenter/index.js').__test
Module._load = originalLoad

const groupMatches = [
  { _id:'g1',divisionId:'youth',phase:'group',group:'A组',homeTeamId:'A1',homeTeamName:'A1队',awayTeamId:'A2',awayTeamName:'A2队',homeScore:2,awayScore:0,status:'finished',refereeReviewStatus:'archived' }
]
const standings = [{ divisionId:'youth',groupName:'A组',officialTeams:[{ rank:1,teamId:'A1',teamName:'A1队',logo:'a1.png' },{ rank:2,teamId:'A2',teamName:'A2队',logo:'a2.png' }] }]
const rankMap = resolver.buildOfficialGroupRankMap(groupMatches,standings)
assert.equal(rankMap.get('youth:A组:1').teamId,'A1')
assert.equal(resolver.resolveSourceTeam({type:'group_rank',groupName:'A组',rank:2},{divisionId:'youth'},new Map(),rankMap).teamId,'A2')

const unfinished = [{ ...groupMatches[0],refereeReviewStatus:'under_review' }]
assert.equal(resolver.buildOfficialGroupRankMap(unfinished,standings).size,0)

const sourceMatch = { _id:'x1',divisionId:'youth',matchNo:17,phase:'placement',homeTeamId:'A3',homeTeamName:'A3队',awayTeamId:'B4',awayTeamName:'B4队',homeScore:1,awayScore:2,status:'finished',refereeReviewStatus:'archived' }
const result = resolver.resolvedWinnerAndLoser(sourceMatch)
assert.equal(result.winner.teamId,'B4')
assert.equal(result.loser.teamId,'A3')
const matchByNo = new Map([['youth:17',sourceMatch]])
assert.equal(resolver.resolveSourceTeam({type:'match_winner',matchNo:17},{divisionId:'youth'},matchByNo,new Map()).teamId,'B4')
assert.equal(resolver.resolveSourceTeam({type:'match_loser',matchNo:17},{divisionId:'youth'},matchByNo,new Map()).teamId,'A3')

const parsed = resolver.sourceForSide({ homeSourceType:'match_winner',homeSourceLabel:'场序17胜者' },'home')
assert.deepEqual(parsed,{ type:'match_winner',matchNo:17 })

console.log(JSON.stringify({ passed:true,groupRankResolution:true,winnerLoserResolution:true,incompleteGroupsBlocked:true },null,2))
