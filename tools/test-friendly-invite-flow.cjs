// tools/test-friendly-invite-flow.cjs
// 约球完整链路自检（2026-11-02 口径）：
//   发起邀约 → H5 报名 → 管理页名单 → 勾签到/代签/移除 → 球员取消 → 对方接战 → 人工成局 → 取消并通知
//
// 做法：把 wx-server-sdk 换成内存数据库桩件，直接跑云函数的 exports.main，
// 校验鉴权、三计数分离、条件更新防超卖、状态机、历史字段口径。
// 不连真实环境、不发网络请求（模板消息 ID 未配置，通知路径只统计 skip）。
//
// 运行：node tools/test-friendly-invite-flow.cjs

const Module = require('module')
const path = require('path')

// ===== 断言 =====
let passed = 0
const failures = []
function check(label, condition, detail) {
  if (condition) {
    passed += 1
    console.log('  ✓ ' + label)
    return true
  }
  failures.push(label + (detail === undefined ? '' : (' → ' + JSON.stringify(detail))))
  console.log('  ✗ ' + label + (detail === undefined ? '' : (' → ' + JSON.stringify(detail))))
  return false
}

// ===== 内存数据库桩件 =====
function clone(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const CMD = '__mockCommand'
function cmd(type, value) { return { [CMD]: type, value } }
const command = {
  inc: value => cmd('inc', value),
  set: value => cmd('set', value),
  lt: value => cmd('lt', value),
  gt: value => cmd('gt', value),
  in: value => cmd('in', value),
  eq: value => cmd('eq', value),
  neq: value => cmd('neq', value),
  or: value => cmd('or', value),
  and: value => cmd('and', value)
}

function isCmd(value) {
  return Boolean(value && typeof value === 'object' && value[CMD])
}

function matchValue(condition, actual) {
  if (!isCmd(condition)) return actual === condition
  switch (condition[CMD]) {
    case 'lt': return typeof actual === 'number' && actual < condition.value
    case 'gt': return typeof actual === 'number' && actual > condition.value
    case 'in': return Array.isArray(condition.value) && condition.value.indexOf(actual) >= 0
    case 'eq': return actual === condition.value
    case 'neq': return actual !== condition.value
    default: return false
  }
}

function matchDoc(doc, where) {
  if (!where) return true
  if (isCmd(where) && where[CMD] === 'or') return where.value.some(item => matchDoc(doc, item))
  if (isCmd(where) && where[CMD] === 'and') return where.value.every(item => matchDoc(doc, item))
  return Object.keys(where).every(key => matchValue(where[key], doc[key]))
}

function applyUpdate(doc, data) {
  Object.keys(data || {}).forEach(key => {
    const value = data[key]
    if (isCmd(value) && value[CMD] === 'inc') {
      doc[key] = (typeof doc[key] === 'number' ? doc[key] : 0) + Number(value.value)
      return
    }
    if (isCmd(value) && value[CMD] === 'set') { doc[key] = clone(value.value); return }
    doc[key] = clone(value)
  })
}

const store = {}
let idSeed = 0
function nextId(name) {
  idSeed += 1
  return (name || 'doc') + '_' + idSeed
}

function collection(name) {
  if (!store[name]) store[name] = []
  const rows = () => store[name]

  function buildQuery(where, options) {
    const state = Object.assign({ limit: 100, field: '', orderBy: null }, options || {})
    const api = {
      limit(value) { state.limit = Number(value) > 0 ? Number(value) : state.limit; return api },
      field(value) { state.field = String(value || ''); return api },
      orderBy(key, dir) { state.orderBy = { key, dir }; return api },
      get() { return Promise.resolve({ data: select() }) },
      count() { return Promise.resolve({ total: select().length }) },
      update({ data } = {}) {
        let updated = 0
        rows().forEach(doc => {
          if (matchDoc(doc, where)) { applyUpdate(doc, data); updated += 1 }
        })
        return Promise.resolve({ stats: { updated } })
      }
    }
    function select() {
      let list = rows().filter(doc => matchDoc(doc, where))
      if (state.orderBy) {
        const { key, dir } = state.orderBy
        list = list.slice().sort((a, b) => {
          const left = a[key]
          const right = b[key]
          if (left === right) return 0
          const factor = dir === 'desc' ? -1 : 1
          return (left > right ? 1 : -1) * factor
        })
      }
      list = list.slice(0, state.limit).map(doc => {
        const copy = clone(doc)
        if (!state.field) return copy
        const picked = { _id: copy._id }
        state.field.split(/\s+/).filter(Boolean).forEach(key => {
          if (key in copy) picked[key] = copy[key]
        })
        return picked
      })
      return list
    }
    return api
  }

  return {
    doc(id) {
      return {
        get() {
          const found = rows().find(item => item._id === id)
          return Promise.resolve({ data: found ? clone(found) : null })
        },
        update({ data } = {}) {
          const found = rows().find(item => item._id === id)
          if (!found) return Promise.resolve({ stats: { updated: 0 } })
          applyUpdate(found, data)
          return Promise.resolve({ stats: { updated: 1 } })
        },
        set({ data } = {}) {
          const index = rows().findIndex(item => item._id === id)
          const next = Object.assign({}, data, { _id: id })
          if (index >= 0) rows()[index] = next
          else rows().push(next)
          return Promise.resolve({ stats: { updated: 1 } })
        },
        remove() {
          const index = rows().findIndex(item => item._id === id)
          if (index >= 0) rows().splice(index, 1)
          return Promise.resolve({ stats: { removed: index >= 0 ? 1 : 0 } })
        }
      }
    },
    where(where) { return buildQuery(where) },
    add({ data } = {}) {
      const _id = String(data && data._id ? data._id : nextId(name))
      rows().push(Object.assign(clone(data), { _id }))
      return Promise.resolve({ _id })
    },
    field(value) { return buildQuery(null, { field: value }) }
  }
}

let wxContext = { OPENID: '', APPID: 'test-appid', UNIONID: '' }
const sdk = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  getWXContext() { return Object.assign({}, wxContext) },
  database() {
    return {
      command,
      collection,
      serverDate: () => new Date(),
      createCollection: () => Promise.resolve({})
    }
  }
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return sdk
  return originalLoad.call(this, request, parent, isMain)
}

