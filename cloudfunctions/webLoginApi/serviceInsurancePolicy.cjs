'use strict'
const crypto = require('crypto')
const https = require('https')
const { readAll, readByIds } = require('./data-center/reader.cjs')
const parse = require('./serviceInsurancePolicyParse.cjs')

const text = parse.text
// 与裁判表识别共用百度 OCR 应用（BAIDU_REFEREE_OCR_*）；不落密钥与响应原文到日志。
const OCR_FREE_MONTHLY_GUARD = 800
const MAX_PDF_BYTES = 3 * 1024 * 1024
const MAX_OCR_PAGES = 3
const DRAFT_COLLECTION = 'tournament_player_insurance_drafts'
const QUAL_COLLECTION = 'tournament_player_qualifications'

function fail(code, error) { return { success: false, code, error } }
function ids(values) { return [...new Set((values || []).map(text).filter(Boolean))] }
function lower(value) { return text(value).toLowerCase() }
function ownValue(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null && source[key] !== '')
}
function readBool(sources, keys) {
  for (const source of sources || []) {
    for (const key of keys || []) {
      if (!ownValue(source, key)) continue
      const value = source[key]
      return {
        defined: true,
        value: typeof value === 'string'
          ? ['true', '1', 'on', 'yes', 'enabled'].includes(value.trim().toLowerCase())
          : Boolean(value)
      }
    }
  }
  return { defined: false, value: false }
}

function baiduOcrCredentials() {
  const apiKey = text(process.env.BAIDU_INSURANCE_OCR_API_KEY || process.env.BAIDU_REFEREE_OCR_API_KEY)
  const secretKey = text(process.env.BAIDU_INSURANCE_OCR_SECRET_KEY || process.env.BAIDU_REFEREE_OCR_SECRET_KEY)
  return { apiKey, secretKey }
}

// No provider request/response or credential values are logged.
function baiduFormRequest(path, fields, timeout) {
  return new Promise(function (resolve, reject) {
    const body = new URLSearchParams(fields).toString()
    const req = https.request({
      hostname: 'aip.baidubce.com',
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function (res) {
      const chunks = []
      let size = 0
      res.on('data', function (chunk) {
        size += chunk.length
        if (size > 8 * 1024 * 1024) req.destroy(Object.assign(new Error('OCR响应过大'), { code: 'OCR_RESPONSE_LIMIT' }))
        else chunks.push(chunk)
      })
      res.on('error', function () {
        reject(Object.assign(new Error('百度识别响应中断，请重试'), { code: 'OCR_RESPONSE_INTERRUPTED' }))
      })
      res.on('end', function () {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error_code || data.error || res.statusCode !== 200) {
            const code = Number(data.error_code)
            const message = [6, 17, 18, 19].includes(code)
              ? '百度文字识别权限或额度不足，请检查应用服务'
              : '百度识别未完成，请检查接口开通状态或重试'
            return reject(Object.assign(new Error(message), { code: 'OCR_API_ERROR', providerCode: code || data.error_code }))
          }
          resolve(data)
        } catch (_) {
          reject(Object.assign(new Error('识别响应无法解析，请重试'), { code: 'OCR_RESPONSE_INVALID' }))
        }
      })
    })
    req.on('error', function () {
      reject(Object.assign(new Error('百度识别连接失败，请重试'), { code: 'OCR_NETWORK_ERROR' }))
    })
    req.setTimeout(timeout || 45000, function () {
      req.destroy(Object.assign(new Error('OCR识别超时，请重试'), { code: 'OCR_TIMEOUT' }))
    })
    req.end(body)
  })
}

let baiduTokenCache = null
async function baiduAccessToken() {
  const { apiKey, secretKey } = baiduOcrCredentials()
  if (!apiKey || !secretKey) {
    throw Object.assign(new Error('保单识别尚未配置，请联系平台管理员'), { code: 'OCR_CREDENTIAL_MISSING' })
  }
  if (baiduTokenCache && baiduTokenCache.expires > Date.now()) return baiduTokenCache.value
  const auth = await baiduFormRequest('/oauth/2.0/token', {
    grant_type: 'client_credentials',
    client_id: apiKey,
    client_secret: secretKey
  }, 10000)
  if (!auth.access_token) {
    throw Object.assign(new Error('百度应用授权失败，请检查配置'), { code: 'OCR_AUTH_FAILED' })
  }
  baiduTokenCache = {
    value: auth.access_token,
    expires: Date.now() + Math.min(Number(auth.expires_in || 3600), 86400) * 1000 - 60000
  }
  return baiduTokenCache.value
}

