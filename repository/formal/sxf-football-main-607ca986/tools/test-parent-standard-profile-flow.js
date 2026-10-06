const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const miniWorkspace = fs.readFileSync(path.join(root, 'cloudfunctions/getMiniWorkspace/index.js'), 'utf8')
const webApi = fs.readFileSync(path.join(root, 'cloudfunctions/webLoginApi/index.js'), 'utf8')
const h5 = fs.readFileSync(path.join(root, 'service-account-h5/app.js'), 'utf8')
const miniInvite = fs.readFileSync(path.join(root, 'miniprogram/pages/team/player-invite/player-invite.js'), 'utf8')
const miniInviteWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/team/player-invite/player-invite.wxml'), 'utf8')
const miniPlayerAdd = fs.readFileSync(path.join(root, 'miniprogram/pages/team/player-add/player-add.js'), 'utf8')
const ageHelpersSource = miniWorkspace.slice(miniWorkspace.indexOf('function ageOnReferenceDate'), miniWorkspace.indexOf('function registrantTypeForPlayer'))
const registrantTypeForBirthDate = new Function(ageHelpersSource + '; return registrantTypeForBirthDate')()

const checks = [
  ['新球员登记写入标准资料链标记', /standardProfileFlow:\s*true[\s\S]{0,180}identityVerificationRequired:\s*true[\s\S]{0,120}portraitRequired:\s*true/.test(miniWorkspace)],
  ['新建家长邀请继承标准链要求', /identityVerificationRequired:\s*identity\.defined\s*\?\s*identity\.value\s*:\s*standardFlow/.test(miniWorkspace) && /portraitRequired:\s*portrait\.defined\s*\?\s*portrait\.value\s*:\s*standardFlow/.test(miniWorkspace)],
  ['旧邀请可升级到标准链', /needsUpgrade[\s\S]{0,420}identityVerificationRequired:\s*true[\s\S]{0,120}portraitRequired:\s*true/.test(miniWorkspace)],
  ['H5按新球员来源启用完整链路', /standard-player-onboarding/.test(webApi) && /realName:\s*identity\.defined\s*\?\s*identity\.value\s*:\s*standardFlow/.test(webApi)],
  ['身份证OCR只保存脱敏号码', /IDCardOCR/.test(webApi) && /identityNumberMasked:\s*maskIdentityNumber\(ocr\.IdNum\)/.test(webApi) && !/recognizedIdNum\s*:/.test(webApi)],
  ['实名自动结果包含通过和退回分支', /const autoReviewAllowed = recognized && warnings\.length === 0 && algorithmPassed/.test(webApi) && /nameMatches\s*&&\s*birthMatches[\s)]*\?\s*'approved'\s*:\s*'rejected'/.test(webApi)],
  ['H5包含03至08完整页面', ['renderParentIdentityUpload', 'renderParentIdentityResult', 'renderPortraitGuide', 'renderPortraitCamera', 'renderPortraitConfirmation', 'renderParentSubmitSuccess'].every(name => h5.includes('function ' + name))],
  ['成功页移除重复要求说明', !h5.includes('是否需要实名认证和照片由主办方设置；本页只显示本次赛事已开启的要求。')],
  ['服务端按18周岁自动判断登记主体', /function registrantTypeForBirthDate/.test(miniWorkspace) && /age !== null && age >= 18 \? 'self' : 'guardian'/.test(miniWorkspace)],
  ['统一邀请只使用当前账号已验证手机号', /const accountPhone = verifiedUserPhone\(identity\.user\)/.test(miniWorkspace) && !/const participantRole = String\(event\.participantRole/.test(miniWorkspace)],
  ['本人和监护人分别建立账号关系', /playerData\.playerPhone = accountPhone/.test(miniWorkspace) && /playerData\.guardianPhone = accountPhone/.test(miniWorkspace)],
  ['H5基础资料支持本人或监护人授权', /function parentDraftIsAuthorized/.test(webApi) && /registrantAuthorized: true/.test(webApi) && /submitterLabel = result\.registrantType === 'self'/.test(h5)],
  ['小程序出生日期触发自动分流', /registrantTypeForBirthDate\(value\)/.test(miniInvite) && /showGuardianFields/.test(miniInviteWxml) && !/data-role="player"/.test(miniInviteWxml)],
  ['管理员添加球员动态切换联系方式', /contactPhoneLabel: self \? '球员本人手机号 \*'/.test(miniPlayerAdd) && /registrantUi\(value\)/.test(miniPlayerAdd)],
  ['18周岁生日当天进入本人登记', registrantTypeForBirthDate('2008-09-13', '2026-09-13') === 'self'],
  ['18周岁生日前仍由监护人登记', registrantTypeForBirthDate('2008-09-14', '2026-09-13') === 'guardian'],
  ['出生日期无效时采用监护人安全默认', registrantTypeForBirthDate('', '2026-09-13') === 'guardian']
]

const failed = checks.filter(([, passed]) => !passed)
if (failed.length) {
  failed.forEach(([name]) => console.error('失败：' + name))
  process.exit(1)
}
console.log('家长标准资料闭环测试通过：' + checks.length + '/' + checks.length)
