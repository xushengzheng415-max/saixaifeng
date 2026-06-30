// 云函数：解析竞赛规程文档，AI 识别赛制信息
// 使用 @cloudbase/node-sdk（官方推荐，支持 AI 调用）
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({
  env: 'cloud1-7g8ckb3c7815a011',
  timeout: 60000   // SDK 超时 60 秒，AI 生成可能耗时较长
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
async function analyzeWithHunyuan(text) {
  try {
    const truncatedText = text.substring(0, 3000);
    console.log('[analyze] ★★★ 文本长度(截断前):', text.length, '(截断后):', truncatedText.length);

    const prompt = `分析以下足球竞赛规程，提取关键信息，返回纯JSON（不要markdown代码块）：

【规程文本】
${truncatedText}

返回格式：
{"basicInfo":{"name":"赛事名称或null","type":"league/cup/group/combined或null","deadline":"YYYY-MM-DD或null","startDate":"YYYY-MM-DD或null","endDate":"YYYY-MM-DD或null","maxTeams":整数或null,"maxPlayers":整数或null,"location":"城市或null","description":"简介或null"},"matchTime":{"timeType":"halves/quarters或null","halfDuration":整数分钟或null,"halftimeBreak":整数分钟或null,"quarterDuration":整数分钟或null,"quartersCount":整数或null,"quarterBreak":整数分钟或null},"rules":{"pointsRule":{"winPoints":整数或null,"drawPoints":整数或null,"lossPoints":整数或null},"substitutionRule":{"maxSubstitutions":整数或null,"allowReturnSubstitution":布尔或null},"suspensionRule":{"yellowCardsForSuspension":整数或null,"redCardSuspensionMatches":整数或null}}}

规则：提到"上下半场""半场"→timeType=halves，提到"节""分节"→quarters；日期转YYYY-MM-DD格式。`;

    console.log('[analyze] ★★★ 调用 CloudBase AI (hy3-preview)，使用 @cloudbase/node-sdk');

    // ★ 官方正确方式：app.ai().createModel().generateText()
    const ai = app.ai();
    const model = ai.createModel('cloudbase');

    const result = await model.generateText({
      model: 'hy3-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3
    });

    console.log('[analyze] ★★★ AI 返回成功，文本长度:', result.text?.length);
    console.log('[analyze] ★★★ AI 返回内容(前300字):', result.text?.substring(0, 300));

    return extractJsonFromResponse(result.text || '');
  } catch (err) {
    console.error('[analyze] ★★★ AI 分析失败:', err.message || err);
    if (err.stack) { console.error('[analyze] ★★★ 错误堆栈(前500字):', err.stack.substring(0, 500)); }
    return getEmptyResult();
  }
}

function getEmptyResult() {
  return {
    basicInfo: {
      name: null, type: null, deadline: null,
      startDate: null, endDate: null, maxTeams: null,
      maxPlayers: null, location: null, description: null
    },
    matchTime: {
      timeType: null, halfDuration: null, halftimeBreak: null,
      quarterDuration: null, quartersCount: null, quarterBreak: null
    },
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

async function startChunkedParse(sessionId, fileName, fileSize, fileType) {
  sessions.set(sessionId, {
    sessionId, fileName, fileSize, fileType,
    chunks: {}, receivedChunks: 0, totalChunks: 0, text: '', status: 'uploading'
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

  // 按序号拼接所有分片
  let base64String = '';
  for (let i = 0; i < session.totalChunks; i++) {
    if (!session.chunks[i]) {
      throw new Error('分片 ' + i + ' 缺失，无法组装');
    }
    base64String += session.chunks[i];
  }

  console.log('[execute] ★★★ Base64 总长度:', base64String.length);

  // 解码 Base64 → Buffer → 文本
  let text = '';
  try {
    const fileBuffer = Buffer.from(base64String, 'base64');
    console.log('[execute] ★★★ 文件大小(Buffer):', fileBuffer.length, '类型:', session.fileType);

    if (session.fileType === 'application/pdf') {
      const pdfParse = await getPdfParse();
      const data = await pdfParse(fileBuffer);
      text = data.text;
    } else if (session.fileType.includes('word') || session.fileType.includes('document')) {
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
  const analysisResult = await analyzeWithHunyuan(text);
  console.log('[execute] ★★★ AI 分析完成，结果 keys:', Object.keys(analysisResult));

  sessions.delete(sessionId);

  return {
    success: true,
    data: analysisResult,
    rawText: text.substring(0, 500) // 只返回前500字用于调试
  };
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
      const { sessionId, fileName, fileSize, fileType } = body;
      return await startChunkedParse(sessionId, fileName, fileSize, fileType);
    }

    if (action === 'uploadDataChunk') {
      const { sessionId, chunkIndex, totalChunks, dataChunk } = body;
      return await uploadDataChunk(sessionId, chunkIndex, totalChunks, dataChunk);
    }

    if (action === 'executeParsed') {
      const { sessionId } = body;
      return await executeParsed(sessionId);
    }

    return { success: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('[main] ★★★ 错误:', err.message);
    return { success: false, error: err.message };
  }
};
