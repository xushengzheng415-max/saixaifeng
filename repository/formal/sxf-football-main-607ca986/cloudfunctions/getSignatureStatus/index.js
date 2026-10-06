// 只读查询比赛签字状态，供 PC 轮询使用。
// 轮询不得在读取接口中反向更新 matches，正式写入只由裁判工作流完成。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

exports.main = async function(event) {
  const matchId = String((event || {}).matchId || '')
  if (!matchId) return { code: 1, success: false, message: '缺少 matchId' }

  try {
    const db = cloud.database()
    const matchResult = await db.collection('matches').doc(matchId).get()
    const match = matchResult && matchResult.data
    if (!match) return { code: 1, success: false, message: '比赛不存在' }

    const signature = match.refereeSignature && typeof match.refereeSignature === 'object'
      ? match.refereeSignature
      : {}
    const record = match.refereeRecord && typeof match.refereeRecord === 'object'
      ? match.refereeRecord
      : {}
    const signatureUrl = firstNonEmpty(
      match.refereeSignatureUrl,
      match.signatureUrl,
      signature.url,
      signature.signatureUrl,
      record.signatureUrl,
      ''
    )
    const signed = match.refereeSigned === true ||
      signature.status === 'signed' ||
      Number(signature.pointCount || 0) >= 8 ||
      record.signatureStatus === 'signed'

    if (signed) {
      return {
        code: 0,
        success: true,
        signed: true,
        signatureUrl,
        signedAt: firstNonEmpty(
          match.refereeSignatureTime,
          match.refereeSignedAt,
          signature.signedAt,
          record.submittedAt,
          null
        )
      }
    }

    // 兼容历史 signatures 记录，但保持整个函数只读，不再同步 matches。
    const sigResult = await db.collection('signatures').where({ matchId }).limit(1).get()
    const legacy = sigResult && Array.isArray(sigResult.data) ? sigResult.data[0] : null
    if (legacy && legacy.signed === true && firstNonEmpty(legacy.signatureUrl, legacy.url, '')) {
      return {
        code: 0,
        success: true,
        signed: true,
        signatureUrl: firstNonEmpty(legacy.signatureUrl, legacy.url, ''),
        signedAt: firstNonEmpty(legacy.signedAt, legacy.signTime, null),
        source: 'legacy_read_only'
      }
    }

    return { code: 0, success: true, signed: false }
  } catch (error) {
    console.error('[getSignatureStatus] read failed:', error)
    return {
      code: 1,
      success: false,
      message: '查询失败: ' + (error.message || error),
      signed: false
    }
  }
}
