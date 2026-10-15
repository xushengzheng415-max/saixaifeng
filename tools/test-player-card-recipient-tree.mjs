import assert from 'node:assert/strict'
import { recipientTree, checkedRecipientIds } from '../platform-admin-vue/src/utils/playerCardRecipients.js'
const players = [{id:'1',name:'同名',teamName:'甲队',eligible:true},{id:'2',name:'同名',teamName:'乙队',eligible:true},{id:'3',name:'待核定球员',eligible:false,reason:'竞技等级待核定'},{id:'4',name:'旧名单球员',eligible:true}]
const catalog = {teams:[{id:'a',name:'甲队'},{id:'b',name:'乙队'}],players:[{id:'1',teamId:'a'},{id:'2',teamId:'b'},{id:'3',teamId:'a'}],tournaments:[{id:'cup',name:'正式赛事'},{id:'other',name:'另一赛事'}],rosters:[{tournamentId:'cup',teamId:'a',playerIds:['1','3','unauthorized']},{tournamentId:'cup',teamId:'b',playerIds:['2']},{tournamentId:'other',teamId:'a',playerIds:['1']}]}
const leaves = nodes => nodes.flatMap(node => node.children ? leaves(node.children) : [node])
let tree = recipientTree(players,catalog,{type:'platform'})
assert.equal(tree[0].label,'全平台')
assert.equal(leaves(tree).filter(node=>node.playerId==='1').length,2)
assert.deepEqual(checkedRecipientIds(leaves(tree)),['1','2','4'],'cross-event appearances deduplicate; unknown directory IDs grant nothing')
assert.equal(leaves(tree).find(node=>node.playerId==='3').disabled,true)
tree=recipientTree(players,catalog,{type:'tournament',targetId:'cup',targetName:'正式赛事'})
assert.ok(!JSON.stringify(tree).includes('另一赛事'))
assert.ok(leaves(tree).some(node=>node.playerId==='4'),'legacy candidate without directory roster stays available')
tree=recipientTree(players,catalog,{type:'platform'},'team','甲队',['1'])
assert.deepEqual(checkedRecipientIds(leaves(tree)),[],'already added and ineligible rows cannot be added')
tree=recipientTree(players,catalog,{type:'platform'},'player','同名')
assert.deepEqual(checkedRecipientIds(leaves(tree)),['1','2'],'same names are separate stable IDs')
assert.deepEqual(checkedRecipientIds(leaves(recipientTree(players,catalog,{type:'platform'},'tournament','乙队'))),['2'],'filtered parent checks include only visible matches')
console.log('PASS: authorized-ID hierarchy, tournament/team/player grouping, filter isolation, disabled grades, deduplication and legacy fallback')
