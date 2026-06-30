const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { matchId, signatureUrl, signed, signedBy } = event
  if (!matchId) {
    return { code: -1, message: '缺少 matchId' }
  }

  try {
    await db.collection('matches').doc(matchId).update({
      data: {
        refereeSigned: !!signed,
        refereeSignatureUrl: signatureUrl || '',
        refereeSignedAt: db.serverDate(),
        refereeSignedBy: signedBy || ''
      }
    })
    return { code: 0, message: '更新成功' }
  } catch (err) {
    console.error('updateMatchSignature error:', err)
    return { code: -1, message: err.message || '更新失败' }
  }
}
