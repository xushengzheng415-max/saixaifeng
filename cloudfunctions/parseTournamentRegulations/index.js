// 云函数：解析竞赛规程文档，AI 识别赛制信息
// 使用 @cloudbase/node-sdk（官方推荐，支持 AI 调用）
const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const https = require('https');
const app = tcb.init({
  env: 'cloud1-7g8ckb3c7815a011',
  timeout: 240000
});

// Lazy load parsers
let pdfParse, mammoth;

async function getPdfParse() {
  if (!pdfParse) { pdfParse = require('pdf-parse'); }
  return pdfParse;
}
async function getMammoth() {
  if (!mammoth) { mammoth = require('mammoth'); }
  return mammoth;
}

/**
 * 使用 CloudBase AI 大模型分析竞赛规程
 * 官方文档：https://docs.cloudbase.net/ai/model/nodejs-access
 */
function readableChineseText(text) {
  const source = String(text || '');
  const chineseCount = (source.match(/[\u3400-\u9fff]/g) || []).length;
  const replacementCount = (source.match(/�/g) || []).length;
  return chineseCount >= 80 && replacementCount < Math.max(20, chineseCount / 3);
}

function normalizeAnalysisResult(result, sourceText) {
  const normalized = result && typeof result === 'object' ? result : getEmptyResult();
  const divisions = Array.isArray(normalized.divisions) ? normalized.divisions : [];
  const source = String(sourceText || '');
  const halfMatch = source.match(/上.?下半场(?:各为|各)?\s*(\d{1,3})\s*分钟/);
  if (halfMatch) {
    const halfMinutes = Number(halfMatch[1]);
    if (halfMinutes > 0 && halfMinutes <= 90) {
      divisions.forEach(function(division) {
        if (String(division.periodMode || 'halves') === 'halves') division.matchMinutes = halfMinutes;
      });
    }
  }
  const details = normalized.sharedRegulationDetails && typeof normalized.sharedRegulationDetails === 'object'
    ? normalized.sharedRegulationDetails
    : {};
  if (divisions.some(function(division) { return String(division.eligibilityNotes || '').includes('只限制出生年份'); })) {
    details.ageByYearOnly = true;
  }
  if (details.terminationForfeitScore === '3:0') details.terminationForfeitScore = '0:3';
  normalized.sharedRegulationDetails = details;
  normalized.divisions = divisions;
  return normalized;
}

const OCR_FREE_MONTHLY_GUARD = 900;
const OCR_HOST = 'ocr.tencentcloudapi.com';
const OCR_SERVICE = 'ocr';
const OCR_VERSION = '2018-11-19';

function ocrHmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function ocrAuthorization(secretId, secretKey, timestamp, payload) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + OCR_HOST + '\n';
  const signedHeaders = 'content-type;host';
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
  const credentialScope = date + '/' + OCR_SERVICE + '/tc3_request';
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const dateKey = ocrHmac('TC3' + secretKey, date);
  const serviceKey = ocrHmac(dateKey, OCR_SERVICE);
  const signingKey = ocrHmac(serviceKey, 'tc3_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
}

