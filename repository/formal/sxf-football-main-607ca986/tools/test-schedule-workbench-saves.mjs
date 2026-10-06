import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'

const source = fs.readFileSync(new URL('../cloudfunctions/updateMatch/index.js', import.meta.url), 'utf8')
const colors = { home:{ jersey:'红',shorts:'白',socks:'红' },away:{ jersey:'蓝',shorts:'蓝',socks:'白' } }

async function update(data, matchChanges = {}, otherMatch = null) {
  const rows = {
    matches:{ m:{ _id:'m',orgId:'org',tournamentId:'t',divisionId:'default',status:'scheduled',matchDate:'2026-10-04',matchTime:'09:00',venue:'1号场',...matchChanges },...(otherMatch ? { other:{ _id:'other',tournamentId:'t',divisionId:'default',...otherMatch } } : {}) },
    tournaments:{ t:{ _id:'t',orgId:'org',competitionPlanLocked:true } },
    auth_sessions:{ s:{ _id:'s',userId:'u',active:true,expiresAt:new Date(Date.now()+600000) } },
    users:{ u:{ _id:'u',orgId:'org',role:'organizer' } },
    organizations:{ org:{ _id:'org' } }
  }
  let writes = 0
  const db = {
    command:{ gt:()=>({}),set:value=>({ __set:value }) },serverDate:()=>new Date(),
    collection(name) {
      const collection = {
        where:()=>collection,limit:()=>collection,
        get:async()=>({ data:structuredClone(Object.values(rows[name] || {})) }),
        doc(id) { return {
          get:async()=>({ data:rows[name]?.[id] ? [structuredClone(rows[name][id])] : [] }),
          update:async({ data:patch })=>{ if(name==='matches')writes++;Object.assign(rows[name][id],Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,value?.__set ?? value]))) }
        } }
      }
      return collection
    }
  }
  const cloud={ init(){},DYNAMIC_CURRENT_ENV:'test',database:()=>db }
  const context={ exports:{},require:name=>name==='wx-server-sdk' ? cloud : name==='crypto' ? crypto : null,console:{log(){},warn(){},error(){}},Date,Set,Map,Buffer }
  vm.runInNewContext(source,context)
  const result=await context.exports.main({ __authToken:'test',matchId:'m',data },{})
  return { result,match:rows.matches.m,writes }
}

const kit=await update({ kitColors:colors })
assert.equal(kit.result.success,true,JSON.stringify(kit.result))
assert.equal(kit.writes,1)
assert.equal(kit.match.kitColors.home.jersey,'红')
assert.equal(kit.match.executionSnapshot,undefined)

const selectedKit=await update({ kitColors:colors,kitSelection:{home:'primary',away:'secondary'} })
assert.equal(selectedKit.result.success,true,JSON.stringify(selectedKit.result))
assert.equal(selectedKit.match.kitSelection.away,'secondary')
assert.equal(selectedKit.match.executionSnapshot,undefined)

const sequence=await update({ matchSequence:8 })
assert.equal(sequence.result.success,true,JSON.stringify(sequence.result))
assert.equal(sequence.match.matchSequence,8)
assert.equal(sequence.match.executionSnapshot,undefined)

for (const denied of [
  await update({ kitColors:colors },{ status:'ongoing' }),
  await update({ kitColors:colors },{ refereeRecordLocked:true }),
  await update({ kitColors:{...colors,home:{...colors.home,jersey:'url(javascript:bad)'}} }),
  await update({ matchSequence:8 },{}, { matchSequence:8 })
]) {
  assert.equal(denied.result.success,false,JSON.stringify(denied.result))
  assert.equal(denied.writes,0)
}
console.log('PASS: locked-plan setup, snapshot preservation, invalid colors and duplicate sequence')
