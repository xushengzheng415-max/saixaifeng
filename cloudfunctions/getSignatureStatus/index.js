// 云函数：查询签字状态（供PC端轮询）
// 被 PC 端 previewDialog 里的 startSignaturePolling() 调用
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { matchId } = event
  
  if (!matchId) {
    return { code: 1, message: '缺少 matchId' }
  }
  
  try {
    const db = cloud.database()
    const _ = db.command
    
    // 查询比赛记录
    const matchRes = await db.collection('matches').doc(matchId).get()
    
    if (!matchRes.data) {
      return { code: 1, message: '比赛不存在' }
    }
    
    const match = matchRes.data
    
    // 检查是否已签字（优先使用 refereeSignatureUrl，兼容 signatureUrl）
    const sigUrl = match.refereeSignatureUrl || match.signatureUrl || ''
    if (match.refereeSigned === true && sigUrl) {
      return {
        code: 0,
        signed: true,
        signatureUrl: sigUrl,
        signedAt: match.refereeSignatureTime || match.signedAt || null
      }
    }
    
    // 也检查签名集合（备用）
    const sigRes = await db.collection('signatures').where({
      matchId: matchId
    }).limit(1).get()
    
    if (sigRes.data && sigRes.data.length > 0) {
      const sig = sigRes.data[0]
      if (sig.signed === true && sig.signatureUrl) {
        // 同步到 matches 表
        await db.collection('matches').doc(matchId).update({
          refereeSigned: true,
          refereeSignatureUrl: sig.signatureUrl,
          refereeSignatureTime: sig.signedAt || new Date()
        })
        
        return {
          code: 0,
          signed: true,
          signatureUrl: sig.signatureUrl,
          signedAt: sig.signedAt || null
        }
      }
    }
    
    // 未签字
    return {
      code: 0,
      signed: false
    }
    
  } catch (e) {
    console.error('查询签字状态失败:', e)
    return {
      code: 1,
      message: '查询失败: ' + (e.message || e),
      signed: false
    }
  }
}
