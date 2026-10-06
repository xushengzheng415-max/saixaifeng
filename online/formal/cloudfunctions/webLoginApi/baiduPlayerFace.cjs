const https = require('node:https')
const crypto = require('node:crypto')

function createBaiduPlayerFace({ cloud, env = process.env, request = post }) {
  let cachedToken = '', tokenExpires = 0
  const groupId = env.BAIDU_FACE_GROUP_ID || 'football_players'
  function configured() { return Boolean(env.BAIDU_FACE_API_KEY && env.BAIDU_FACE_SECRET_KEY && /^[A-Za-z0-9_]{1,128}$/.test(groupId)) }
  async function accessToken() {
    if (cachedToken && tokenExpires > Date.now()) return cachedToken
    const result = await request('/oauth/2.0/token', { grant_type:'client_credentials', client_id:env.BAIDU_FACE_API_KEY, client_secret:env.BAIDU_FACE_SECRET_KEY }, true)
    if (!result.access_token) throw Object.assign(new Error('百度应用授权失败，请检查人脸应用配置'), { code:'BAIDU_FACE_AUTH_FAILED' })
    cachedToken = result.access_token; tokenExpires = Date.now() + Math.max(0, Number(result.expires_in || 0) - 120) * 1000
    return cachedToken
  }
  async function register(playerId) {
    const db = cloud.database(), ref = db.collection('players').doc(playerId)
    const read = await ref.get(), player = Array.isArray(read.data) ? read.data[0] : read.data
    if (!player || player.profileStatus !== 'complete' || player.parentProfileSubmissionStatus !== 'submitted') return { status:'not_eligible', message:'登记完成后才能录入人脸' }
    if (player.faceRegistrationStatus === 'registered') return { status:'registered', duplicate:true }
    if (!configured()) return { status:'not_configured', message:'百度人脸服务尚未配置' }
    const portraitRead = await db.collection('parent_portraits').doc(String(player.recentPortraitId || '')).get()
    const portrait = Array.isArray(portraitRead.data) ? portraitRead.data[0] : portraitRead.data
    if (!portrait || portrait.status !== 'confirmed' || portrait.baiduFaceConsent !== true || !portrait.baiduFaceConsentAt) return { status:'consent_required', message:'请确认照片并授权用于赛场人脸核验' }
    const invites = (await db.collection('parent_profile_invites').where({ token:portrait.parentInvite, playerId }).limit(2).get()).data || []
    if (invites.length !== 1 || !player.identityVerificationId) return { status:'not_eligible', message:'照片与球员身份不一致，暂不能入库' }
    const proofs = (await db.collection('parent_identity_verifications').where({ _id:player.identityVerificationId, status:'approved' }).limit(1).get()).data || []
    if (!proofs[0] || proofs[0].revokedAt) return { status:'not_eligible', message:'身份审核通过后才能入库' }
    const sourceInvites = (await db.collection('parent_profile_invites').where({ token:proofs[0].parentInvite, playerId }).limit(2).get()).data || []
    if (sourceInvites.length !== 1) return { status:'not_eligible', message:'核验档案与球员身份不一致' }
    const jobId = crypto.randomBytes(12).toString('hex')
    const acquired = await db.runTransaction(async tx => {
      const row = await tx.collection('players').doc(playerId).get(), p = Array.isArray(row.data) ? row.data[0] : row.data
      if (!p || p.recentPortraitId !== portrait._id || p.identityVerificationId !== player.identityVerificationId || p.profileStatus !== 'complete') return 'changed'
      if (p.faceRegistrationStatus === 'registered') return 'registered'
      if (Number(p.faceRegistrationLeaseUntil || 0) > Date.now()) return 'busy'
      await tx.collection('players').doc(playerId).update({ data:{ faceRegistrationStatus:'processing', faceRegistrationJobId:jobId, faceRegistrationLeaseUntil:Date.now()+45000, updateTime:db.serverDate() } })
      return 'acquired'
    })
    if (acquired !== 'acquired') return { status:acquired === 'registered' ? 'registered' : (acquired === 'changed' ? 'not_eligible' : 'processing') }
    let outcome
    try {
      // Source comes exclusively from the authenticated, confirmed portrait record.
      const imageRead = await cloud.downloadFile({ fileID:String(portrait.avatarFileId || '') })
      const bytes = imageRead.fileContent
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.toString('base64').length > 2 * 1024 * 1024) throw Object.assign(new Error('人脸照片过大或不可读取，请重新确认照片'), { code:'FACE_IMAGE_INVALID' })
      const token = await accessToken()
      const userId = 'p_' + crypto.createHash('sha256').update(playerId).digest('hex').slice(0,48)
      const result = await request('/rest/2.0/face/v3/faceset/user/add?access_token=' + encodeURIComponent(token), { image:bytes.toString('base64'), image_type:'BASE64', group_id:groupId, user_id:userId, action_type:'REPLACE', quality_control:'NORMAL', liveness_control:'NONE' })
      if (Number(result.error_code) !== 0 || !result.result || !result.result.face_token) {
        const code = Number(result.error_code)
        const message = code === 18 ? '百度人脸服务繁忙，请稍后重试' : ([222202,222203,223120,223121,223122,223123,223124,223125,223126].includes(code) ? '照片未满足人脸质量要求，请重新拍摄清晰正面照' : '百度人脸录入失败，请检查应用授权或稍后重试')
        throw Object.assign(new Error(message), { code:'BAIDU_FACE_REGISTER_FAILED', providerCode:code })
      }
      outcome = { status:'registered', message:'人脸档案已录入' }
      await ref.update({ data:{ faceRegistrationStatus:'registered', faceProvider:'baidu', baiduFaceUserId:userId, baiduFaceGroupId:groupId, faceRegistrationPortraitId:portrait._id, faceRegisteredAt:db.serverDate(), faceRegistrationError:'', faceRegistrationLeaseUntil:0, faceRegistrationConsentVersion:'baidu-match-face/1', updateTime:db.serverDate() } })
    } catch (error) {
      outcome = { status:'failed', message:error.code ? error.message : '人脸录入暂未完成，请稍后重试' }
      await ref.update({ data:{ faceRegistrationStatus:'failed', faceRegistrationError:outcome.message, faceRegistrationLeaseUntil:0, updateTime:db.serverDate() } })
    }
    return outcome
  }
  return { configured, register }
}

function post(path, body, form = false) {
  return new Promise((resolve,reject) => {
    const encoded = form ? new URLSearchParams(body).toString() : JSON.stringify(body)
    const req = https.request({ hostname:'aip.baidubce.com', path, method:'POST', headers:{ 'Content-Type':form?'application/x-www-form-urlencoded':'application/json', 'Content-Length':Buffer.byteLength(encoded) } }, res => {
      let bytes=0, chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>256*1024)req.destroy(new Error('Response too large'));else chunks.push(b)})
      res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Provider unavailable');resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(e){reject(e)}})
    });req.setTimeout(5000,()=>req.destroy(new Error('Provider timeout')));req.on('error',reject);req.end(encoded)
  })
}
module.exports = { createBaiduPlayerFace }