function callGeneralBasicOcr(pdfBase64, pageNumber) {
  return new Promise(function(resolve, reject) {
    const explicitSecretId = process.env.OCR_SECRET_ID || '';
    const explicitSecretKey = process.env.OCR_SECRET_KEY || '';
    const secretId = explicitSecretId || process.env.TENCENTCLOUD_SECRETID || process.env.TENCENT_SECRET_ID || '';
    const secretKey = explicitSecretKey || process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENT_SECRET_KEY || '';
    const sessionToken = explicitSecretId && explicitSecretKey ? '' : (process.env.TENCENTCLOUD_SESSIONTOKEN || '');
    if (!secretId || !secretKey) return reject(Object.assign(new Error('OCR云函数临时凭据不可用'), { code: 'OCR_CREDENTIAL_MISSING' }));
    const payload = JSON.stringify({ ImageBase64: pdfBase64, IsPdf: true, PdfPageNumber: pageNumber });
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      Host: OCR_HOST,
      'X-TC-Action': 'GeneralBasicOCR',
      'X-TC-Version': OCR_VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
      Authorization: ocrAuthorization(secretId, secretKey, timestamp, payload)
    };
    if (sessionToken) headers['X-TC-Token'] = sessionToken;
    const request = https.request({ hostname: OCR_HOST, port: 443, path: '/', method: 'POST', headers }, function(response) {
      let body = '';
      response.on('data', function(chunk) { body += chunk; });
      response.on('end', function() {
        try {
          const parsed = JSON.parse(body);
          const result = parsed.Response || {};
          if (result.Error) return reject(Object.assign(new Error(result.Error.Message || '腾讯云OCR识别失败'), { code: result.Error.Code || 'OCR_API_ERROR' }));
          const lines = Array.isArray(result.TextDetections) ? result.TextDetections.map(function(item) { return String(item.DetectedText || '').trim(); }).filter(Boolean) : [];
          resolve(lines.join('\n'));
        } catch (error) {
          reject(Object.assign(new Error('OCR返回结果解析失败'), { code: 'OCR_RESPONSE_INVALID' }));
        }
      });
    });
    request.setTimeout(20000, function() { request.destroy(Object.assign(new Error('OCR识别超时，请重试'), { code: 'OCR_TIMEOUT' })); });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function reserveFreeOcrPages(pageCount) {
  const pages = Math.max(1, Math.min(Number(pageCount) || 1, 30));
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const counterId = 'ocr_general_basic_' + month;
  const db = app.database();
  const ref = db.collection('platform_settings').doc(counterId);
  const loaded = await ref.get();
  const current = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data;
  const used = Math.max(0, Number(current && current.usedPages || 0));
  if (used + pages > OCR_FREE_MONTHLY_GUARD) {
    throw Object.assign(new Error('本月OCR免费保护额度已用完，请手动填写或下月再试'), { code: 'OCR_FREE_GUARD_EXHAUSTED' });
  }
  const nextUsed = used + pages;
  const data = { usedPages: nextUsed, limitPages: OCR_FREE_MONTHLY_GUARD, month, updateTime: new Date() };
  if (current) await ref.update(data);
  else await ref.set({ ...data, createTime: new Date() });
  const verifiedResult = await ref.get();
  const verified = Array.isArray(verifiedResult.data) ? verifiedResult.data[0] : verifiedResult.data;
  if (Number(verified && verified.usedPages || 0) !== nextUsed) {
    throw Object.assign(new Error('OCR免费额度计数校验失败，已停止识别'), { code: 'OCR_FREE_GUARD_WRITE_FAILED' });
  }
  return pages;
}

async function recognizePdfWithFreeOcr(fileBuffer, pageCount) {
  const pages = await reserveFreeOcrPages(pageCount);
  const pdfBase64 = fileBuffer.toString('base64');
  const pageTexts = [];
  for (let start = 1; start <= pages; start += 3) {
    const batch = [];
    for (let page = start; page < Math.min(start + 3, pages + 1); page += 1) {
      batch.push(callGeneralBasicOcr(pdfBase64, page));
    }
    const rows = await Promise.all(batch);
    pageTexts.push.apply(pageTexts, rows);
  }
  const text = pageTexts.filter(Boolean).join('\n\n');
  if (!readableChineseText(text)) throw new Error('OCR未识别到足够的中文规程内容');
  return text;
}

async function analyzeWithHunyuan(text) {
  try {
    const truncatedText = text.substring(0, 12000);
    console.log('[analyze] ★★★ 文本长度(截断前):', text.length, '(截断后):', truncatedText.length);

    const prompt = `分析以下足球竞赛规程，提取关键信息，返回纯JSON（不要markdown代码块）：

【规程文本】
${truncatedText}

返回格式：
{"basicInfo":{"name":"赛事名称或null","category":"youth/adult/campus或null","deadline":"YYYY-MM-DD或null","startDate":"YYYY-MM-DD或null","endDate":"YYYY-MM-DD或null","province":"省级名称或null","city":"城市名称或null","district":"区县名称或null","location":"具体场地或null","description":"简介或null"},"organizationStructure":{"organizers":["主办单位"],"undertakers":["承办单位"],"coOrganizers":["协办单位"]},"sharedRegulationDetails":{"teamLeaderLimit":整数或null,"coachLimit":整数或null,"doctorLimit":整数或null,"officialsCanPlay":布尔或null,"registrationFeePerPerson":数值或null,"disciplineDepositPerTeam":数值或null,"depositRefundWorkdays":整数或null,"forfeitDepositDeduction":布尔或null,"foreignPlayersAllowed":布尔或null,"professionalPlayersAllowed":布尔或null,"femaleAdultAgeException":布尔或null,"blacklistCheckRequired":布尔或null,"teamKitPhotoRequired":布尔或null,"eligibilityComplaintDeadlineRound":整数或null,"eligibilityViolationScore":"0:3等或null","matchBallSize":整数或null,"lineupSubmissionMinutes":整数或null,"minimumPlayersToContinue":整数或null,"terminationForfeitScore":"0:3等或null","firstHalfSubstitutionWindows":整数或null,"secondHalfSubstitutionWindows":整数或null,"halftimeSubstitutionWindows":整数或null,"unlimitedPlayersPerWindow":布尔或null,"substitutionReentryForbidden":布尔或null,"keepHigherLiveScore":布尔或null,"concussionSubstitutionLimit":整数或null,"opponentConcussionSubstitution":布尔或null,"benchTotalLimit":整数或null,"benchPlayerLimit":整数或null,"benchOfficialLimit":整数或null,"jerseyNumberMin":整数或null,"jerseyNumberMax":整数或null,"twoKitsRequired":布尔或null,"captainArmbandRequired":布尔或null,"shinGuardsRequired":布尔或null,"metalStudsForbidden":布尔或null,"jerseyModificationForbidden":布尔或null,"benchKitContrastRequired":布尔或null,"stoppagePauseMinutes":整数或null,"stoppagePausePeriods":整数或null,"stoppageDecisionHours":整数或null,"resumeRemainingTimePreferred":布尔或null,"resumeStatePreserved":布尔或null,"withdrawalVoidsResults":布尔或null,"fairPlayDisqualification":布尔或null,"cardsCarryToNextStage":布尔或null,"teamOfficialsDiscipline":布尔或null,"severeMisconductBanMonths":整数或null},"divisions":[{"name":"明确写出的组别名称","ageGroup":"U8等或open","gender":"male/female/mixed","birthDateStart":"YYYY-MM-DD或null","birthDateEnd":"YYYY-MM-DD或null","eligibilityNotes":"年龄例外等原文摘要或null","rosterLimit":整数或null,"minimumRoster":整数或null,"identityDocumentRequired":布尔或null,"insuranceRequired":布尔或null,"waiverRequired":布尔或null,"singleDivisionOnly":布尔或null,"matchFormat":"5side/7side/8side/9side/11side","expectedTeams":整数或null,"formatType":"cup/tournament/league/hybrid","groupCount":整数或null,"teamsPerGroup":整数或null,"groupCycle":"single/double或null","advancePerGroup":整数或null,"knockoutSize":整数或null,"periodMode":"halves/quarters","matchMinutes":整数或null,"breakMinutes":整数或null,"substitutionLimit":整数或null,"substitutionWindows":整数或null,"substitutionReentryAllowed":布尔或null,"yellowCardSuspension":整数或null,"redCardSuspension":整数或null,"winPoints":整数或null,"drawPoints":整数或null,"lossPoints":整数或null,"drawResolution":"draw/penalties或null","penaltyWinPoints":整数或null,"penaltyLossPoints":整数或null}]}

规则：日期转YYYY-MM-DD；数组只放规程中明确出现的内容；没有明确组别名称时divisions返回空数组，不得臆造。`;

    console.log('[analyze] ★★★ 调用 CloudBase AI (hy3)，使用 @cloudbase/node-sdk');

    // ★ 官方正确方式：app.ai().createModel().generateText()
    const ai = app.ai();
    const model = ai.createModel('cloudbase');

    const result = await model.generateText({
      model: 'hy3',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.3
    });

    console.log('[analyze] ★★★ AI 返回成功，文本长度:', result.text?.length);
    console.log('[analyze] ★★★ AI 返回内容(前300字):', result.text?.substring(0, 300));

    return normalizeAnalysisResult(extractJsonFromResponse(result.text || ''), text);
  } catch (err) {
    console.error('[analyze] ★★★ AI 分析失败:', err.message || err);
    if (err.stack) { console.error('[analyze] ★★★ 错误堆栈(前500字):', err.stack.substring(0, 500)); }
    throw err;
  }
}

function getEmptyResult() {
  return {
    basicInfo: {
      name: null, category: null, deadline: null,
      startDate: null, endDate: null, province: null,
      city: null, district: null, location: null, description: null
    },
    matchTime: {
      timeType: null, halfDuration: null, halftimeBreak: null,
      quarterDuration: null, quartersCount: null, quarterBreak: null
    },
    organizationStructure: { organizers: [], undertakers: [], coOrganizers: [] },
    sharedRegulationDetails: {},
    divisions: [],
    rules: {
      pointsRule: { winPoints: null, drawPoints: null, lossPoints: null },
      substitutionRule: { maxSubstitutions: null, allowReturnSubstitution: null },
      suspensionRule: { yellowCardsForSuspension: null, redCardSuspensionMatches: null }
    }
  };
}

function extractJsonFromResponse(text) {
  try {
    // 去掉 markdown 代码块
    let cleaned = text.replace(/```(json)?\n?/g, '').trim();
    // 找到第一个 { 到最后一个 }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) { return getEmptyResult(); }
    const jsonStr = cleaned.substring(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    // 确保所有字段存在
    return mergeWithDefaults(parsed);
  } catch (e) {
    console.error('[extractJson] 解析失败:', e.message, '| 原始文本(前200字):', text.substring(0, 200));
    return getEmptyResult();
  }
}

function mergeWithDefaults(parsed) {
  const empty = getEmptyResult();
  // 深度合并，确保每级字段都存在
  const result = JSON.parse(JSON.stringify(empty));
  if (parsed.basicInfo) { Object.assign(result.basicInfo, parsed.basicInfo); }
  if (parsed.organizationStructure) { Object.assign(result.organizationStructure, parsed.organizationStructure); }
  if (parsed.sharedRegulationDetails && typeof parsed.sharedRegulationDetails === 'object') { Object.assign(result.sharedRegulationDetails, parsed.sharedRegulationDetails); }
  if (Array.isArray(parsed.divisions)) { result.divisions = parsed.divisions; }
  if (parsed.matchTime) { Object.assign(result.matchTime, parsed.matchTime); }
  if (parsed.rules) {
    if (parsed.rules.pointsRule) { Object.assign(result.rules.pointsRule, parsed.rules.pointsRule); }
    if (parsed.rules.substitutionRule) { Object.assign(result.rules.substitutionRule, parsed.rules.substitutionRule); }
    if (parsed.rules.suspensionRule) { Object.assign(result.rules.suspensionRule, parsed.rules.suspensionRule); }
  }
  return result;
}

// ==================== 分片上传处理 ====================

const CHUNK_SIZE = 40 * 1024; // 40KB/片
const sessions = new Map();

async function startChunkedParse(sessionId, fileName, fileSize, fileType, fileID) {
  sessions.set(sessionId, {
    sessionId, fileName, fileSize, fileType,
    chunks: {}, receivedChunks: 0, totalChunks: 0, text: '', status: 'uploading', fileID: String(fileID || '')
  });
  console.log('[chunk] ★★★ 开始分片解析会话:', sessionId, '文件名:', fileName, '类型:', fileType);
  return { success: true, sessionId };
}

async function uploadDataChunk(sessionId, chunkIndex, totalChunks, dataChunk) {
  const session = sessions.get(sessionId);
  if (!session) { throw new Error('会话不存在: ' + sessionId); }
  session.chunks[chunkIndex] = dataChunk;
  session.receivedChunks++;
  session.totalChunks = totalChunks;
  console.log('[chunk] ★★★ 收到分片:', chunkIndex + '/' + totalChunks, '会话:', sessionId);
  return { success: true, received: session.receivedChunks, total: totalChunks };
}

async function executeParsed(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) { throw new Error('会话不存在: ' + sessionId); }

  console.log('[execute] ★★★ 开始组装文件，会话:', sessionId, '总片数:', session.totalChunks, '已收:', Object.keys(session.chunks).length);

  // 每片均独立 Base64 编码，必须逐片解码后再合并二进制。
  // 直接拼接 Base64 文本会在首个填充符处截断，导致 PDF 结构损坏。
  const chunkBuffers = [];
  for (let i = 0; i < session.totalChunks; i++) {
    if (!session.chunks[i]) {
      throw new Error('分片 ' + i + ' 缺失，无法组装');
    }
    chunkBuffers.push(Buffer.from(session.chunks[i], 'base64'));
  }
  const fileBuffer = Buffer.concat(chunkBuffers);
  console.log('[execute] ★★★ 文件合并完成, Buffer大小:', fileBuffer.length);

  // 解码 Base64 → Buffer → 文本
  let text = '';
  try {
    console.log('[execute] ★★★ 文件大小(Buffer):', fileBuffer.length, '类型:', session.fileType);

    if (String(session.fileType).includes('pdf') || String(session.fileName).toLowerCase().endsWith('.pdf')) {
      const pdfParse = await getPdfParse();
      const data = await pdfParse(fileBuffer);
      text = data.text;
      session.pdfPages = Number(data.numpages || 0);
    } else if (String(session.fileType).includes('word') || String(session.fileType).includes('document') || /\.(doc|docx)$/i.test(session.fileName)) {
      const mammoth = await getMammoth();
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = result.value;
    } else if (session.fileType.startsWith('image/')) {
      // 图片类型：暂不支持，返回提示
      text = '[图片类型，暂不支持 OCR，请上传 PDF 或 Word 文档]';
    } else {
      text = fileBuffer.toString('utf8');
    }

    console.log('[execute] ★★★ 文本解析成功，长度:', text.length, '前100字:', text.substring(0, 100));
  } catch (e) {
    console.error('[execute] ★★★ 文件解析失败:', e.message);
    throw new Error('文件解析失败: ' + e.message);
  }

  // 调用 AI 分析
  console.log('[execute] ★★★ 开始调用 AI 分析...');
  if (!readableChineseText(text) && (String(session.fileType).includes('pdf') || String(session.fileName).toLowerCase().endsWith('.pdf'))) {
    text = await recognizePdfWithFreeOcr(fileBuffer, session.pdfPages || 1);
  }
  if (!readableChineseText(text)) throw new Error('未从规程中读取到可识别中文');
  const analysisResult = await analyzeWithHunyuan(text);
  console.log('[execute] ★★★ AI 分析完成，结果 keys:', Object.keys(analysisResult));

  sessions.delete(sessionId);

  return {
    success: true,
    data: analysisResult,
    rawText: text.substring(0, 500) // 只返回前500字用于调试
  };
}

async function parseStoredFile(body) {
  const fileID = String(body.fileID || '');
  const tournamentId = String(body.tournamentId || '');
  const actorOrgId = String(body.__actorOrgId || '');
  if (!fileID || !tournamentId || !actorOrgId) throw new Error('缺少赛事、文件或机构信息');

  const db = app.database();
  const loaded = await db.collection('tournaments').doc(tournamentId).get();
  const tournament = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data;
  if (!tournament || String(tournament.orgId || '') !== actorOrgId) throw new Error('赛事不存在或无权识别');
  if (String(tournament.regulationsFileId || '') !== fileID) throw new Error('规程文件与当前赛事不匹配');

  const downloaded = await app.downloadFile({ fileID }, { timeout: 60000 });
  const fileBuffer = downloaded && downloaded.fileContent;
  if (!fileBuffer || !fileBuffer.length) throw new Error('规程文件内容为空');

  const fileName = String(body.fileName || tournament.regulationsFileName || '');
  const fileType = String(body.fileType || '').toLowerCase();
  let text = '';
  let pdfPages = 0;
  if (fileType.includes('pdf') || /\.pdf$/i.test(fileName)) {
    const parser = await getPdfParse();
    const parsedPdf = await parser(fileBuffer);
    text = parsedPdf.text || '';
    pdfPages = Number(parsedPdf.numpages || 0);
  } else if (fileType.includes('word') || fileType.includes('document') || /\.(doc|docx)$/i.test(fileName)) {
    const parser = await getMammoth();
    text = (await parser.extractRawText({ buffer: fileBuffer })).value || '';
  } else {
    throw new Error('自动识别仅支持 PDF 或 Word 规程');
  }
  if (!text.trim()) throw new Error('未从规程中读取到文字');
  if (!readableChineseText(text) && (fileType.includes('pdf') || /\.pdf$/i.test(fileName))) {
    text = await recognizePdfWithFreeOcr(fileBuffer, pdfPages || 1);
  }
  if (!readableChineseText(text)) throw new Error('未从规程中读取到可识别中文');
  return { success: true, data: await analyzeWithHunyuan(text) };
}

// ==================== 主函数 ====================

exports.main = async (event, context) => {
  try {
    // ★ 兼容 HTTP 触发器：event.body 是字符串
    let body = event;
    if (event && typeof event.body === 'string') {
      try { body = JSON.parse(event.body); } catch (e) { /* ignore */ }
    }
    const action = body.action;

    console.log('[main] ★★★ 收到请求, action:', action, 'event keys:', Object.keys(event || {}));

    if (action === 'startChunkedParse') {
      const { sessionId, fileName, fileSize, fileType, fileID } = body;
      return await startChunkedParse(sessionId, fileName, fileSize, fileType, fileID);
    }

    if (action === 'uploadDataChunk') {
      const { sessionId, chunkIndex, totalChunks, dataChunk } = body;
      return await uploadDataChunk(sessionId, chunkIndex, totalChunks, dataChunk);
    }

    if (action === 'executeParsed') {
      const { sessionId } = body;
      return await executeParsed(sessionId);
    }

    if (action === 'parseStoredFile') {
      return await parseStoredFile(body);
    }

    return { success: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('[main] ★★★ 错误:', err.message);
    return { success: false, error: err.message };
  }
};
