// 服务号模板消息字段适配（2026-11-02）
// 每个模板一张独立映射表，换模板 / 加模板只改 TEMPLATE_DEFS，业务代码只传语义值，不出现 thing*/time* 字段名。
//
// 模板 A 编制 58013「约球成功通知」（类目：体育场馆服务）
//   约球名称 thing1 / 约球时间 time2 / 约球地址 thing3 / 组织者 thing4 / 参与人 thing5
//   场景：发起约球、对方接战或拒战、人工成局、开赛前提醒
// 模板 B 编制 58014「约球已取消通知」
//   约球名称 thing1 / 约球时间 time2 / 约球地址 thing3 / 组织者 thing4 / 报名人 thing6
//   场景：取消、流局（B 没有「取消原因」位，原因并入 thing1）
// 两个模板都没有 first / keyword* / remark 位，跳转文案固定为「点击查看详情」，跳转地址走 message.url。

// thing 类字段微信限制 20 字，超出按字符语义截断并补省略号
const THING_MAX = 20
const ELLIPSIS = '…'

const TEMPLATE_DEFS = {
  // A：成功 / 战书类
  success: {
    key: 'success',
    title: '约球成功通知',
    number: 58013,
    fieldMap: { name: 'thing1', time: 'time2', venue: 'thing3', organizer: 'thing4', participant: 'thing5' },
    participantFallback: '球队球员',
    envKeys: ['SXF_INVITE_TEMPLATE_ID', 'SXF_SIGNIN_TEMPLATE_ID']
  },
  // B：取消 / 流局类
  cancel: {
    key: 'cancel',
    title: '约球已取消通知',
    number: 58014,
    fieldMap: { name: 'thing1', time: 'time2', venue: 'thing3', organizer: 'thing4', participant: 'thing6' },
    participantFallback: '队员',
    envKeys: ['SXF_CANCEL_TEMPLATE_ID'],
    // B 未配置模板 ID 时按语义回落到 A，但字段映射也一起切回 A（thing6 不得发给 A 模板）
    fallbackKey: 'success'
  }
}

// 兼容旧调用：success 模板的字段键
const TEMPLATE_FIELD_KEYS = TEMPLATE_DEFS.success.fieldMap

function text(value) { return value == null ? '' : String(value).trim() }

// 按“字符”（而非 UTF-16 码元）计数，避免 emoji / 生僻字被切成半个
function toChars(value) {
  return Array.from(text(value).replace(/\s+/g, ' ').trim())
}

function clipThing(value, max) {
  const limit = Number(max) > 0 ? Number(max) : THING_MAX
  const chars = toChars(value)
  if (!chars.length) return ''
  if (chars.length <= limit) return chars.join('')
  if (limit <= 1) return ELLIPSIS
  return chars.slice(0, limit - 1).join('') + ELLIPSIS
}

function templateDef(key) {
  return TEMPLATE_DEFS[text(key)] || null
}

function templateKeys() {
  return Object.keys(TEMPLATE_DEFS)
}

function pad2(value) {
  const n = Number(value)
  return String(n < 10 ? '0' + n : n)
}

// 日期：兼容 2026-11-08 / 2026/11/8 / 2026年11月8日
function parseDateParts(value) {
  const raw = text(value)
  if (!raw) return null
  const matched = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { year, month, day }
}

function parseClock(value) {
  const matched = text(value).match(/(\d{1,2})\s*[:：]\s*(\d{2})/)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

// 时间：兼容 18:00 与 18:00-19:30 / 18:00~19:30 / 18:00～19:30 / 18:00至19:30
function parseTimeParts(value) {
  const raw = text(value)
  if (!raw) return null
  const start = parseClock(raw)
  if (!start) return null
  let end = null
  if (/\d\s*(?:-|~|～|—|–|至|到)\s*\d/.test(raw)) {
    const tail = raw.replace(/^\s*\d{1,2}\s*[:：]\s*\d{2}/, '')
    end = parseClock(tail)
  }
  return { start, end }
}

// 约球时间：优先 matchDate（YYYY-MM-DD）+ matchTime（HH:mm 或区间）
// 规则：
//   1) 只有开始时间 → YYYY-MM-DD HH:mm
//   2) 有结束时间且晚于开始 → YYYY-MM-DD HH:mm~HH:mm（includeEnd 可关闭）
//   3) 日期或开始时间任一无法解析 → { ok:false }，调用方按“跳过发送”处理，绝不往 time2 塞脏数据
function formatInviteTime(matchDate, matchTime, options) {
  const opts = Object.assign({ includeEnd: true }, options || {})
  let date = parseDateParts(matchDate)
  const time = parseTimeParts(matchTime)
  if (!date && time) date = parseDateParts(matchTime)
  if (!date || !time) return { ok: false, value: '', reason: !date ? 'invalid_date' : 'invalid_time' }

  const head = date.year + '-' + pad2(date.month) + '-' + pad2(date.day) + ' ' + pad2(time.start.hour) + ':' + pad2(time.start.minute)
  if (!opts.includeEnd || !time.end) return { ok: true, value: head }

  const startMinutes = time.start.hour * 60 + time.start.minute
  const endMinutes = time.end.hour * 60 + time.end.minute
  if (endMinutes <= startMinutes) return { ok: true, value: head }
  return { ok: true, value: head + '~' + pad2(time.end.hour) + ':' + pad2(time.end.minute) }
}

// 统一按指定模板构造 data
// name：状态语义（发起约球 / 已接战 / 已成局 / 已取消 / 已流局 / 开赛提醒，必要时带原因）
// time：formatInviteTime 产出的合法时间串
// venue：场地，空则「待确认」
// organizer：发起球队名，空则「我方」
// participant：接收人姓名（A→参与人 / B→报名人），空则用模板各自的兜底文案
function buildDataForTemplate(templateKey, input) {
  const def = templateDef(templateKey) || TEMPLATE_DEFS.success
  const map = def.fieldMap
  const source = input || {}
  const data = {}
  data[map.name] = { value: clipThing(source.name) || clipThing('约球通知') }
  data[map.time] = { value: text(source.time) }
  data[map.venue] = { value: clipThing(source.venue) || clipThing('待确认') }
  data[map.organizer] = { value: clipThing(source.organizer) || clipThing('我方') }
  data[map.participant] = { value: clipThing(source.participant) || clipThing(def.participantFallback) }
  return data
}

// 兼容旧调用名：默认走 A（成功通知）
function buildInviteTemplateData(input) {
  return buildDataForTemplate('success', input)
}

module.exports = {
  TEMPLATE_DEFS,
  TEMPLATE_FIELD_KEYS,
  THING_MAX,
  ELLIPSIS,
  templateDef,
  templateKeys,
  clipThing,
  formatInviteTime,
  buildDataForTemplate,
  buildInviteTemplateData,
  parseDateParts,
  parseTimeParts
}
