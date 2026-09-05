const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const miniWorkspace = fs.readFileSync(path.join(root, 'cloudfunctions/getMiniWorkspace/index.js'), 'utf8')
const webApi = fs.readFileSync(path.join(root, 'cloudfunctions/webLoginApi/index.js'), 'utf8')
const h5 = fs.readFileSync(path.join(root, 'service-account-h5/app.js'), 'utf8')

const checks = [
  ['新球员登记写入标准资料链标记', /standardProfileFlow:\s*true[\s\S]{0,180}identityVerificationRequired:\s*true[\s\S]{0,120}portraitRequired:\s*true/.test(miniWorkspace)],
  ['新建家长邀请继承标准链要求', /identityVerificationRequired:\s*identity\.defined\s*\?\s*identity\.value\s*:\s*standardFlow/.test(miniWorkspace) && /portraitRequired:\s*portrait\.defined\s*\?\s*portrait\.value\s*:\s*standardFlow/.test(miniWorkspace)],
  ['旧邀请可升级到标准链', /needsUpgrade[\s\S]{0,420}identityVerificationRequired:\s*true[\s\S]{0,120}portraitRequired:\s*true/.test(miniWorkspace)],
  ['H5按新球员来源启用完整链路', /standard-player-onboarding/.test(webApi) && /realName:\s*identity\.defined\s*\?\s*identity\.value\s*:\s*standardFlow/.test(webApi)],
  ['身份证OCR只保存脱敏号码', /IDCardOCR/.test(webApi) && /identityNumberMasked:\s*maskIdentityNumber\(ocr\.IdNum\)/.test(webApi) && !/recognizedIdNum\s*:/.test(webApi)],
  ['实名自动结果包含通过和退回分支', /automatic_ocr/.test(webApi) && /nameMatches\s*&&\s*birthMatches\s*\?\s*'approved'\s*:\s*'rejected'/.test(webApi)],
  ['H5包含03至08完整页面', ['renderParentIdentityUpload', 'renderParentIdentityResult', 'renderPortraitGuide', 'renderPortraitCamera', 'renderPortraitConfirmation', 'renderParentSubmitSuccess'].every(name => h5.includes('function ' + name))],
  ['成功页移除重复要求说明', !h5.includes('是否需要实名认证和照片由主办方设置；本页只显示本次赛事已开启的要求。')]
]

const failed = checks.filter(([, passed]) => !passed)
if (failed.length) {
  failed.forEach(([name]) => console.error('失败：' + name))
  process.exit(1)
}
console.log('家长标准资料闭环测试通过：' + checks.length + '/' + checks.length)
