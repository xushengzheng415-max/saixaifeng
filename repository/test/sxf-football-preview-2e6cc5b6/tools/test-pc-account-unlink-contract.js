'use strict'

const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}
function check(condition, message) {
  if (!condition) throw new Error(message)
}
function section(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  check(from >= 0 && to > from, `Missing section: ${start}`)
  return source.slice(from, to)
}

const platform = read('cloudfunctions/manageTournamentCenterContent/index.js')
const selfApi = read('cloudfunctions/webLoginApi/index.js')
const mini = read('cloudfunctions/getMiniWorkspace/index.js')
const serviceFlow = read('cloudfunctions/tournamentRegistrationFlow/index.js')
const platformUnlink = section(platform, 'async function deleteOrganizerAccount', 'function validateBannerImage')
const selfUnlink = section(selfApi, 'async function handleDeleteCurrentAccount', 'async function handleCompleteWechatPhoneLogin')

check(platform.includes("const dependencies = references.filter(item => item.key === 'tournaments')"), 'Platform unlink must only block on created tournaments')
check(!platformUnlink.includes("collection('users').doc(user._id).remove()"), 'Platform unlink must not delete the natural-person user')
check(!selfUnlink.includes("collection('users').doc(auth.userId).remove()"), 'Self unlink must not delete the natural-person user')
check(platformUnlink.includes("wechatOpenId: '', pcAccountStatus: 'cancelled'"), 'Platform unlink must clear only the PC WeChat binding')
check(selfUnlink.includes("preservedMiniProgramAccount: true"), 'Self unlink must preserve mini-program access')
check(selfApi.includes("boundUser.pcAccountStatus!=='cancelled'&&boundUser.pcLoginEnabled!==false"), 'Cancelled PC accounts must not direct-login')
check(mini.includes("orgTeams.concat(memberTeams, ownedTeams)"), 'Mini workspace must include directly managed unassigned teams')
check(mini.includes("if (teamOrgId && teamOrgId !== String(workspace.orgId)) return"), 'Mini workspace must exclude teams owned by another organization')
check(serviceFlow.includes("organizerPcBound: true, subscribed: true"), 'PC service binding checks must require an active PC binding')
check(serviceFlow.includes("user.pcServiceRebindRequired === true"), 'PC unlink must force explicit service-account rebinding')

console.log('PC account unlink contract: PASS')
