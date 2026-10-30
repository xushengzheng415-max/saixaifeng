'use strict'
/**
 * 平台运营：赛事保险材料统计（以球员/监护人上传的保单凭证为准）。
 * 外链购买点击只记投保引导意向，不得当作成交。
 */
const SETTINGS_DOC = 'insurance-purchase'
const QUAL_COLLECTION = 'tournament_player_qualifications'
const CLICK_COLLECTION = 'insurance_purchase_clicks'
const READ_LIMIT = 5000

function text(value) {
  return String(value == null ? '' : value).trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function dateValue(value) {
  if (!value) return 0
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

function usageDayKey(stamp) {
  const date = new Date(Number(stamp) || Date.now())
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return beijing.toISOString().slice(0, 10)
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(text(value))
}

function productLabel(value) {
  const raw = text(value)
  return raw || '未识别险种'
}

function reviewBucket(row) {
  const insurance = row && row.insurance && typeof row.insurance === 'object' ? row.insurance : null
  if (!(row && lower(row.status) === 'submitted' && insurance)) return 'none'
  const flag = lower(insurance.reviewFlag || row.insuranceReviewFlag)
  if (flag === 'auto_matched' || flag === 'matched') return 'auto_matched'
  if (flag === 'needs_manual_review') return 'manual_review'
  return 'submitted'
}

async function readPurchaseLink(db) {
  try {
    const result = await db.collection('platform_settings').doc(SETTINGS_DOC).get()
    const data = Array.isArray(result.data) ? result.data[0] : result.data
    return {
      purchaseUrl: text(data && data.purchaseUrl),
      purchaseLabel: text(data && data.purchaseLabel) || '去购买保险',
      updatedAt: data && data.updatedAt ? data.updatedAt : null,
      updatedByName: text(data && data.updatedByName)
    }
  } catch (error) {
    return {
      purchaseUrl: text(process.env.INSURANCE_PURCHASE_URL),
      purchaseLabel: '去购买保险',
      updatedAt: null,
      updatedByName: ''
    }
  }
}

async function savePurchaseLink(db, user, event) {
  const purchaseUrl = text(event && event.purchaseUrl)
  const purchaseLabel = text(event && event.purchaseLabel) || '去购买保险'
  if (purchaseUrl && !isHttpUrl(purchaseUrl)) {
    return { success: false, code: 'INSURANCE_URL_INVALID', error: '购买链接须为 http(s) 地址，可留空关闭入口' }
  }
  if (purchaseLabel.length > 20) {
    return { success: false, code: 'INSURANCE_LABEL_INVALID', error: '按钮文案请控制在 20 字以内' }
  }
  const payload = {
    recordType: 'insurance_purchase_link',
    purchaseUrl,
    purchaseLabel,
    updatedAt: db.serverDate(),
    updatedBy: text(user && user._id),
    updatedByName: text(user && (user.nickname || user.userName || user.nickName)) || '平台负责人'
  }
  try {
    await db.collection('platform_settings').doc(SETTINGS_DOC).set({ data: payload })
  } catch (error) {
    await db.collection('platform_settings').doc(SETTINGS_DOC).update({ data: payload })
  }
  return { success: true, purchaseUrl, purchaseLabel, updatedText: new Date().toISOString().slice(0, 16).replace('T', ' ') }
}

async function readQualifications(db) {
  try {
    const result = await db.collection(QUAL_COLLECTION).orderBy('updateTime', 'desc').limit(READ_LIMIT).get()
    return { rows: result.data || [], available: true, truncated: (result.data || []).length >= READ_LIMIT, limit: READ_LIMIT }
  } catch (error) {
    try {
      const result = await db.collection(QUAL_COLLECTION).limit(READ_LIMIT).get()
      return { rows: result.data || [], available: true, truncated: (result.data || []).length >= READ_LIMIT, limit: READ_LIMIT, note: '按更新时间排序不可用，已退回默认顺序' }
    } catch (inner) {
      return { rows: [], available: false, truncated: false, limit: READ_LIMIT, note: '还没有保险材料记录（tournament_player_qualifications 为空或尚未创建）' }
    }
  }
}

async function readClicks(db) {
  try {
    const result = await db.collection(CLICK_COLLECTION).orderBy('createTime', 'desc').limit(READ_LIMIT).get()
    return { rows: result.data || [], available: true, truncated: (result.data || []).length >= READ_LIMIT, limit: READ_LIMIT }
  } catch (error) {
    try {
      const result = await db.collection(CLICK_COLLECTION).limit(READ_LIMIT).get()
      return { rows: result.data || [], available: true, truncated: (result.data || []).length >= READ_LIMIT, limit: READ_LIMIT }
    } catch (inner) {
      return { rows: [], available: false, truncated: false, limit: READ_LIMIT }
    }
  }
}

function viewRow(row, tournamentName, playerName) {
  const insurance = row && row.insurance && typeof row.insurance === 'object' ? row.insurance : {}
  const bucket = reviewBucket(row)
  return {
    id: text(row._id),
    playerId: text(row.playerId),
    playerName: text(playerName) || text(insurance.insuredName) || '球员',
    tournamentId: text(row.tournamentId),
    tournamentName: text(tournamentName) || '赛事',
    divisionId: text(row.divisionId) || 'default',
    status: bucket,
    statusLabel: bucket === 'auto_matched' ? '已核对' : bucket === 'manual_review' ? '待人工核对' : bucket === 'submitted' ? '已提交' : '未提交',
    productType: productLabel(insurance.productType),
    policyNo: text(insurance.policyNo),
    coverStart: text(insurance.coverStart),
    coverEnd: text(insurance.coverEnd),
    matchResult: text(insurance.matchResult),
    submittedAt: row.insuranceSubmittedAt || row.updateTime || row.createTime || null
  }
}

async function overview(db, event) {
  const wanted = Number(event && event.days)
  const days = [1, 7, 30, 90].indexOf(wanted) >= 0 ? wanted : 30
  const sinceKey = usageDayKey(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
  const [link, quals, clicks] = await Promise.all([readPurchaseLink(db), readQualifications(db), readClicks(db)])

  const submitted = []
  quals.rows.forEach(row => {
    const bucket = reviewBucket(row)
    if (bucket === 'none') return
    submitted.push(row)
  })

  const periodRows = submitted.filter(row => {
    const day = usageDayKey(dateValue(row.insuranceSubmittedAt || row.updateTime || row.createTime) || Date.now())
    return day >= sinceKey
  })

  const totals = {
    submitted: periodRows.length,
    autoMatched: 0,
    manualReview: 0,
    otherSubmitted: 0,
    clickouts: 0
  }
  const productMap = {}
  const tournamentMap = {}

  periodRows.forEach(row => {
    const bucket = reviewBucket(row)
    if (bucket === 'auto_matched') totals.autoMatched += 1
    else if (bucket === 'manual_review') totals.manualReview += 1
    else totals.otherSubmitted += 1
    const insurance = row.insurance || {}
    const product = productLabel(insurance.productType)
    if (!productMap[product]) productMap[product] = { productType: product, count: 0 }
    productMap[product].count += 1
    const tid = text(row.tournamentId) || 'unknown'
    if (!tournamentMap[tid]) tournamentMap[tid] = { tournamentId: tid, count: 0 }
    tournamentMap[tid].count += 1
  })

  clicks.rows.forEach(row => {
    const day = usageDayKey(dateValue(row.createTime) || Date.now())
    if (day >= sinceKey) totals.clickouts += 1
  })

  const tournamentIds = Object.keys(tournamentMap)
  let tournamentNames = {}
  if (tournamentIds.length) {
    try {
      const result = await db.collection('tournaments').where({ _id: db.command.in(tournamentIds.slice(0, 100)) }).field({ name: true }).limit(100).get()
      ;(result.data || []).forEach(row => { tournamentNames[text(row._id)] = text(row.name) })
    } catch (error) {
      tournamentNames = {}
    }
  }

  return {
    success: true,
    days,
    purchaseLink: link,
    totals,
    byProductType: Object.values(productMap).sort((a, b) => b.count - a.count || a.productType.localeCompare(b.productType)),
    byTournament: Object.values(tournamentMap)
      .map(row => ({ tournamentId: row.tournamentId, tournamentName: tournamentNames[row.tournamentId] || row.tournamentId, count: row.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    note: '统计口径：球员本人或监护人已上传并确认的保单凭证。外链点击仅表示投保引导意向，不是成交人数。',
    truncated: quals.truncated || clicks.truncated,
    truncatedNote: (quals.truncated || clicks.truncated) ? ('本次最多读取 ' + READ_LIMIT + ' 条材料/点击记录') : '',
    available: quals.available,
    emptyNote: quals.note || ''
  }
}

async function submissionList(db, event) {
  const page = Math.max(1, Number(event && event.page) || 1)
  const pageSize = Math.min(50, Math.max(10, Number(event && event.pageSize) || 20))
  const status = text(event && event.status) || 'all'
  const keyword = text(event && event.keyword).toLowerCase()
  const read = await readQualifications(db)
  let rows = read.rows.filter(row => reviewBucket(row) !== 'none')
  if (status !== 'all') rows = rows.filter(row => reviewBucket(row) === status)
  if (keyword) {
    rows = rows.filter(row => {
      const insurance = row.insurance || {}
      const hay = [row.playerId, row.tournamentId, insurance.policyNo, insurance.insuredName, insurance.productType].map(text).join(' ').toLowerCase()
      return hay.indexOf(keyword) >= 0
    })
  }
  rows.sort((a, b) => dateValue(b.insuranceSubmittedAt || b.updateTime || b.createTime) - dateValue(a.insuranceSubmittedAt || a.updateTime || a.createTime))
  const total = rows.length
  const slice = rows.slice((page - 1) * pageSize, page * pageSize)
  const tournamentIds = [...new Set(slice.map(row => text(row.tournamentId)).filter(Boolean))]
  const playerIds = [...new Set(slice.map(row => text(row.playerId)).filter(Boolean))]
  const tournamentNames = {}, playerNames = {}
  if (tournamentIds.length) {
    try {
      const result = await db.collection('tournaments').where({ _id: db.command.in(tournamentIds) }).field({ name: true }).limit(100).get()
      ;(result.data || []).forEach(row => { tournamentNames[text(row._id)] = text(row.name) })
    } catch (error) { /* ignore */ }
  }
  if (playerIds.length) {
    try {
      const result = await db.collection('players').where({ _id: db.command.in(playerIds) }).field({ name: true }).limit(100).get()
      ;(result.data || []).forEach(row => { playerNames[text(row._id)] = text(row.name) })
    } catch (error) { /* ignore */ }
  }
  return {
    success: true,
    rows: slice.map(row => viewRow(row, tournamentNames[text(row.tournamentId)], playerNames[text(row.playerId)])),
    page,
    pageSize,
    total,
    scanned: read.rows.length,
    truncated: read.truncated,
    truncatedNote: read.truncated ? ('只读取最近 ' + read.limit + ' 条资格记录') : '',
    available: read.available,
    note: read.note || ''
  }
}

module.exports = {
  SETTINGS_DOC,
  readPurchaseLink,
  savePurchaseLink,
  overview,
  submissionList
}
