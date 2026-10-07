import assert from 'node:assert/strict'
import { createServer } from '../web-admin-vue/node_modules/vite/dist/node/index.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web-admin-vue')
function storage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,String(value)), removeItem:key => map.delete(key) }
}
globalThis.localStorage = storage({ userInfo:JSON.stringify({ _id:'test-person', orgId:'real-own-org', organizationName:'真实机构' }), authToken:'local-test-token', isLoggedIn:'true' })
globalThis.sessionStorage = storage({ sxfTournamentStaff:'1', sxfStaffTournamentId:'real-shared-event', sxfStaffPermissions:'["event.teams"]' })
globalThis.window = { addEventListener(){}, dispatchEvent(){}, location:{ hash:'#/tournament-space', href:'http://localhost/preview/admin/#/tournament-space', pathname:'/preview/admin/' } }
let networkCalls = 0
globalThis.fetch = () => { networkCalls++; throw new Error('Production transport must not be called') }
const server = await createServer({ root, configFile:path.join(root,'vite.config.js'), base:'/preview/admin/', server:{ middlewareMode:true }, appType:'custom' })
try {
  const cloud = await server.ssrLoadModule('/src/utils/cloud.js')
  const mode = await server.ssrLoadModule('/src/utils/demoMode.js')
  const originalUser = localStorage.getItem('userInfo')
  const originalStaff = sessionStorage.getItem('sxfStaffTournamentId')
  mode.setDemoMode(true)
  assert.deepEqual(await cloud.queryList('tournaments', { where:{ orgId:'real-own-org' } }), [])
  const event = await cloud.addRecord('tournaments', { name:'运输隔离测试' })
  assert.ok(event._id.startsWith('demo-'))
  assert.equal((await cloud.queryById('tournaments',event._id)).name, '运输隔离测试')
  assert.ok((await cloud.queryAll('teams')).every(team => team.synthetic))
  await assert.rejects(cloud.callFunction('unknownServerWrite', {}), /不会调用真实接口/)
  await assert.rejects(cloud.callFunctionHTTP('bindPhone', {}), /不会调用真实接口/)
  await assert.rejects(cloud.updateRecord('tournaments','real-shared-event',{ name:'不得写入' }), /没有这条记录/)
  assert.equal(networkCalls, 0)
  assert.equal(localStorage.getItem('userInfo'), originalUser)
  assert.equal(sessionStorage.getItem('sxfStaffTournamentId'), originalStaff)
  localStorage.setItem('userInfo', JSON.stringify({ _id:'second-person' }))
  assert.deepEqual(await cloud.queryList('tournaments'), [])
  mode.setDemoMode(false)
  assert.equal(sessionStorage.getItem('sxfDemoWorkspaceV2'), null)
  assert.equal(mode.isDemoMode(), false)
  console.log('PASS: public cloud API routes send zero network calls; real IDs, account mutations and unknown actions rejected; own/shared identity unchanged; account switch and exit isolation')
} finally { await server.close() }
const formalServer = await createServer({ root, configFile:path.join(root,'vite.config.js'), base:'/admin/', server:{ middlewareMode:true }, appType:'custom' })
try {
  sessionStorage.setItem('sxfTournamentDemoMode', '1')
  const mode = await formalServer.ssrLoadModule('/src/utils/demoMode.js')
  assert.equal(mode.isDemoModeAvailable(), false)
  assert.equal(mode.isDemoMode(), false)
  assert.equal(mode.setDemoMode(true), false)
  console.log('PASS: formal admin cannot activate browser demo, even with a stale preview flag')
} finally { await formalServer.close() }
