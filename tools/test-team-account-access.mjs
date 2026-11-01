import assert from 'node:assert/strict'
import { canAssignTeamAccounts, teamStaffDisplayRows, teamStaffPhone } from '../web-admin-vue/src/utils/teamAccountAccess.js'

const base = { tournamentId:'event-1', tournament:{ orgId:'org-1' }, user:{ _id:'shared-user' },
  scope:{ activeOrgId:'org-1', isStaff:true, isOwner:false, grants:[{ orgId:'org-1', tournamentId:'event-1', status:'active', permissions:['event.registration'] }] } }
assert.equal(canAssignTeamAccounts(base), true, '共享账号在授权赛事内可分配球队账号，无需机构主账号身份')
assert.equal(canAssignTeamAccounts({...base,tournamentId:'other-event'}), false)
assert.equal(canAssignTeamAccounts({...base,tournament:{orgId:'other-org'}}), false)
assert.equal(canAssignTeamAccounts({...base,scope:{...base.scope,grants:[{...base.scope.grants[0],status:'disabled'}]}}), false)
assert.equal(canAssignTeamAccounts({...base,scope:{...base.scope,grants:[]}}), false)
assert.equal(canAssignTeamAccounts({...base,scope:{activeOrgId:'org-1',isOwner:true}}), true)
assert.equal(canAssignTeamAccounts({...base,tournamentId:''}), false)

const rows = [{_id:'coach-1',name:'主教练',phone:''},{_id:'leader-1',name:'领队',phone:''}]
const coachOwner = {staffId:'coach-1',role:'staff:coach-1',phone:'18700003316',name:'主教练',accountType:'owner'}
assert.deepEqual(teamStaffDisplayRows(rows,coachOwner), rows, '子账号升主账号，工作人员手机号为空也不能新增账号持有人行')
assert.deepEqual(teamStaffDisplayRows(rows,{...coachOwner,staffId:'',role:'staff:coach-1'}), rows)
assert.deepEqual(teamStaffDisplayRows(rows,{...coachOwner,staffId:'leader-1',role:'staff:leader-1'}), rows, '互换回来仍为两行')
assert.equal(teamStaffDisplayRows(rows,{...coachOwner,staffId:'unlisted',role:'staff:unlisted'}).length, 3, '主账号确无工作人员资料时仍保留归属显示')
assert.equal(teamStaffPhone(rows[0],coachOwner), '18700003316')
assert.equal(teamStaffPhone({phoneNumber:'150 0000 2121'},null), '15000002121')
assert.equal(teamStaffPhone({phone:''},null), '')
console.log('共享账号分配权限与主子账号互换显示测试：14/14 通过')
