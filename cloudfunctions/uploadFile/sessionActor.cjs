'use strict'
// Called only after token lookup proves one active, unexpired server session.
function validateSessionActor(session, event) {
  const deny = () => ({success:false,code:'UPLOAD_ACTOR_FORBIDDEN',message:'上传身份不匹配，请刷新后重试'})
  if (session.principalType === 'platform_owner') {
    if (session.channel !== 'platform_password') return deny()
    const actorId = String(session.userId || 'platform-owner')
    if (event.__actorUserId && String(event.__actorUserId) !== actorId) return deny()
    if (event.__actorOrgId) return deny()
    return {success:true,platformOwner:true}
  }
  if (!session.userId || event.__actorUserId && String(event.__actorUserId) !== String(session.userId)) return deny()
  return {success:true,platformOwner:false}
}
module.exports = {validateSessionActor}
