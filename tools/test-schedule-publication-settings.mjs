import assert from 'node:assert/strict'
import {
  normalizePublicationVenues,
  buildPublicationSettings,
  buildPublicationSettingsText,
  resolvePublicationVenues,
  summarizePublicationVenues
} from '../web-admin-vue/src/utils/publicationSettings.js'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('  ✓', name)
}

console.log('竞赛文件场地与赛期口径：')

test('两处都没有场地时显示“场地待定”', () => {
  assert.equal(summarizePublicationVenues([], []), '场地待定')
  assert.equal(summarizePublicationVenues([undefined, '   ', null], []), '场地待定')
})

test('真实比赛场地优先于赛程设置里的场地', () => {
  assert.equal(
    summarizePublicationVenues(['2号场地', '1号场地'], ['9号场地', '10号场地']),
    '1号场地、2号场地'
  )
  assert.deepEqual(resolvePublicationVenues(['2号场地'], ['9号场地']), ['2号场地'])
})

test('比赛尚未编排时退回赛程设置里已保存的场地清单', () => {
  assert.equal(summarizePublicationVenues([], ['3号场地', '1号场地']), '1号场地、3号场地')
})

test('场地名去空白、去空值、去重并按数字自然序排列', () => {
  assert.deepEqual(
    normalizePublicationVenues(['10号场地', ' 2号场地 ', '10号场地', '', null, undefined, '1号场地']),
    ['1号场地', '2号场地', '10号场地']
  )
})

test('赛期与比赛日来自已保存的赛程设置', () => {
  const settings = buildPublicationSettings({
    startDate: '2026-09-26',
    endDate: '2026-10-31',
    matchDays: ['周六', '周日'],
    venueResources: [{ name: '1号场地' }, { venue: '2号场地' }, { name: '' }],
    venues: ['2号场地', '3号场地']
  })
  assert.deepEqual(settings, {
    period: '2026-09-26—2026-10-31',
    matchDays: '周六、周日',
    venues: ['1号场地', '2号场地', '3号场地']
  })
  assert.equal(buildPublicationSettingsText(settings), '比赛周期：2026-09-26—2026-10-31　·　比赛日：周六、周日')
})

test('缺少起止日期或比赛日时不输出半截文案', () => {
  assert.equal(buildPublicationSettings({ startDate: '2026-09-26', matchDays: ['周六'] }).period, '')
  assert.equal(buildPublicationSettings({ endDate: '2026-10-31', matchDays: ['周六'] }).period, '')
  assert.equal(buildPublicationSettingsText(buildPublicationSettings({ startDate: '2026-09-26', endDate: '2026-10-31' })), '比赛周期：2026-09-26—2026-10-31')
  assert.equal(buildPublicationSettingsText(buildPublicationSettings({ matchDays: ['周六'] })), '比赛日：周六')
  assert.equal(buildPublicationSettingsText(buildPublicationSettings({})), '')
  assert.equal(buildPublicationSettingsText(buildPublicationSettings({ matchDays: [] })), '')
  assert.equal(buildPublicationSettingsText(buildPublicationSettings({ matchDays: '周六' })), '')
  assert.equal(buildPublicationSettingsText(null), '')
})

test('没有赛程设置时不抛错并保持空口径', () => {
  assert.deepEqual(buildPublicationSettings(null), { period: '', matchDays: '', venues: [] })
  assert.deepEqual(buildPublicationSettings(undefined).venues, [])
  assert.deepEqual(buildPublicationSettings({ venueResources: null, venues: null }).venues, [])
  assert.equal(normalizePublicationVenues(undefined).length, 0)
  assert.equal(summarizePublicationVenues(undefined, undefined), '场地待定')
})

test('赛程设置只保存场地、未保存赛期时，文件里只带场地不带赛期', () => {
  const settings = buildPublicationSettings({ venueResources: [{ name: '1号场地' }] })
  assert.equal(summarizePublicationVenues([], settings.venues), '1号场地')
  assert.equal(buildPublicationSettingsText(settings), '')
})

test('未排场次的“待定”不属于本口径，文件行仍由比赛数据决定', () => {
  // 本模块只负责表头与状态卡；行内日期/时间/场地必须来自真实比赛，缺值由调用方显示“待定”。
  const rows = [{ matchDate: '', matchTime: '', venue: '' }, { matchDate: '2026-10-01', matchTime: '09:00', venue: '1号场地' }]
  const rendered = rows.map(row => ({ date: row.matchDate || '待定', time: row.matchTime || '待定', venue: row.venue || '待定' }))
  assert.deepEqual(rendered[0], { date: '待定', time: '待定', venue: '待定' })
  assert.deepEqual(rendered[1], { date: '2026-10-01', time: '09:00', venue: '1号场地' })
})

console.log(`竞赛文件场地与赛期口径：${passed}/${passed} PASS`)