function wordsFromBaiduOcr(result) {
  const rows = Array.isArray(result && result.words_result) ? result.words_result : []
  return rows.map(function (item) { return text(item && item.words) }).filter(Boolean).join('\n')
}

async function callBaiduPdfOcr(pdfBase64, pageNumber) {
  const token = await baiduAccessToken()
  const query = '?access_token=' + encodeURIComponent(token)
  const fields = {
    pdf_file: pdfBase64,
    pdf_file_num: String(pageNumber || 1)
  }
  // 高精度优先；若应用未开通 accurate_basic，回退通用 basic（与裁判表同属百度 OCR 应用）。
  try {
    const accurate = await baiduFormRequest('/rest/2.0/ocr/v1/accurate_basic' + query, fields, 45000)
    const textOut = wordsFromBaiduOcr(accurate)
    if (textOut) return textOut
  } catch (error) {
    if (error && error.code === 'OCR_CREDENTIAL_MISSING') throw error
  }
  const basic = await baiduFormRequest('/rest/2.0/ocr/v1/general_basic' + query, fields, 45000)
  return wordsFromBaiduOcr(basic)
}

module.exports = function createServiceInsurancePolicy({ cloud, db, user, session }) {
  const _ = db.command
  const uid = text(user._id)
  const read = (collection, where, fields) => readAll(db, collection, where, { fields, maxRows: 2000 })
  const byIds = (collection, values, fields) => readByIds(db, collection, '_id', values, { fields, maxRows: 2000 })

  async function ensureCollection(name) {
    try { await db.createCollection(name) } catch (error) { /* already exists */ }
  }

  async function loadOwnedPlayer(playerId) {
    const rows = await read('players', _.or([{ guardianUserId: uid }, { playerUserId: uid }, { linkedUserId: uid }]), {
      name: true, status: true, isDeleted: true, teamId: true, teamCode: true,
      guardianUserId: true, playerUserId: true, linkedUserId: true
    })
    const player = rows.find(row => text(row._id) === text(playerId) && row.isDeleted !== true && !['archived', 'deleted', 'removed'].includes(lower(row.status)))
    if (!player) throw Object.assign(new Error('无权为该球员提交保险资料'), { code: 'INSURANCE_FORBIDDEN' })
    return player
  }

  async function loadContext(playerId, tournamentId, divisionId) {
    const player = await loadOwnedPlayer(playerId)
    const teamIds = ids([player.teamId, player.teamCode])
    if (!teamIds.length) throw Object.assign(new Error('球员尚未归属球队，暂不能提交本赛事保险'), { code: 'INSURANCE_TEAM_REQUIRED' })
    const registrations = (await read('tournament_teams', {
      teamId: _.in(teamIds),
      tournamentId: text(tournamentId)
    }, {
      tournamentId: true, teamId: true, divisionId: true, division: true, status: true
    })).filter(row => !['cancelled', 'canceled', 'withdrawn', 'deleted', 'removed'].includes(lower(row.status)))
    const divisionKey = text(divisionId) || 'default'
    const registration = registrations.find(row => (text(row.divisionId || row.division) || 'default') === divisionKey) || registrations[0]
    if (!registration) throw Object.assign(new Error('当前账号没有该赛事的参赛关系'), { code: 'INSURANCE_REGISTRATION_REQUIRED' })
    const resolvedDivisionId = text(registration.divisionId || registration.division) || divisionKey
    const [tournaments, divisions] = await Promise.all([
      byIds('tournaments', [text(tournamentId)], {
        name: true, startDate: true, startTime: true, endDate: true, endTime: true,
        insuranceRequired: true, identityVerificationRequired: true
      }),
      byIds('divisions', [resolvedDivisionId], {
        name: true, divisionName: true, tournamentId: true, rulesSnapshot: true, insuranceRequired: true
      })
    ])
    const tournament = tournaments[0]
    const division = divisions[0] || null
    if (!tournament) throw Object.assign(new Error('赛事不存在'), { code: 'INSURANCE_TOURNAMENT_NOT_FOUND' })
    const required = readBool([division, division && division.rulesSnapshot, tournament], ['insuranceRequired']).value
    if (!required) throw Object.assign(new Error('本赛事组别未要求保险资料'), { code: 'INSURANCE_NOT_REQUIRED' })
    return {
      player,
      tournament,
      division,
      divisionId: resolvedDivisionId,
      eventStart: text(tournament.startDate || tournament.startTime),
      eventEnd: text(tournament.endDate || tournament.endTime)
    }
  }

  async function latestQualification(playerId, tournamentId, divisionId) {
    const rows = await read(QUAL_COLLECTION, {
      playerId: text(playerId),
      tournamentId: text(tournamentId),
      divisionId: text(divisionId) || 'default'
    }, {
      status: true, insurance: true, insuranceReviewFlag: true, updateTime: true, createTime: true
    })
    rows.sort((a, b) => {
      const ta = new Date(a.updateTime || a.createTime || 0).getTime() || 0
      const tb = new Date(b.updateTime || b.createTime || 0).getTime() || 0
      return tb - ta
    })
    return rows[0] || null
  }

  function canReplace(qualification) {
    if (!qualification) return true
    if (lower(qualification.status) !== 'submitted') return true
    const flag = text(qualification.insuranceReviewFlag || (qualification.insurance && qualification.insurance.reviewFlag))
    return flag === 'needs_manual_review'
  }

  function decodePdf(base64Data) {
    const raw = String(base64Data || '')
    const matched = raw.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i)
    const payload = matched ? matched[1] : raw.replace(/^data:[^;]+;base64,/i, '')
    if (!payload || payload.length > 4.2 * 1024 * 1024) {
      throw Object.assign(new Error('保单 PDF 须小于 3MB（微信直传限制）'), { code: 'INSURANCE_PDF_TOO_LARGE' })
    }
    const buffer = Buffer.from(payload.replace(/\s+/g, ''), 'base64')
    if (!buffer.length) throw Object.assign(new Error('保单文件为空'), { code: 'INSURANCE_PDF_EMPTY' })
    if (buffer.length > MAX_PDF_BYTES) {
      throw Object.assign(new Error('保单 PDF 须小于 3MB'), { code: 'INSURANCE_PDF_TOO_LARGE' })
    }
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      throw Object.assign(new Error('请上传 PDF 格式保单'), { code: 'INSURANCE_PDF_INVALID' })
    }
    return buffer
  }

  async function extractTextFromPdf(buffer) {
    let extracted = ''
    try {
      const pdfParse = require('pdf-parse')
      const parsed = await pdfParse(buffer)
      extracted = text(parsed && parsed.text)
      if (parse.readableChinese(extracted)) {
        return { text: extracted, engine: 'pdf-parse', pages: Number(parsed.numpages || 0) || 1 }
      }
    } catch (error) {
      // pdf-parse may be absent in the current package; fall through to OCR.
    }
    const pages = await reserveOcrPages(MAX_OCR_PAGES)
    const pdfBase64 = buffer.toString('base64')
    const pageTexts = []
    for (let page = 1; page <= pages; page += 1) {
      try {
        pageTexts.push(await callBaiduPdfOcr(pdfBase64, page))
      } catch (error) {
        if (page === 1) throw error
        break
      }
    }
    extracted = pageTexts.filter(Boolean).join('\n\n')
    if (!parse.readableChinese(extracted)) {
      throw Object.assign(new Error('未能识别保单文字，请上传更清晰的 PDF 或稍后重试'), { code: 'INSURANCE_OCR_EMPTY' })
    }
    return { text: extracted, engine: 'baidu-ocr', pages }
  }

  async function reserveOcrPages(pageCount) {
    const pages = Math.max(1, Math.min(Number(pageCount) || 1, MAX_OCR_PAGES))
    const month = new Date().toISOString().slice(0, 7).replace('-', '')
    const counterId = 'ocr_insurance_policy_' + month
    await ensureCollection('platform_settings')
    const ref = db.collection('platform_settings').doc(counterId)
    const loaded = await ref.get()
    const current = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data
    const used = Math.max(0, Number(current && current.usedPages || 0))
    if (used + pages > OCR_FREE_MONTHLY_GUARD) {
      throw Object.assign(new Error('本月保单识别额度已用完，请手动核对后提交或下月再试'), { code: 'OCR_FREE_GUARD_EXHAUSTED' })
    }
    const nextUsed = used + pages
    const data = { usedPages: nextUsed, limitPages: OCR_FREE_MONTHLY_GUARD, month, purpose: 'insurance_policy', updateTime: db.serverDate() }
    if (current) await ref.update({ data })
    else await ref.set({ data: Object.assign({ createTime: db.serverDate() }, data) })
    return pages
  }

  function viewDraft(draft, analysis) {
    return {
      draftId: text(draft._id),
      playerId: text(draft.playerId),
      tournamentId: text(draft.tournamentId),
      divisionId: text(draft.divisionId),
      fileId: text(draft.fileId),
      status: text(draft.status) || 'recognized',
      insuredName: text(analysis.insuredName || draft.insuredName),
      coverStart: text(analysis.coverStart || draft.coverStart),
      coverEnd: text(analysis.coverEnd || draft.coverEnd),
      policyNo: text(analysis.policyNo || draft.policyNo),
      productType: text(analysis.productType || draft.productType) || '未识别险种',
      matchResult: text(analysis.matchResult || draft.matchResult) || 'unclear',
      reviewFlag: text(analysis.reviewFlag || draft.reviewFlag) || 'needs_manual_review',
      message: text(analysis.message || draft.message),
      disclaimer: text(analysis.disclaimer || draft.disclaimer) || parse.analyzeInsuranceText('', {}).disclaimer
    }
  }

  async function uploadAndRecognize(event) {
    const playerId = text(event.playerId)
    const tournamentId = text(event.tournamentId)
    const divisionId = text(event.divisionId) || 'default'
    if (!playerId || !tournamentId) return fail('INSURANCE_PAYLOAD_REQUIRED', '请选择球员与赛事后再上传保单')
    const context = await loadContext(playerId, tournamentId, divisionId)
    const existing = await latestQualification(playerId, tournamentId, context.divisionId)
    if (!canReplace(existing)) {
      return fail('INSURANCE_ALREADY_SUBMITTED', '保险资料已提交。如需更正，请联系主办方人工处理')
    }
    const buffer = decodePdf(event.base64Data)
    const digest = crypto.createHash('sha256').update(buffer).digest('hex')
    const cloudPath = 'football/insurance-policies/' + tournamentId + '/' + playerId + '/' + Date.now() + '_' + digest.slice(0, 10) + '.pdf'
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    const extracted = await extractTextFromPdf(buffer)
    const analysis = parse.analyzeInsuranceText(extracted.text, {
      playerName: context.player.name,
      eventStart: context.eventStart,
      eventEnd: context.eventEnd
    })
    await ensureCollection(DRAFT_COLLECTION)
    const draftId = 'ins_' + crypto.createHash('sha256')
      .update([uid, playerId, tournamentId, context.divisionId, digest, String(Date.now())].join('|'))
      .digest('hex')
      .slice(0, 28)
    const draft = {
      sport: 'football',
      userId: uid,
      serviceAccountOpenId: text(session && session.serviceAccountOpenId),
      playerId,
      playerName: text(context.player.name),
      tournamentId,
      divisionId: context.divisionId,
      fileId: text(uploaded.fileID),
      cloudPath,
      sha256: digest,
      size: buffer.length,
      mimeType: 'application/pdf',
      status: 'recognized',
      ocrEngine: extracted.engine,
      ocrPages: extracted.pages,
      rawTextPreview: String(extracted.text || '').slice(0, 4000),
      insuredName: analysis.insuredName,
      coverStart: analysis.coverStart,
      coverEnd: analysis.coverEnd,
      policyNo: analysis.policyNo,
      productType: analysis.productType,
      matchResult: analysis.matchResult,
      reviewFlag: analysis.reviewFlag,
      message: analysis.message,
      disclaimer: analysis.disclaimer,
      eventStart: context.eventStart,
      eventEnd: context.eventEnd,
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    }
    await db.collection(DRAFT_COLLECTION).doc(draftId).set({ data: draft })
    return { success: true, draft: viewDraft(Object.assign({ _id: draftId }, draft), analysis) }
  }

  async function recognize(event) {
    const draftId = text(event.draftId)
    if (!draftId) return fail('INSURANCE_DRAFT_REQUIRED', '请先上传保单')
    const loaded = await db.collection(DRAFT_COLLECTION).doc(draftId).get()
    const draft = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data
    if (!draft || text(draft.userId) !== uid) return fail('INSURANCE_DRAFT_NOT_FOUND', '保单草稿不存在或已过期')
    if (draft.expiresAt && new Date(draft.expiresAt).getTime() <= Date.now()) {
      return fail('INSURANCE_DRAFT_EXPIRED', '保单草稿已过期，请重新上传')
    }
    const downloaded = await cloud.downloadFile({ fileID: text(draft.fileId) })
    const buffer = downloaded.fileContent
    const extracted = await extractTextFromPdf(buffer)
    const analysis = parse.analyzeInsuranceText(extracted.text, {
      playerName: draft.playerName,
      eventStart: draft.eventStart,
      eventEnd: draft.eventEnd
    })
    await db.collection(DRAFT_COLLECTION).doc(draftId).update({
      data: {
        status: 'recognized',
        ocrEngine: extracted.engine,
        ocrPages: extracted.pages,
        rawTextPreview: String(extracted.text || '').slice(0, 4000),
        insuredName: analysis.insuredName,
        coverStart: analysis.coverStart,
        coverEnd: analysis.coverEnd,
        policyNo: analysis.policyNo,
        productType: analysis.productType,
        matchResult: analysis.matchResult,
        reviewFlag: analysis.reviewFlag,
        message: analysis.message,
        disclaimer: analysis.disclaimer,
        updateTime: db.serverDate()
      }
    })
    return { success: true, draft: viewDraft(Object.assign({}, draft, { _id: draftId }, analysis), analysis) }
  }

  async function confirm(event) {
    const draftId = text(event.draftId)
    if (!draftId) return fail('INSURANCE_DRAFT_REQUIRED', '请先上传并识别保单')
    const loaded = await db.collection(DRAFT_COLLECTION).doc(draftId).get()
    const draft = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data
    if (!draft || text(draft.userId) !== uid) return fail('INSURANCE_DRAFT_NOT_FOUND', '保单草稿不存在或已过期')
    if (draft.expiresAt && new Date(draft.expiresAt).getTime() <= Date.now()) {
      return fail('INSURANCE_DRAFT_EXPIRED', '保单草稿已过期，请重新上传')
    }
    if (text(draft.status) === 'confirmed') {
      return { success: true, qualificationId: text(draft.qualificationId), insurance: viewDraft(draft, draft) }
    }
    const context = await loadContext(draft.playerId, draft.tournamentId, draft.divisionId)
    const existing = await latestQualification(draft.playerId, draft.tournamentId, context.divisionId)
    if (!canReplace(existing)) {
      return fail('INSURANCE_ALREADY_SUBMITTED', '保险资料已提交。如需更正，请联系主办方人工处理')
    }
    const insurance = {
      fileId: text(draft.fileId),
      cloudPath: text(draft.cloudPath),
      sha256: text(draft.sha256),
      size: Number(draft.size) || 0,
      mimeType: 'application/pdf',
      policyNo: text(draft.policyNo),
      productType: text(draft.productType) || '未识别险种',
      insuredName: text(draft.insuredName) || text(context.player.name),
      coverStart: text(draft.coverStart),
      coverEnd: text(draft.coverEnd),
      matchResult: text(draft.matchResult) || 'unclear',
      reviewFlag: text(draft.reviewFlag) || 'needs_manual_review',
      message: text(draft.message),
      disclaimer: text(draft.disclaimer),
      ocrEngine: text(draft.ocrEngine),
      recognizedAt: db.serverDate(),
      confirmedAt: db.serverDate(),
      confirmedByUserId: uid
    }
    await ensureCollection(QUAL_COLLECTION)
    let qualificationId = existing ? text(existing._id) : ''
    if (existing) {
      await db.collection(QUAL_COLLECTION).doc(qualificationId).update({
        data: {
          status: 'submitted',
          insurance,
          insuranceReviewFlag: insurance.reviewFlag,
          insuranceSubmittedAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    } else {
      const added = await db.collection(QUAL_COLLECTION).add({
        data: {
          sport: 'football',
          playerId: text(draft.playerId),
          tournamentId: text(draft.tournamentId),
          divisionId: text(context.divisionId),
          status: 'submitted',
          insurance,
          insuranceReviewFlag: insurance.reviewFlag,
          insuranceSubmittedAt: db.serverDate(),
          source: 'service_account_h5',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      qualificationId = text(added._id)
    }
    await db.collection(DRAFT_COLLECTION).doc(draftId).update({
      data: {
        status: 'confirmed',
        qualificationId,
        confirmedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
    return {
      success: true,
      qualificationId,
      insurance: {
        required: true,
        ready: true,
        canUpload: insurance.reviewFlag === 'needs_manual_review',
        state: insurance.reviewFlag === 'needs_manual_review' ? 'manual_review' : 'submitted',
        text: insurance.reviewFlag === 'needs_manual_review' ? '已提交，待人工核对' : '保险资料已提交',
        tone: insurance.reviewFlag === 'needs_manual_review' ? 'pending' : 'ok',
        matchResult: insurance.matchResult,
        reviewFlag: insurance.reviewFlag,
        policyNo: insurance.policyNo,
        productType: insurance.productType,
        coverStart: insurance.coverStart,
        coverEnd: insurance.coverEnd,
        message: insurance.message,
        disclaimer: insurance.disclaimer
      }
    }
  }

  async function purchaseClick(event) {
    const playerId = text(event.playerId)
    const tournamentId = text(event.tournamentId)
    const divisionId = text(event.divisionId) || 'default'
    const url = text(event.purchaseUrl)
    if (!playerId || !tournamentId) return fail('INSURANCE_PAYLOAD_REQUIRED', '缺少球员或赛事信息')
    if (!/^https?:\/\//i.test(url)) return fail('INSURANCE_URL_INVALID', '购买链接无效')
    const player = await loadOwnedPlayer(playerId)
    if (!player) return fail('SERVICE_PRIVATE_FORBIDDEN', '无权记录该球员的投保引导')
    await ensureCollection('insurance_purchase_clicks')
    await db.collection('insurance_purchase_clicks').add({
      data: {
        sport: 'football',
        userId: uid,
        playerId,
        playerName: text(player.name),
        tournamentId,
        divisionId,
        purchaseUrl: url.slice(0, 500),
        source: text(event.source) || 'h5_me',
        intentOnly: true,
        note: '外链点击仅记投保引导，不代表已购',
        createTime: db.serverDate()
      }
    })
    return { success: true, recorded: true }
  }

  return async function handle(action, event = {}) {
    try {
      if (action === 'servicePrivateInsuranceUpload') return await uploadAndRecognize(event)
      if (action === 'servicePrivateInsuranceRecognize') return await recognize(event)
      if (action === 'servicePrivateInsuranceConfirm') return await confirm(event)
      if (action === 'servicePrivateInsurancePurchaseClick') return await purchaseClick(event)
      return fail('SERVICE_PRIVATE_ACTION_INVALID', '操作不可用，请重新打开')
    } catch (error) {
      return fail(error.code || 'INSURANCE_FAILED', error.message || '保险资料处理失败，请稍后重试')
    }
  }
}

module.exports.parse = parse
module.exports.MAX_PDF_BYTES = MAX_PDF_BYTES
