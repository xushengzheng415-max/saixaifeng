// 身份证籍贯推算自检（2026-10-29 用户确认 A1 口径）。
// 校验：省市文本、平台地区码、来源标记，以及未收录地区的「只写文字籍贯」行为。
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { resolveNativePlace, coreName } = require('../cloudfunctions/getMiniWorkspace/idcardRegion.cjs')

function expect(idCard, nativePlace, region) {
  const result = resolveNativePlace(idCard)
  assert.ok(result, idCard + ' 未返回结果')
  assert.strictEqual(result.nativePlace, nativePlace, idCard + ' 籍贯不符')
  assert.strictEqual(result.nativePlaceSource, 'id_card', idCard + ' 缺少来源标记')
  if (region) assert.deepStrictEqual(result.nativePlaceRegion, region, idCard + ' 地区码不符')
  else assert.strictEqual(result.nativePlaceRegion, undefined, idCard + ' 不应生成结构化地区')
}

expect('410102199001011234', '河南省郑州市', { provinceCode: '226', cityLetter: 'A' })
expect('110101199001011234', '北京市', { provinceCode: '104', cityLetter: 'A' })
expect('310101199001011234', '上海市', { provinceCode: '101', cityLetter: 'A' })
expect('500101199001011234', '重庆市', { provinceCode: '103', cityLetter: 'A' })
expect('130102199001011234', '河北省石家庄市', { provinceCode: '208', cityLetter: 'A' })
expect('152201199001011234', '内蒙古自治区兴安盟', { provinceCode: '216', cityLetter: 'F' })
expect('419001199001011234', '河南省济源市', { provinceCode: '226', cityLetter: 'U' })
expect('429004199001011234', '湖北省仙桃市', { provinceCode: '210', cityLetter: 'M' })
expect('659001199001011234', '新疆维吾尔自治区石河子市', { provinceCode: '223', cityLetter: 'C' })
// 平台字典未收录（西藏、台湾、港澳、境外）与同名歧义（桂林）只写文字籍贯，不猜地区。
expect('540102199001011234', '西藏自治区拉萨市')
expect('710101199001011234', '台湾省')
expect('810101199001011234', '香港特别行政区')
expect('910101199001011234', '境外')
expect('450303199001011234', '广西壮族自治区桂林市')

// 非身份证号不推算，避免把不可用输入写成籍贯。
assert.strictEqual(resolveNativePlace('4101021990'), null)
assert.strictEqual(resolveNativePlace(''), null)

// 简称归一：族名与行政级别后缀不参与匹配。
assert.strictEqual(coreName('恩施土家族苗族自治州'), '恩施')
assert.strictEqual(coreName('新疆维吾尔自治区'), '新疆')
assert.strictEqual(coreName('广西壮族自治区'), '广西')
assert.strictEqual(coreName('大兴安岭地区'), '大兴安岭')

// 城市级编码覆盖：全部地级码都能给出籍贯文本，只有已知缺口没有结构化地区。
const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/getMiniWorkspace/idcardRegion.cjs'), 'utf8')
const cityBlock = source.slice(source.indexOf('const CITIES'), source.indexOf('// 省直辖县级行政区'))
const codes = Array.from(new Set(Array.from(cityBlock.matchAll(/'(\d{4})':/g)).map(m => m[1])))
assert.ok(codes.length > 300, '地级码数量异常：' + codes.length)
const unmapped = []
for (const code of codes) {
  const result = resolveNativePlace(code + '00199001011234')
  assert.ok(result && result.nativePlace && result.nativePlace.length >= 2, code + ' 籍贯文本异常')
  if (!result.nativePlaceRegion) unmapped.push(code)
}
const expectedGaps = ['4503', '4603', '5401', '5402', '5403', '5404', '5405', '5406', '5425']
assert.deepStrictEqual(unmapped.sort(), expectedGaps.sort(), '未收录地区与登记清单不一致：' + unmapped.join(','))

console.log('idcard-region: PASS (' + codes.length + ' 个地级码，未收录 ' + unmapped.length + ' 个)')