// 通知通道相关环境变量一律清空：自检绝不发真实请求，模板 ID 全部由用例按需注入
;[
  'SXF_INVITE_TEMPLATE_ID', 'SXF_SIGNIN_TEMPLATE_ID', 'SXF_CANCEL_TEMPLATE_ID',
  'SXF_FOOTBALL_WECHAT_BRIDGE_URL', 'SXF_FOOTBALL_WECHAT_BRIDGE_SECRET',
  'SERVICE_ACCOUNT_APP_ID', 'SERVICE_ACCOUNT_APP_SECRET'
].forEach(key => { delete process.env[key] })

const center = require(path.join(__dirname, '..', 'cloudfunctions', 'friendlyMatchCenter', 'index.js'))
function call(event) { return center.main(event, {}) }
function setCaller(openid) { wxContext = { OPENID: openid || '', APPID: 'test-appid', UNIONID: '' } }

// 按指定环境变量重新加载云函数（CONFIG 在模块加载时快照环境变量）
function reloadCenter(env) {
  Object.keys(env || {}).forEach(key => {
    const value = env[key]
    if (value) process.env[key] = value
    else delete process.env[key]
  })
  const file = path.join(__dirname, '..', 'cloudfunctions', 'friendlyMatchCenter', 'index.js')
  delete require.cache[require.resolve(file)]
  const reloaded = require(file)
  return event => reloaded.main(event, {})
}

// ===== WXML 静态检查 =====
const fs = require('fs')
const DISCOVER_DIR = path.join(__dirname, '..', 'miniprogram', 'pages', 'discover')
const WXML_FILES = [
  { wxml: 'discover.wxml', js: 'discover.js' },
  { wxml: 'invite-create/invite-create.wxml', js: 'invite-create/invite-create.js' },
  { wxml: 'invite-manage/invite-manage.wxml', js: 'invite-manage/invite-manage.js' }
]

