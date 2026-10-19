// An authenticated account with no business assets can browse and create later.
// This presentation workspace is never part of the authorization catalog.
exports.context = function(identity) {
  const user = identity.user || {}, phone = String(identity.phone || user.phone || user.phoneNumber || '')
  if (!user._id || !/^1[3-9]\d{9}$/.test(phone)) throw new Error('请重新完成手机号登录')
  const role = (user.onboarding || {}).scene === 'event' ? 'organizer' : 'team_coach'
  return {
    success: true,
    user: { id:user._id, nickName:user.nickName || user.nickname || user.name || '微信用户', avatarUrl:user.avatarUrl || user.avatar || '', phone, phoneNumber:phone, phoneMasked:phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'), phoneVerified:user.phoneVerified === true },
    workspaces: [],
    currentWorkspace: { id:'personal:' + user._id, type:'personal', name:'我的空间', permissions:[], capabilities:[] },
    currentIdentity: { id:role, label:role === 'organizer' ? '赛事组织者' : '球队管理者' },
    homeEntries: [], homeEntriesVersion:'home-entries/2',
    participatingEntries:[], participatingEntriesVersion:'team-participation/1', participatingEntriesState:'ready', participatingEntriesError:'',
    modules:[], teams:[], tournaments:[], registrations:[], schedule:[], eventSchedule:[], trainingSchedule:[], upcoming:[], tasks:[], eventTasks:[], trainingTasks:[], messages:[], statistics:{}
  }
}
