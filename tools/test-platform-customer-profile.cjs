'use strict'
const assert = require('node:assert/strict')
const { accountSummary, getCustomerProfile } = require('../cloudfunctions/manageTournamentCenterContent/customerProfile.cjs')
function database(rows, fail) {
  return { command: { or: values => ({ or: values }) }, collection(name) {
    let where, skip = 0, limit = 100
    const query = {
      where(value) { where = value; return query }, orderBy() { return query }, skip(value) { skip = value; return query }, limit(value) { limit = value; return query },
      async get() {
        if (name === fail) throw new Error('permission denied')
        const matches = (row, condition) => condition?.or ? condition.or.some(item => matches(row, item)) : Object.entries(condition || {}).every(([key, value]) => row[key] === value)
        return { data: (rows[name] || []).filter(row => matches(row, where)).sort((a,b) => a._id.localeCompare(b._id)).slice(skip, skip + limit) }
      }
    }; return query
  } }
}
;(async () => {
  const unknown = accountSummary({ _id:'u', openId:'private-mini-id', wechatOpenId:'private-web-id', passwordHash:'secret', unionId:'private-union' })
  assert.equal(unknown.registrationSource, '来源未记录')
  assert.deepEqual(unknown.loginMethods, ['小程序微信','PC微信','账号密码'])
  assert.ok(!JSON.stringify(unknown).includes('private-'))
  assert.ok(!JSON.stringify(unknown).includes('secret'))
  assert.equal(accountSummary({registerSource:'mini'}).registrationSource, '小程序注册')
  const rows = {
    users:[{_id:'u1',name:'甲',orgId:'o1'}, {_id:'u2',name:'乙',orgId:'o1'}, {_id:'u3',name:'同名',orgId:'o2'}],
    organizations:[{_id:'o1',name:'机构',ownerId:'u1'}, {_id:'o2',name:'机构'}],
    teams:[{_id:'t1',name:'A队',orgId:'o1',creatorId:'u1'}, {_id:'t2',name:'B队',orgId:'o1',creatorId:'u2'}, {_id:'t3',name:'A队',orgId:'o2',creatorId:'u3'}],
    tournaments:[{_id:'e1',name:'甲赛',orgId:'o1',creatorId:'u2'}],
    players: Array.from({length:205}, (_,i) => ({_id:'p'+String(i).padStart(3,'0'),name:'球员'+i,teamId:'t1',phone:'private-phone',idCard:'private-id-card'})).concat([{_id:'other',name:'球员0',teamId:'t3'}])
  }
  const result = await getCustomerProfile(database(rows),{userId:'u1',orgId:'o1'})
  assert.equal(result.data.accounts.length,2)
  assert.equal(result.data.teams.length,2)
  assert.equal(result.data.players.length,205)
  assert.deepEqual(result.data.accounts.find(x=>x.id==='u1').createdTeams,['A队'])
  assert.deepEqual(result.data.accounts.find(x=>x.id==='u2').createdTeams,['B队'])
  assert.deepEqual(result.data.accounts.find(x=>x.id==='u1').createdTournaments,[])
  assert.ok(!JSON.stringify(result).includes('private-'))
  await assert.rejects(getCustomerProfile(database(rows,'players'),{userId:'u1',orgId:'o1'}),/无法读取players/)
  await assert.rejects(getCustomerProfile(database(rows),{userId:'missing'}),/不存在/)
  console.log('PASS: source vs binding, multi-account organization, stable IDs, complete pagination, failure visibility and safe fields')
})().catch(error=>{console.error(error);process.exitCode=1})