// 仅允许：简单插值、简单取反（!x）、简单或（a || b）；其余一律视为违规
function expressionIssues(expr) {
  const issues = []
  if (/\?/.test(expr)) issues.push('三元表达式')
  if (/===|!==|==|!=|>=|<=|(?<![=!<>])[<>](?![=])/.test(expr)) issues.push('比较运算')
  if (/\.\s*[A-Za-z_$][\w$]*\s*\(/.test(expr)) issues.push('方法调用')
  if (/\[/.test(expr)) issues.push('数组索引')
  if (/\(/.test(expr)) issues.push('括号/函数调用')
  if (/[+\-*/%]/.test(expr)) issues.push('算术运算')
  if (/!/.test(expr.replace(/!=/g, '')) && !/^(?:[^|]*\|\|\s*)*!?\s*[\w$.]+(?:\.\w+)*$/.test(expr)) {
    issues.push('非简单取反')
  }
  return issues
}

function scanWxmlFiles() {
  WXML_FILES.forEach(item => {
    const file = path.join(DISCOVER_DIR, item.wxml)
    if (!fs.existsSync(file)) {
      check(item.wxml + ' 存在', false)
      return
    }
    const source = fs.readFileSync(file, 'utf8')
    const problems = []
    const re = /\{\{([\s\S]*?)\}\}/g
    let match
    let expressions = 0
    while ((match = re.exec(source)) !== null) {
      expressions += 1
      const expr = match[1].trim()
      const line = source.slice(0, match.index).split('\n').length
      const issues = expressionIssues(expr)
      if (issues.length) problems.push({ line, expr, issues })
    }
    check(item.wxml + ' 表达式合规（' + expressions + ' 处）', problems.length === 0, problems.slice(0, 6))
  })
}

function handlerNames(jsSource) {
  const names = new Set()
  const re = /\n\s{2}([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/g
  let match
  while ((match = re.exec(jsSource)) !== null) names.add(match[1])
  return names
}

function checkHandlerBindings() {
  WXML_FILES.forEach(item => {
    const wxmlFile = path.join(DISCOVER_DIR, item.wxml)
    const jsFile = path.join(DISCOVER_DIR, item.js)
    if (!fs.existsSync(wxmlFile) || !fs.existsSync(jsFile)) {
      check(item.wxml + ' 与 js 都能读取', false)
      return
    }
    const wxml = fs.readFileSync(wxmlFile, 'utf8')
    const handlers = handlerNames(fs.readFileSync(jsFile, 'utf8'))
    const used = new Set()
    const re = /\b(?:bind|catch)(?::)?[a-zA-Z]+="([^"{}]+)"/g
    let match
    while ((match = re.exec(wxml)) !== null) {
      const name = match[1].trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) used.add(name)
    }
    const missing = Array.from(used).filter(name => !handlers.has(name))
    check(item.wxml + ' 事件处理函数齐全（' + used.size + ' 个）', missing.length === 0, missing)
  })
}

// ===== 种子数据 =====
function seed() {
  store.users = [
    { _id: 'u_manager', openId: 'openid-manager', phone: '13800000001', name: '队长甲' },
    { _id: 'u_other', openId: 'openid-other', phone: '13800000009', name: '队长乙' },
    { _id: 'u_player', openId: 'openid-player', phone: '13800000011', name: '球员丙' }
  ]
  store.teams = [
    { _id: 'team_a', name: 'A 队', ownerId: 'u_manager', city: '郑州' },
    { _id: 'team_b', name: 'B 队', ownerId: 'u_other', city: '郑州' }
  ]
  store.team_memberships = [
    { _id: 'm1', teamId: 'team_a', userId: 'u_manager', role: 'owner', status: 'active' },
    { _id: 'm2', teamId: 'team_b', userId: 'u_other', role: 'owner', status: 'active' }
  ]
  store.friendly_invites = []
  store.friendly_match_responses = []
  store.friendly_matches = []
  store.friendly_match_signups = []
  store.player_team_history = []
}

async function createInvite(extra) {
  setCaller('openid-manager')
  const res = await call(Object.assign({
    action: 'createInvite',
    teamId: 'team_a',
    teamName: 'A 队',
    matchDate: '2026-11-10',
    matchTime: '20:00',
    venue: '市体育中心 1 号场',
    maxPlayers: 11,
    deadline: '2026-11-09'
  }, extra || {}))
  return res
}

function inviteRow(inviteId) {
  return (store.friendly_invites || []).find(row => row._id === inviteId)
}

async function main() {
  console.log('== 约球完整链路自检 ==')
  seed()

  // 1. 健康检查：新 action 已注册
  console.log('\n[1] healthCheck 与 action 注册')
  const health = await call({ action: 'healthCheck' })
  check('healthCheck ok', health && health.ok === true, health)
  check('版本 1.8.0', health && health.data && health.data.version === '1.8.0', health && health.data && health.data.version)
  check('已导出报名/状态机 action', health && health.data && ['signUpInvite', 'listInviteSignups', 'cancelInvite', 'confirmInvite'].every(a => health.data.actions.indexOf(a) >= 0))
  check('状态机五态', health && health.data && ['open', 'accepted', 'confirmed', 'cancelled', 'closed'].every(s => health.data.inviteStates.indexOf(s) >= 0))

  // 2. createInvite 鉴权
  console.log('\n[2] createInvite 只允许发起球队管理者')
  setCaller('openid-other')
  const forbidden = await call({
    action: 'createInvite', teamId: 'team_a', teamName: 'A 队', matchDate: '2026-11-10', maxPlayers: 11
  })
  check('非本队管理者被拒', forbidden && forbidden.ok === false && forbidden.code === 'FORBIDDEN', forbidden)
  setCaller('')
  const anonymous = await call({ action: 'createInvite', teamId: 'team_a', teamName: 'A 队', matchDate: '2026-11-10' })
  check('未登录被拒', anonymous && anonymous.ok === false && anonymous.code === 'UNAUTHORIZED', anonymous)

  const created = await createInvite()
  check('管理者创建成功', created && created.ok === true, created)
  const inviteId = created.data.inviteId
  const token = created.data.signinToken
  const signinUrl = created.data.signinUrl
  check('返回 H5 报名链接', typeof signinUrl === 'string' && signinUrl.indexOf('friendly-signin.html?token=') > 0, signinUrl)
  check('创建即 open', created.data.status === 'open' && created.data.statusText === '报名中', created.data)
  const createdRow = inviteRow(inviteId)
  check('三计数从 0 起算且已知', createdRow.signupCount === 0 && createdRow.signupCountKnown === true &&
    createdRow.checkinCount === 0 && createdRow.acceptedCount === 0, {
    signupCount: createdRow.signupCount, checkinCount: createdRow.checkinCount, acceptedCount: createdRow.acceptedCount
  })

  // 3. getInvite 按身份脱敏
  console.log('\n[3] getInvite 按身份脱敏')
  setCaller('')
  const publicView = await call({ action: 'getInvite', token })
  check('匿名可读基本信息', publicView && publicView.ok === true && publicView.data.teamName === 'A 队', publicView && publicView.data && publicView.data.teamName)
  check('匿名不给签到链接', publicView && publicView.data && publicView.data.signinUrl === undefined && publicView.data.signinToken === undefined)
  check('匿名不给创建人', publicView && publicView.data && publicView.data.createdByUserId === undefined)
  setCaller('openid-manager')
  const managerView = await call({ action: 'getInvite', token })
  check('管理者视图含报名链接', managerView && managerView.data && managerView.data.managerView === true && managerView.data.signinUrl === signinUrl)

  // 4. H5 报名（姓名 + 手机号）
  console.log('\n[4] H5 报名与幂等')
  setCaller('')
  const signA = await call({ action: 'signUpInvite', token, userName: '张三', userPhone: '13800000011', side: 'opponent' })
  check('报名成功', signA && signA.ok === true && signA.data.signupCount === 1, signA)
  const signB = await call({ action: 'signUpInvite', token, userName: '李四', userPhone: '13800000012' })
  check('第二个报名成功', signB && signB.ok === true && signB.data.signupCount === 2, signB && signB.data)
  const signC = await call({ action: 'signUpInvite', token, userName: '王五', userPhone: '13800000013' })
  check('第三个报名成功', signC && signC.ok === true && signC.data.signupCount === 3, signC && signC.data)
  const repeat = await call({ action: 'signUpInvite', token, userName: '张三', userPhone: '13800000011' })
  check('同手机号幂等不重复计数', repeat && repeat.ok === true && repeat.data.alreadySignedUp === true && repeat.data.signupCount === 3, repeat && repeat.data)
  check('报名行带手机号脱敏与 kind', (() => {
    const row = store.friendly_match_responses.find(r => r.userName === '张三')
    return row && row.kind === 'signup' && row.status === 'signup' && row.phoneKey === '13800000011' && row.userPhone === '138****0011'
  })())
  const badPhone = await call({ action: 'signUpInvite', token, userName: '错号', userPhone: '123' })
  check('非法手机号被拒', badPhone && badPhone.ok === false && badPhone.code === 'INVALID_PARAM', badPhone)
  const noName = await call({ action: 'signUpInvite', token, userName: '', userPhone: '13800000014' })
  check('缺姓名被拒', noName && noName.ok === false && noName.code === 'INVALID_PARAM', noName)

  // 5. 我自己的报名状态（H5 查看 + 取消）
  console.log('\n[5] getMyInviteStatus / 球员取消报名')
  const mine = await call({ action: 'getMyInviteStatus', token, userPhone: '13800000011' })
  check('查到自己的报名', mine && mine.ok === true && mine.data.mySignup && mine.data.mySignup.status === 'signup', mine && mine.data && mine.data.mySignup)
  check('可取消报名', mine && mine.data && mine.data.mySignup.canCancel === true)
  const other = await call({ action: 'getMyInviteStatus', token, userPhone: '13800000019' })
  check('未报名手机号返回空报名', other && other.ok === true && other.data.mySignup === null, other && other.data && other.data.mySignup)

  // 6. 管理页名单：权限 + 分页 + 角色区分
  console.log('\n[6] listInviteSignups 权限与分页')
  setCaller('openid-other')
  const denyList = await call({ action: 'listInviteSignups', inviteId })
  check('非本队管理者看不到名单', denyList && denyList.ok === false && denyList.code === 'FORBIDDEN', denyList)
  setCaller('openid-manager')
  const list = await call({ action: 'listInviteSignups', inviteId, pageSize: 5 })
  check('名单返回报名 3 人', list && list.ok === true && list.data.counts.signup === 3, list && list.data && list.data.counts)
  check('名单不含签到链接外的敏感字段', list && list.data && list.data.rows.every(row => row.phoneFull === '' && row.phoneMasked.indexOf('****') > 0), list && list.data && list.data.rows.map(r => r.phoneMasked))
  const listWithPhone = await call({ action: 'listInviteSignups', inviteId, withPhone: true })
  check('显式要求时可回手机号明文', listWithPhone && listWithPhone.data.rows.some(row => /^\d{11}$/.test(row.phoneFull)))
  const paged = await call({ action: 'listInviteSignups', inviteId, pageSize: 5, page: 2 })
  check('第 2 页正确切片', paged && paged.ok === true && paged.data.page === 2 && paged.data.total === 3, paged && paged.data && { page: paged.data.page, total: paged.data.total, rows: paged.data.rows.length })

  // 7. 勾签到 / 幂等 / 代签
  console.log('\n[7] 勾签到、幂等、代签')
  const zhangsan = store.friendly_match_responses.find(r => r.userName === '张三')
  const checkin1 = await call({ action: 'checkInInviteSignup', inviteId, responseId: zhangsan._id, present: true })
  check('勾签到成功', checkin1 && checkin1.ok === true && checkin1.data.present === true && checkin1.data.checkinCount === 1, checkin1 && checkin1.data)
  const checkinRepeat = await call({ action: 'checkInInviteSignup', inviteId, responseId: zhangsan._id, present: true })
  check('重复勾选幂等', checkinRepeat && checkinRepeat.ok === true && checkinRepeat.data.already === true && checkinRepeat.data.checkinCount === 1, checkinRepeat && checkinRepeat.data)
  const uncheck = await call({ action: 'checkInInviteSignup', inviteId, responseId: zhangsan._id, present: false })
  check('取消签到回退计数', uncheck && uncheck.ok === true && uncheck.data.present === false && uncheck.data.checkinCount === 0, uncheck && uncheck.data)
  await call({ action: 'checkInInviteSignup', inviteId, responseId: zhangsan._id, present: true })
  const proxy = await call({ action: 'proxyCheckInInvite', inviteId, userName: '赵六', userPhone: '13800000015' })
  check('代签只加签到不加入报名', proxy && proxy.ok === true && proxy.data.proxy === true && proxy.data.checkinCount === 2, proxy && proxy.data)
  const afterProxy = inviteRow(inviteId)
  check('代签后报名数仍为 3', afterProxy.signupCount === 3 && afterProxy.checkinCount === 2, { signup: afterProxy.signupCount, checkin: afterProxy.checkinCount })

  // 8. 球员取消 / 管理端移除
  console.log('\n[8] 取消报名与移除')
  const cancelSelf = await call({ action: 'cancelInviteSignup', token, userPhone: '13800000012' })
  check('球员自行取消成功', cancelSelf && cancelSelf.ok === true && cancelSelf.data.status === 'cancelled' && cancelSelf.data.signupCount === 2, cancelSelf && cancelSelf.data)
  const cancelAgain = await call({ action: 'cancelInviteSignup', token, userPhone: '13800000012' })
  check('重复取消幂等', cancelAgain && cancelAgain.ok === true && cancelAgain.data.already === true, cancelAgain && cancelAgain.data)
  setCaller('openid-manager')
  const wangwu = store.friendly_match_responses.find(r => r.userName === '王五')
  const removed = await call({ action: 'removeInviteSignup', inviteId, responseId: wangwu._id, reason: '名单已满' })
  check('移除报名释放名额', removed && removed.ok === true && removed.data.removed === true && removed.data.signupCount === 1, removed && removed.data)
  const afterRemove = inviteRow(inviteId)
  check('服务端计数同步', afterRemove.signupCount === 1 && afterRemove.checkinCount === 2, { signup: afterRemove.signupCount, checkin: afterRemove.checkinCount })

  // 9. 对方接战 → accepted
  console.log('\n[9] 对方接战推进状态机')
  setCaller('openid-other')
  const accepted = await call({ action: 'respondInvite', token, status: 'accepted', teamId: 'team_b', teamName: 'B 队' })
  check('接战成功', accepted && accepted.ok === true && accepted.data.inviteStatus === 'accepted', accepted && accepted.data)
  const teamRow = store.friendly_match_responses.find(r => r.kind === 'team')
  check('应战行带队伍标识', teamRow && teamRow.teamId === 'team_b' && teamRow.teamName === 'B 队', teamRow && { teamId: teamRow.teamId, teamName: teamRow.teamName })
  const afterAccept = inviteRow(inviteId)
  check('邀约记首个接战队伍', afterAccept.status === 'accepted' && afterAccept.acceptedTeamName === 'B 队' && afterAccept.acceptedCount === 1, {
    status: afterAccept.status, acceptedTeamName: afterAccept.acceptedTeamName, acceptedCount: afterAccept.acceptedCount
  })
  const acceptAgain = await call({ action: 'respondInvite', token, status: 'accepted', teamId: 'team_b', teamName: 'B 队' })
  check('同队重复接战幂等', acceptAgain && acceptAgain.ok === true && acceptAgain.data.alreadyResponded === true, acceptAgain && acceptAgain.data)
  setCaller('openid-manager')
  const teamRowCheckin = await call({ action: 'checkInInviteSignup', inviteId, responseId: teamRow._id, present: true })
  check('队伍应战行不能勾签到', teamRowCheckin && teamRowCheckin.ok === false && teamRowCheckin.code === 'INVALID_DATA', teamRowCheckin && teamRowCheckin.code)
  const teamRowRemove = await call({ action: 'removeInviteSignup', inviteId, responseId: teamRow._id })
  check('队伍应战行不能按报名移除', teamRowRemove && teamRowRemove.ok === false && teamRowRemove.code === 'INVALID_DATA', teamRowRemove && teamRowRemove.code)

  // 10. 人工成局 → confirmed，并通知已报名球员
  console.log('\n[10] 人工成局与通知')
  setCaller('openid-manager')
  const confirmed = await call({ action: 'confirmInvite', inviteId })
  check('人工点成局成功', confirmed && confirmed.ok === true && confirmed.data.status === 'confirmed' && confirmed.data.from === 'accepted', confirmed && confirmed.data)
  check('成局通知覆盖在册报名', confirmed && confirmed.data.notify && confirmed.data.notify.total === 2, confirmed && confirmed.data.notify)
  check('未配置模板时只统计 skip', confirmed && confirmed.data.notify && confirmed.data.notify.templateConfigured === false && confirmed.data.notify.sent === 0 && confirmed.data.notify.skipped === 2, confirmed && confirmed.data.notify)
  const myAfterConfirm = await call({ action: 'getMyInviteStatus', token, userPhone: '13800000011' })
  check('成局（非终态）仍允许球员取消', myAfterConfirm && myAfterConfirm.data.mySignup.canCancel === true, myAfterConfirm && myAfterConfirm.data.mySignup)

  // 11. 取消邀约（终态 + 通知）与禁止回退
  console.log('\n[11] 取消邀约与状态机终态')
  const cancelInvite = await call({ action: 'cancelInvite', inviteId, reason: '场地被临时占用' })
  check('取消成功', cancelInvite && cancelInvite.ok === true && cancelInvite.data.status === 'cancelled', cancelInvite && cancelInvite.data)
  check('取消原因落库', inviteRow(inviteId).cancelReason === '场地被临时占用', inviteRow(inviteId).cancelReason)
  check('取消后通知已报名球员', cancelInvite.data.notify && cancelInvite.data.notify.kind === 'cancelled' && cancelInvite.data.notify.total === 2, cancelInvite.data.notify)
  const reconfirm = await call({ action: 'confirmInvite', inviteId })
  check('终态不可再成局', reconfirm && reconfirm.ok === false && reconfirm.code === 'CLOSED', reconfirm)
  setCaller('')
  const closedView = await call({ action: 'getInvite', token })
  check('取消后 H5 显示已取消', closedView && closedView.data.status === 'cancelled' && closedView.data.statusText === '已取消' && closedView.data.canSignUp === false, closedView && { status: closedView.data.status, canSignUp: closedView.data.canSignUp })
  const afterTerminal = await call({ action: 'signUpInvite', token, userName: '晚到', userPhone: '13800000016' })
  check('取消后拒绝新报名', afterTerminal && afterTerminal.ok === false && afterTerminal.code === 'CLOSED', afterTerminal)
  const myAfterCancel = await call({ action: 'getMyInviteStatus', token, userPhone: '13800000011' })
  check('终态后不可再取消报名', myAfterCancel && myAfterCancel.data.mySignup.canCancel === false && myAfterCancel.data.status === 'cancelled', myAfterCancel && myAfterCancel.data.mySignup)
  setCaller('openid-manager')
  const terminalCheckin = await call({ action: 'checkInInviteSignup', inviteId, responseId: zhangsan._id, present: true })
  check('终态不可再勾签到', terminalCheckin && terminalCheckin.ok === false && terminalCheckin.code === 'CLOSED', terminalCheckin)
  const terminalProxy = await call({ action: 'proxyCheckInInvite', inviteId, userName: '迟到球员', userPhone: '13800000017' })
  check('终态不可再代签', terminalProxy && terminalProxy.ok === false && terminalProxy.code === 'CLOSED', terminalProxy)
  const terminalList = await call({ action: 'listInviteSignups', inviteId })
  check('终态仍可查看名单', terminalList && terminalList.ok === true && terminalList.data.invite.terminal === true, terminalList && terminalList.data && terminalList.data.invite.status)

  // 12. 满员防超卖
  console.log('\n[12] 最后一席防超卖')
  setCaller('openid-manager')
  const small = await createInvite({ maxPlayers: 1 })
  const smallId = small.data.inviteId
  const smallToken = small.data.signinToken
  setCaller('')
  const first = await call({ action: 'signUpInvite', token: smallToken, userName: '甲', userPhone: '13800000021' })
  check('第 1 人报名成功', first && first.ok === true, first)
  const second = await call({ action: 'signUpInvite', token: smallToken, userName: '乙', userPhone: '13800000022' })
  check('满员后第 2 人被拒', second && second.ok === false && second.code === 'FULL', second)
  const smallRow = inviteRow(smallId)
  check('计数不因失败被占用', smallRow.signupCount === 1, smallRow.signupCount)
  const availability = await call({ action: 'getInvite', token: smallToken })
  check('服务端标记已满且给原因', availability && availability.data.full === true && availability.data.signupClosedReason === '报名人数已满', availability && { full: availability.data.full, reason: availability.data.signupClosedReason })

  // 13. 截止时间校验
  console.log('\n[13] 报名截止校验')
  setCaller('openid-manager')
  const expiredInvite = await createInvite({ deadline: '2020-01-01', maxPlayers: 11 })
  setCaller('')
  const lateSignup = await call({ action: 'signUpInvite', token: expiredInvite.data.signinToken, userName: '迟到', userPhone: '13800000023' })
  check('过截止时间拒绝报名', lateSignup && lateSignup.ok === false && lateSignup.code === 'CLOSED' && lateSignup.message === '已过报名截止时间', lateSignup)

  // 14. 历史邀约缺计数 → 待确认，不记 0
  console.log('\n[14] 历史邀约缺字段显示待确认')
  const legacyId = 'legacy_invite_1'
  store.friendly_invites.push({
    _id: legacyId,
    teamId: 'team_a',
    teamName: 'A 队',
    matchDate: '2026-10-01',
    matchTime: '19:00',
    venue: '老场地',
    maxPlayers: 11,
    signinToken: 'legacy-token-1',
    signedInCount: 5,           // 历史字段：只作兼容，不再当作报名数
    createdAt: new Date('2026-09-01T00:00:00Z')
  })
  const legacyPublic = await call({ action: 'getInvite', token: 'legacy-token-1' })
  check('历史邀约报名数返回 null', legacyPublic && legacyPublic.ok === true && legacyPublic.data.signupCount === null, legacyPublic && legacyPublic.data && legacyPublic.data.signupCount)
  check('历史邀约标记未确认', legacyPublic && legacyPublic.data.signupCountKnown === false)
  check('历史邀约有服务端状态文案', legacyPublic && legacyPublic.data.status === 'open' && legacyPublic.data.statusText === '报名中', legacyPublic && { status: legacyPublic.data.status, statusText: legacyPublic.data.statusText })
  setCaller('openid-manager')
  const legacyList = await call({ action: 'listInviteSignups', inviteId: legacyId })
  check('历史邀约可读名单（重算后确认）', legacyList && legacyList.ok === true && legacyList.data.invite.signupCountKnown === false, legacyList && legacyList.data && legacyList.data.invite)

  // 15. 旧接口 listSignins 鉴权 + 脱敏
  console.log('\n[15] 旧接口 listSignins 鉴权')
  setCaller('openid-other')
  const legacyDeny = await call({ action: 'listSignins', inviteId: smallId })
  check('非本队管理者被拒', legacyDeny && legacyDeny.ok === false && legacyDeny.code === 'FORBIDDEN', legacyDeny)
  setCaller('openid-manager')
  const legacyOk = await call({ action: 'listSignins', inviteId: smallId })
  check('本队管理者可读', legacyOk && legacyOk.ok === true, legacyOk)
  check('旧接口不带签到链接', legacyOk && legacyOk.data.invite.signinToken === undefined && legacyOk.data.invite.signinUrl === undefined)

  // 16. 公开列表与跨队应战
  console.log('\n[16] listPublicInvites / respondPublicInvite')
  setCaller('openid-manager')
  setCaller('openid-other')
  const publicList = await call({ action: 'listPublicInvites', limit: 10 })
  check('公开列表可读', publicList && publicList.ok === true && Array.isArray(publicList.data.invites), publicList)
  check('公开列表带状态文案', publicList.data.invites.every(row => typeof row.statusText === 'string' && row.statusText.length > 0))
  check('公开列表不含详细地址', publicList.data.invites.every(row => row.venueAddress === undefined))
  const publicRows = publicList.data.invites
  const targetInvite = publicRows.find(row => row.teamId === 'team_a')
  const publicRespond = targetInvite
    ? await call({ action: 'respondPublicInvite', inviteId: targetInvite.inviteId, teamId: 'team_b', teamName: 'B 队' })
    : { ok: false, code: 'NO_TARGET' }
  check('跨队应战写队伍标识', publicRespond && publicRespond.ok === true && publicRespond.data.status === 'accepted', publicRespond)
  if (publicRespond && publicRespond.ok) {
    const row = store.friendly_match_responses.find(r => r.inviteId === targetInvite.inviteId && r.kind === 'team')
    check('应战行 teamId/teamName 齐全', row && row.teamId === 'team_b' && row.teamName === 'B 队', row && { teamId: row.teamId, teamName: row.teamName })
  }
  setCaller('openid-manager')
  const selfRespond = targetInvite
    ? await call({ action: 'respondPublicInvite', inviteId: targetInvite.inviteId, teamId: 'team_a', teamName: 'A 队' })
    : null
  check('不能应战本队邀约', selfRespond && selfRespond.ok === false && selfRespond.code === 'INVALID_PARAM', selfRespond)

  // 17. 没人报名时取消也不报错
  console.log('\n[17] 空名单取消')
  const emptyInvite = await createInvite({ maxPlayers: 11 })
  const emptyCancel = await call({ action: 'cancelInvite', inviteId: emptyInvite.data.inviteId })
  check('空名单取消成功且通知为 0', emptyCancel && emptyCancel.ok === true && emptyCancel.data.notify.total === 0, emptyCancel && emptyCancel.data.notify)

  // 18. WXML 表达式合规（禁比较 / 三元 / 方法调用 / 数组索引，只允许简单插值、取反、||）
  console.log('\n[18] WXML 表达式合规扫描')
  scanWxmlFiles()

  // 19. WXML 事件处理函数必须存在
  console.log('\n[19] 事件处理函数与 js 对齐')
  checkHandlerBindings()

  // 20. 服务号模板字段适配：A/B 各自独立映射表、20 字截断、time2 格式
  console.log('\n[20] 模板字段适配（A/B 独立映射表）')
  const tf = require(path.join(__dirname, '..', 'cloudfunctions', 'friendlyMatchCenter', 'template-fields.cjs'))
  const fieldA = tf.buildDataForTemplate('success', {
    name: '发起约球·B 队', time: '2026-11-10 20:00~21:30', venue: '', organizer: 'A 队', participant: ''
  })
  check('A 模板用 thing1/time2/thing3/thing4/thing5',
    ['thing1', 'time2', 'thing3', 'thing4', 'thing5'].every(key => fieldA[key]) && !('thing6' in fieldA),
    Object.keys(fieldA))
  check('A 模板参与人空则「球队球员」', fieldA.thing5.value === '球队球员', fieldA.thing5)
  check('A 模板场地空则「待确认」', fieldA.thing3.value === '待确认', fieldA.thing3)
  check('A 模板组织者为发起球队', fieldA.thing4.value === 'A 队', fieldA.thing4)
  check('A 模板时间走 time2 原样', fieldA.time2.value === '2026-11-10 20:00~21:30', fieldA.time2)

  const fieldB = tf.buildDataForTemplate('cancel', {
    name: '「A 队」约球已取消', time: '2026-11-10 20:00', venue: '市体育中心', organizer: 'A 队', participant: '张三'
  })
  check('B 模板报名人用 thing6 且不带 thing5',
    fieldB.thing6 && fieldB.thing6.value === '张三' && !('thing5' in fieldB), Object.keys(fieldB))
  check('B 模板报名人空则「队员」',
    tf.buildDataForTemplate('cancel', { name: 'x', time: '', venue: '', organizer: '', participant: '' }).thing6.value === '队员')
  check('B 模板与 A 共用 thing1/time2/thing3/thing4',
    ['thing1', 'time2', 'thing3', 'thing4'].every(key => fieldB[key] && fieldB[key].value), Object.keys(fieldB))

  const twenty = '一二三四五六七八九十一二三四五六七八九十'
  check('thing 正好 20 字不截断', tf.clipThing(twenty) === twenty, tf.clipThing(twenty))
  const twentyOne = twenty + '二一'
  check('thing 超 20 字截断补省略号',
    Array.from(tf.clipThing(twentyOne)).length === 20 && tf.clipThing(twentyOne).endsWith('…'),
    tf.clipThing(twentyOne))
  check('超长 state 语义在 data 中已截断',
    Array.from(fieldB.thing1.value).length <= 20, fieldB.thing1.value)

  check('time2 只有开始时间输出单个时间', tf.formatInviteTime('2026-11-10', '20:00').value === '2026-11-10 20:00')
  check('time2 区间输出 ~ 连接', tf.formatInviteTime('2026-11-10', '20:00-21:30').value === '2026-11-10 20:00~21:30')
  check('time2 兼容斜杠日期与全角冒号', tf.formatInviteTime('2026/11/8', '18：00～19：30').value === '2026-11-08 18:00~19:30')
  check('time2 结束早于开始只留开始', tf.formatInviteTime('2026-11-10', '20:00-19:00').value === '2026-11-10 20:00')
  check('time2 非法日期返回 ok:false', tf.formatInviteTime('待定', '20:00').ok === false, tf.formatInviteTime('待定', '20:00'))
  check('time2 非法时间返回 ok:false', tf.formatInviteTime('2026-11-10', '待定').ok === false, tf.formatInviteTime('2026-11-10', '待定'))

  // 21. 模板路由与回落：只配 A 时取消回落 A；A+B 时取消/流局走 B
  console.log('\n[21] 模板路由与回落')
  // 给报名人补服务号身份：一个走 users.serviceAccountOpenId，一个走 service_identities
  store.users.push({ _id: 'u_svc_a', phoneNumber: '13800000031', serviceAccountOpenId: 'svc-openid-a', name: '孙七' })
  store.service_identities = [
    { _id: 'si_1', phone: '13800000032', phoneVerified: true, serviceAccountOpenId: 'svc-openid-b' }
  ]

  async function freshInviteWithSignups(callFn, phones) {
    setCaller('openid-manager')
    const created = await callFn({
      action: 'createInvite', teamId: 'team_a', teamName: 'A 队',
      matchDate: '2026-11-12', matchTime: '20:00-21:30', venue: '市体育中心 1 号场',
      maxPlayers: 11, deadline: '2026-11-11'
    })
    setCaller('')
    for (const item of phones) {
      await callFn({ action: 'signUpInvite', token: created.data.signinToken, userName: item.name, userPhone: item.phone })
    }
    setCaller('openid-manager')
    return created.data
  }

  // 21.1 只配置 A：取消按语义回落到 A，并标明回落的模板
  const callOnlyA = reloadCenter({ SXF_INVITE_TEMPLATE_ID: 'TPL_A_ONLY' })
  const onlyA = await freshInviteWithSignups(callOnlyA, [
    { name: '孙七', phone: '13800000031' },
    { name: '周八', phone: '13800000032' }
  ])
  const cancelOnlyA = await callOnlyA({ action: 'cancelInvite', inviteId: onlyA.inviteId, reason: '场地被占' })
  check('只配 A 时取消通知回落 A 模板',
    cancelOnlyA.data.notify.templateKey === 'success' && cancelOnlyA.data.notify.templateFallback === true &&
    cancelOnlyA.data.notify.templateId === 'TPL_A_ONLY' && cancelOnlyA.data.notify.requestedTemplateKey === 'cancel',
    cancelOnlyA.data.notify)
  check('回落时字段按 A 映射（无 thing6 语义参与人字段）',
    cancelOnlyA.data.notify.templateTitle === '约球成功通知', cancelOnlyA.data.notify.templateTitle)
  check('取消原因并入状态句', cancelOnlyA.data.notify.statusName === '「A 队」约球已取消·场地被占',
    cancelOnlyA.data.notify.statusName)
  check('原因未超 20 字不标记截断', cancelOnlyA.data.notify.reasonClipped === false)
  check('已配模板但通道未配置记 skip 而非 sent',
    cancelOnlyA.data.notify.sent === 0 && cancelOnlyA.data.notify.skipped === 2 &&
    cancelOnlyA.data.notify.skippedReason === 'channel_not_configured', cancelOnlyA.data.notify)

  const healthOnlyA = await callOnlyA({ action: 'healthCheck' })
  check('healthCheck 暴露模板回落概览',
    healthOnlyA.data.templateRoutes.some(row => row.templateKey === 'cancel' && row.configured === true && row.fallbackTo === 'success'),
    healthOnlyA.data.templateRoutes)

  // 21.2 同时配置 A + B：取消 / 流局走 B，成局 / 提醒走 A
  const callAB = reloadCenter({ SXF_INVITE_TEMPLATE_ID: 'TPL_A', SXF_CANCEL_TEMPLATE_ID: 'TPL_B' })
  const abInvite = await freshInviteWithSignups(callAB, [
    { name: '孙七', phone: '13800000031' },
    { name: '周八', phone: '13800000032' }
  ])
  const cancelAB = await callAB({ action: 'cancelInvite', inviteId: abInvite.inviteId, reason: '对方球队临时改期到下周一' })
  check('取消走 B 模板',
    cancelAB.data.notify.templateKey === 'cancel' && cancelAB.data.notify.templateId === 'TPL_B' &&
    cancelAB.data.notify.templateFallback === false, cancelAB.data.notify)
  check('模板 B 标题为约球已取消通知', cancelAB.data.notify.templateTitle === '约球已取消通知')
  check('B 无原因位：超 20 字只留状态句且回传完整原因',
    cancelAB.data.notify.statusName === '「A 队」约球已取消' && cancelAB.data.notify.reasonClipped === true &&
    cancelAB.data.notify.reason === '对方球队临时改期到下周一', {
      statusName: cancelAB.data.notify.statusName, reason: cancelAB.data.notify.reason,
      reasonClipped: cancelAB.data.notify.reasonClipped
    })

  const closedInvite = await freshInviteWithSignups(callAB, [{ name: '孙七', phone: '13800000031' }])
  const closedAB = await callAB({ action: 'abandonInvite', inviteId: closedInvite.inviteId, reason: '人数不足' })
  check('流局走 B 模板', closedAB.data.notify.templateKey === 'cancel' && closedAB.data.notify.templateId === 'TPL_B', closedAB.data.notify)
  check('流局状态句为已流局且并入原因', closedAB.data.notify.statusName === '「A 队」约球已流局·人数不足', closedAB.data.notify.statusName)
  const closedLong = await (async () => {
    const created = await freshInviteWithSignups(callAB, [{ name: '周八', phone: '13800000032' }])
    return callAB({ action: 'abandonInvite', inviteId: created.inviteId, reason: '报名人数一直不足且两队时间对不上，本周先不打' })
  })()
  check('流局长原因只留状态句', closedLong.data.notify.statusName === '「A 队」约球已流局' && closedLong.data.notify.reasonClipped === true,
    { statusName: closedLong.data.notify.statusName, reasonClipped: closedLong.data.notify.reasonClipped })

  const confirmInvite2 = await freshInviteWithSignups(callAB, [{ name: '孙七', phone: '13800000031' }])
  const confirmedAB = await callAB({ action: 'confirmInvite', inviteId: confirmInvite2.inviteId })
  check('成局走 A 模板', confirmedAB.data.notify.templateKey === 'success' && confirmedAB.data.notify.templateId === 'TPL_A', confirmedAB.data.notify)
  const reminderAB = await callAB({ action: 'remindInviteSignups', inviteId: confirmInvite2.inviteId, note: '集合带水' })
  check('开赛提醒走 A 模板', reminderAB.data.notify.templateKey === 'success' && reminderAB.data.notify.statusName.indexOf('开赛提醒') > 0,
    reminderAB.data.notify)
  check('提醒备注并入状态句', reminderAB.data.notify.statusName === '「A 队」约球开赛提醒·集合带水', reminderAB.data.notify.statusName)

  const healthAB = await callAB({ action: 'healthCheck' })
  check('healthCheck 两套模板均已配置',
    healthAB.data.templateRoutes.length === 2 &&
    healthAB.data.templateRoutes.every(row => row.configured === true && row.fallbackTo === ''),
    healthAB.data.templateRoutes)

  // 结果
  await new Promise(resolve => setTimeout(resolve, 300))
  console.log('\n== 结果 ==')
  console.log('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项')
  if (failures.length) {
    failures.forEach(item => console.log('  - ' + item))
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('[fatal]', error)
  process.exitCode = 1
})
