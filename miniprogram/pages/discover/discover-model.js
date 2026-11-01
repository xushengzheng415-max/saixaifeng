// pages/discover/discover-model.js
// 发现一级页数据适配层（动态／赛事／约球）
// 约束：
// 1. 只把现有服务字段整形为一级列表展示模型，不发起网络请求，不重算竞技统计；
// 2. 缺失值显示“待定／未记录”，不补成 0，不伪造未接入接口的返回；
// 3. 时间统一按 Asia/Shanghai（UTC+8）展示，避免设备时区造成日期错位；
// 4. 所有标签、按钮状态、筛选标记在这里预计算，WXML 只做简单插值。

var FALLBACK_COVER = '/images/runtime/team-data-emerald-stadium-v1.jpg'
var FALLBACK_LOGO = '/images/logo.png'

var TAB_DEFS = [
  { id: 'feed', text: '动态' },
  { id: 'events', text: '赛事' },
  { id: 'invites', text: '约球' },
  // 转会模块独立在发现根目录（2026-10-26 确认），不作为赛事的子页面或赛事卡入口
  { id: 'transfer', text: '转会' }
]

var FEED_FILTER_DEFS = [
  { id: 'all', text: '全部' },
  { id: 'city', text: '同城' },
  { id: 'follow', text: '关注' }
]

// 赛事栏筛选按赛事类别：成人／青少年。校园等其它类别只出现在“全部”，不塞进成人
var EVENT_FILTER_DEFS = [
  { id: 'all', text: '全部' },
  { id: 'adult', text: '成人' },
  { id: 'youth', text: '青少年' }
]

var STATUS_CLASS = {
  live: 'event-status-live',
  signup: 'event-status-signup',
  done: 'event-status-done',
  wait: 'event-status-wait'
}

// 赛事类别标签：category 为当前字段，旧数据可能只有 type
var CATEGORY_LABELS = {
  youth: '青少年赛事',
  adult: '成人赛事',
  campus: '校园赛事',
  amateur: '业余赛事',
  local: '地协赛',
  city: '城市联赛',
  professional: '职业联赛'
}

// 旧 type 里 amateur/local/city/professional 均属成人赛事场景，归入“成人”筛选；校园不归入成人
var ADULT_CATEGORY_KEYS = ['adult', 'amateur', 'local', 'city', 'professional']

var FORMAT_LABELS = {
  tournament: '赛会制',
  cup: '杯赛',
  league: '联赛',
  combined: '混合制',
  hybrid: '混合制'
}

var PUBLIC_STATUS_LABELS = {
  registering: '报名中',
  signup: '报名中',
  registration: '报名中',
  published: '已发布',
  upcoming: '即将开始',
  ongoing: '进行中',
  live: '进行中',
  ended: '已结束',
  completed: '已结束',
  finished: '已结束',
  archived: '已结束',
  cancelled: '已取消',
  canceled: '已取消'
}

var INVITE_STATUS_CLASS = {
  open: 'invite-status-open',
  full: 'invite-status-full',
  closed: 'invite-status-closed',
  cancelled: 'invite-status-cancelled',
  wait: 'invite-status-wait'
}

var INVITE_STATUS_TEXT = {
  open: '报名中',
  full: '已满',
  closed: '已截止',
  cancelled: '已取消',
  wait: '状态待确认'
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function pad2(value) {
  var str = String(value)
  return str.length < 2 ? '0' + str : str
}

// 比分只接受有效非负数字，其余保持“未记录”
function scoreValue(value) {
  if (value === null || value === undefined || value === '') return null
  var num = Number(value)
  if (!isFinite(num) || num < 0) return null
  return Math.round(num)
}

function shanghaiParts(value) {
  if (!value) return null
  var date = value instanceof Date ? value : new Date(value)
  if (!date || isNaN(date.getTime())) return null
  var shifted = new Date(date.getTime() + 8 * 3600 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  }
}

function timeText(value) {
  var parts = shanghaiParts(value)
  if (!parts) return ''
  return parts.month + '月' + parts.day + '日 ' + pad2(parts.hour) + ':' + pad2(parts.minute)
}

function buildTabs(activeId) {
  return TAB_DEFS.map(function (def) {
    var active = def.id === activeId
    return {
      id: def.id,
      text: def.text,
      itemClass: active ? 'tab-item-active' : '',
      textClass: active ? 'tab-text-active' : '',
      lineClass: active ? 'tab-line-active' : ''
    }
  })
}

function buildChips(defs, activeId) {
  return (defs || []).map(function (def) {
    var active = def.id === activeId
    return {
      id: def.id,
      text: def.text,
      itemClass: active ? 'chip-active' : ''
    }
  })
}

function pickTeam(context) {
  var teams = (context && context.teams) || []
  var current = (context && context.currentWorkspace) || {}
  var currentId = text(current.teamId || current.id)
  var matched = null
  var i
  for (i = 0; i < teams.length; i += 1) {
    if (text(teams[i].id || teams[i]._id) === currentId) {
      matched = teams[i]
      break
    }
  }
  if (!matched && teams.length) matched = teams[0]
  if (!matched && text(current.teamId) && text(current.type) === 'team') {
    matched = { id: text(current.teamId), name: text(current.name) }
  }
  return matched || null
}

// 战报：字段来自 friendly_matches 本人记录，不是公开动态流
function formatReport(row) {
  row = row || {}
  var homeScore = scoreValue(row.homeScore)
  var awayScore = scoreValue(row.awayScore)
  var isHome = row.isHome !== false
  var myScore = isHome ? homeScore : awayScore
  var otherScore = isHome ? awayScore : homeScore
  var hasScore = myScore !== null && otherScore !== null
  var resultText = ''
  var resultClass = ''
  if (hasScore) {
    if (myScore > otherScore) {
      resultText = '胜'
      resultClass = 'result-win'
    } else if (myScore === otherScore) {
      resultText = '平'
      resultClass = 'result-draw'
    } else {
      resultText = '负'
      resultClass = 'result-lose'
    }
  }
  var scorers = Array.isArray(row.scorers) ? row.scorers : []
  var names = []
  var i
  for (i = 0; i < scorers.length && names.length < 3; i += 1) {
    var scorerName = text(scorers[i] && scorers[i].name)
    if (scorerName) names.push(scorerName)
  }
  var scorerText = names.length ? names.join('、') + ' 进球' : ''
  var duration = Number(row.durationMinutes)
  var natureText = row.isOfficial === true ? '已计入正式战绩' : '友谊赛'
  var metaParts = [natureText]
  if (isFinite(duration) && duration > 0) metaParts.push(duration + ' 分钟')
  var teamName = text(row.teamName) || '本队'
  var opponentName = text(row.opponentName) || '对手'
  var id = text(row._id || row.id)
  return {
    key: 'report-' + id,
    id: id,
    type: 'report',
    typeText: '战报',
    publisherName: teamName,
    publisherLogo: text(row.teamLogo) || FALLBACK_LOGO,
    timeText: timeText(row.endedAt || row.createTime) || '时间待补录',
    sourceText: '本人记录',
    metaText: metaParts.join(' · '),
    titleText: teamName + ' vs ' + opponentName,
    scoreText: hasScore ? myScore + ' : ' + otherScore : '比分未记录',
    hasScore: hasScore,
    hasResult: Boolean(resultText),
    resultText: resultText,
    resultClass: resultClass,
    hasScorer: Boolean(scorerText),
    scorerText: scorerText,
    canView: Boolean(id),
    canPromote: row.isOfficial !== true,
    canDelete: Boolean(id)
  }
}

// 赛事状态只在 JS 里判定，WXML 不做比较
// published 只表示“已公开”，不等同报名中；报名状态必须看 registering
function statusKind(item) {
  var status = text(item && item.status).toLowerCase()
  var label = text(item && item.statusText)
  if (['ongoing', 'in_progress', 'playing', 'live'].indexOf(status) >= 0 || label === '进行中') return 'live'
  if (['registering', 'signup', 'registration', 'registration_open'].indexOf(status) >= 0 || label === '报名中') return 'signup'
  if (['finished', 'completed', 'ended', 'archived', 'cancelled', 'canceled'].indexOf(status) >= 0 || label === '已结束' || label === '已取消') return 'done'
  return 'wait'
}

function formatEvent(event, entry, workspaceName) {
  event = event || {}
  entry = entry || {}
  var id = text(event.id || event._id || entry.id)
  var metaLines = Array.isArray(entry.metaLines) ? entry.metaLines : []
  var relation = text(event.relation)
  var isHosted = event.isHosted === true || relation === 'hosted' || relation === 'both'
  var isParticipating = event.isParticipating === true || relation === 'participating'
  var kind = statusKind(event)
  var metaParts = []
  var modeText = text(event.modeText)
  var dateText = text(event.dateText) || text(metaLines[0])
  var regionText = text(metaLines[1])
  // 卡片信息行按参考图合并为“类别/赛制 · 区域 · 日期”，缺失项直接省略，不补 0、不补造场地
  if (modeText) metaParts.push(modeText)
  if (regionText) metaParts.push(regionText)
  if (dateText) metaParts.push(dateText)
  // 主办方只用服务端已有字段；当前接口未返回主办方名称时不编造，只对本人主办的赛事显示当前工作空间名
  var hostName = text(event.hostName || event.organizerName) || (isHosted ? workspaceName : '')
  return {
    key: 'event-' + id,
    id: id,
    name: text(event.name || event.tournamentName || entry.name) || '未命名赛事',
    cover: text(entry.coverUrl || event.coverUrl) || FALLBACK_COVER,
    hasBadge: Boolean(isHosted || isParticipating),
    badgeText: isHosted ? '我主办的' : (isParticipating ? '我参与的' : ''),
    statusKind: kind,
    statusClass: STATUS_CLASS[kind] || STATUS_CLASS.wait,
    statusText: text(event.statusText || entry.statusText) || '状态待确认',
    metaText: metaParts.length ? metaParts.join(' · ') : '类别、区域与日期待定',
    regionText: regionText || '区域待定',
    hasHost: Boolean(hostName),
    hostText: hostName ? '主办方 · ' + hostName : '',
    // 赛事卡只连赛事中心（2026-10-26 调整）：转会模块独立放在发现根目录，不嵌套在赛事卡内
    centerPath: '/pages/public-tournament-center/index?hash=event-' + encodeURIComponent(id),
    canOpenCenter: Boolean(id),
    isSignup: kind === 'signup',
    isLive: kind === 'live',
    isDone: kind === 'done'
  }
}

// 日期只取服务端已有值，格式化为“M月D日”；跨年时补年份，缺值返回空串
function dateLabel(value) {
  var match = text(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return ''
  return Number(match[2]) + '月' + Number(match[3]) + '日'
}

function dateRangeText(start, end) {
  var startMatch = text(start).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  var endMatch = text(end).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  var startText = dateLabel(start)
  var endText = dateLabel(end)
  if (!startText && !endText) return ''
  if (!endText) return startText + ' 起'
  if (!startText) return endText + ' 止'
  if (startText === endText) return startText
  if (startMatch[1] !== endMatch[1]) return startMatch[1] + '年' + startText + ' — ' + endMatch[1] + '年' + endText
  return startText + ' — ' + endText
}

function clockLabel(value) {
  var match = text(value).match(/[ T](\d{1,2}):(\d{2})/)
  if (!match) return ''
  return pad2(Number(match[1])) + ':' + pad2(Number(match[2]))
}

function deadlineText(value) {
  var raw = text(value)
  if (!raw) return ''
  var day = dateLabel(raw)
  var clock = clockLabel(raw)
  if (!day && !clock) return '时间待确认'
  if (!clock) return day
  return (day ? day + ' ' : '') + clock
}

// 截止时间按 Asia/Shanghai 解析，避免设备时区不同导致“已截止”判断错位
function shanghaiEpoch(value) {
  var match = text(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (!match) return null
  var stamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0) - 8,
    Number(match[5] || 0)
  )
  return isFinite(stamp) ? stamp : null
}

// 成人／青少年筛选分组：兼容旧 type，校园等其它类别只进“全部”
function categoryGroup(value) {
  var key = text(value).toLowerCase()
  if (!key) return ''
  if (key === 'youth') return 'youth'
  if (key === 'campus') return 'campus'
  if (ADULT_CATEGORY_KEYS.indexOf(key) >= 0) return 'adult'
  return ''
}

// 公开赛事目录（getTournamentList）：只整形已返回字段，不补造主办方、场地或倒计时
function formatPublicEvent(row) {
  row = row || {}
  var id = text(row._id || row.id)
  var categoryRaw = text(row.category || row.type).toLowerCase()
  var group = categoryGroup(categoryRaw)
  var categoryLabel = CATEGORY_LABELS[categoryRaw] || ''
  var kind = statusKind(row)
  var formatRaw = text(row.matchFormat).toLowerCase()
  var modeText = FORMAT_LABELS[formatRaw] || text(row.matchFormat)
  var regionText = text(row.city || row.region || row.location)
  var rangeText = dateRangeText(row.startDate, row.endDate)
  var metaParts = []
  if (modeText) metaParts.push(modeText)
  if (regionText) metaParts.push(regionText)
  if (rangeText) metaParts.push(rangeText)
  var hostName = text(row.organizerName)
  var statusText = PUBLIC_STATUS_LABELS[text(row.status).toLowerCase()] || '状态待确认'
  return {
    key: 'event-' + id,
    id: id,
    name: text(row.name) || '未命名赛事',
    cover: text(row.coverImage || row.coverUrl || row.bannerUrl) || FALLBACK_COVER,
    categoryKey: group || 'other',
    hasBadge: Boolean(categoryLabel),
    badgeText: categoryLabel,
    statusKind: kind,
    statusClass: STATUS_CLASS[kind] || STATUS_CLASS.wait,
    statusText: statusText,
    metaText: metaParts.length ? metaParts.join(' · ') : '类别、区域与日期待定',
    regionText: regionText || '区域待定',
    hasHost: Boolean(hostName),
    hostText: hostName ? '主办方 · ' + hostName : '',
    // 赛事卡只连赛事中心（2026-10-26 调整）：转会模块独立放在发现根目录，不嵌套在赛事卡内
    centerPath: '/pages/public-tournament-center/index?hash=event-' + encodeURIComponent(id),
    canOpenCenter: Boolean(id),
    isSignup: kind === 'signup',
    isLive: kind === 'live',
    isDone: kind === 'done'
  }
}

// 报名／签到／应战计数口径（2026-11-01 用户确认）：
// - 有效报名只认服务端 signupCount；历史邀约没有 signupSchema，signupCount 为 null，
//   必须显示“报名数据待确认”，不能拿旧 signedInCount 冒充报名人数，也不回填虚构历史。
// - 签到数 presentCount 与报名数分开；旧 signedInCount 只作历史说明。
function inviteSignupSummary(row) {
  row = row || {}
  var hasSignupData = row.hasSignupData === true
  var count = scoreValue(row.signupCount)
  var max = scoreValue(row.maxPlayers)
  var present = scoreValue(row.presentCount)
  var legacySignedIn = scoreValue(row.signedInCount)
  var signupText = '报名数据待确认'
  if (hasSignupData && count !== null) {
    signupText = max !== null && max > 0
      ? count + ' / ' + max + ' 人已报名'
      : count + ' 人已报名 · 未设限额'
  }
  var presentText = ''
  if (hasSignupData && present !== null && present > 0) presentText = '已签到 ' + present + ' 人'
  else if (!hasSignupData && legacySignedIn !== null && legacySignedIn > 0) presentText = '历史签到 ' + legacySignedIn + ' 人'
  return {
    hasSignupData: hasSignupData && count !== null,
    signupText: signupText,
    presentText: presentText,
    hasPresent: Boolean(presentText)
  }
}

// 状态由服务端 signupWindow 决定；缺省时按旧字段兜底，但不再用 signedInCount 判断满员
function inviteStatusKind(row) {
  row = row || {}
  var window = row.signupWindow || {}
  var windowKind = text(window.kind).toLowerCase()
  if (windowKind === 'cancelled') return 'cancelled'
  if (windowKind === 'deadline' || windowKind === 'closed') return 'closed'
  if (windowKind === 'full') return 'full'
  if (windowKind === 'open') return 'open'

  var rawStatus = text(row.status).toLowerCase()
  if (rawStatus === 'cancelled' || rawStatus === 'canceled') return 'cancelled'
  if (rawStatus && rawStatus !== 'open') return 'closed'
  if (row.hasSignupData === true) {
    var count = scoreValue(row.signupCount)
    var max = scoreValue(row.maxPlayers)
    if (count !== null && max !== null && max > 0 && count >= max) return 'full'
  }
  var deadlineEpoch = shanghaiEpoch(row.deadline)
  if (deadlineEpoch !== null && deadlineEpoch < Date.now()) return 'closed'
  return 'open'
}

// 本队约球邀约列表：只整形服务端已脱敏字段；状态与计数口径由服务端给出
function formatInvite(row) {
  row = row || {}
  var id = text(row.inviteId || row._id)
  var kind = inviteStatusKind(row)
  var summary = inviteSignupSummary(row)
  var dayText = dateLabel(row.matchDate)
  var timeTextValue = text(row.matchTime)
  var titleText = dayText ? (timeTextValue ? dayText + ' ' + timeTextValue : dayText) : '时间待协商'
  var venue = text(row.venue)
  var address = text(row.venueAddress)
  var deadlineValue = text(row.deadline)
  var createdText = timeText(row.createdAt)
  var battleCry = text(row.battleCryText)
  var accepted = scoreValue(row.acceptedCount) || 0
  return {
    key: 'invite-' + id,
    id: id,
    titleText: titleText,
    statusKind: kind,
    statusClass: INVITE_STATUS_CLASS[kind] || INVITE_STATUS_CLASS.wait,
    statusText: INVITE_STATUS_TEXT[kind] || '状态待确认',
    venueText: venue || '场地待协商',
    hasAddress: Boolean(address),
    addressText: address,
    signupText: summary.signupText,
    hasSignupData: summary.hasSignupData,
    presentText: summary.presentText,
    hasPresent: summary.hasPresent,
    deadlineText: deadlineValue ? '截止 ' + deadlineText(deadlineValue) : '未设截止时间',
    hasBattleCry: Boolean(battleCry),
    battleCryText: battleCry,
    // 跨队应战（公开约球）计数：发起方据此判断是否有人应战，具体队伍在详情里看
    hasResponse: accepted > 0,
    responseText: accepted > 0 ? '已收到 ' + accepted + ' 支球队应战' : '还没有球队应战',
    createdText: createdText ? '发起于 ' + createdText : '发起时间待记录'
  }
}

// 跨队公开约球卡片（listPublicInvites）：只整形服务端已脱敏字段。
// 不展示详细地址、联系方式与签到凭证；本队发起的邀约不给“应战”按钮。
function formatPublicInvite(row, myTeamId, respondState) {
  row = row || {}
  var id = text(row.inviteId || row._id)
  var teamId = text(row.teamId)
  var myId = text(myTeamId)
  var summary = inviteSignupSummary(row)
  var kind = inviteStatusKind(row)
  var dayText = dateLabel(row.matchDate)
  var timeTextValue = text(row.matchTime)
  var titleText = dayText ? (timeTextValue ? dayText + ' ' + timeTextValue : dayText) : '时间待协商'
  var deadlineValue = text(row.deadline)
  var battleCry = text(row.battleCryText)
  var isMine = Boolean(myId) && teamId === myId
  var responded = Boolean(respondState && respondState.responded)
  var closed = kind === 'closed' || kind === 'cancelled'
  return {
    key: 'public-' + id,
    id: id,
    teamId: teamId,
    teamName: text(row.teamName) || '发起球队待核验',
    teamLogo: text(row.teamLogo) || FALLBACK_LOGO,
    isMine: isMine,
    hasBadge: Boolean(isMine),
    badgeText: isMine ? '本队发起' : '',
    cityText: text(row.teamCity) || '城市待登记',
    titleText: titleText,
    venueText: text(row.venue) || '场地待协商',
    signupText: summary.signupText,
    hasSignupData: summary.hasSignupData,
    presentText: summary.presentText,
    hasPresent: summary.hasPresent,
    statusKind: kind,
    statusClass: INVITE_STATUS_CLASS[kind] || INVITE_STATUS_CLASS.wait,
    statusText: INVITE_STATUS_TEXT[kind] || '状态待确认',
    deadlineText: deadlineValue ? '截止 ' + deadlineText(deadlineValue) : '未设截止时间',
    hasBattleCry: Boolean(battleCry),
    battleCryText: battleCry,
    canRespond: Boolean(id) && !isMine && !responded && !closed,
    actionText: isMine ? '本队发起' : (responded ? '已提交应战' : (closed ? '已结束报名' : '代表本队应战')),
    respondClass: (isMine || responded || closed) ? 'public-action public-action-done' : 'public-action',
    responded: responded
  }
}

// ===== 转会公开市场（发现页「转会」分栏，2026-10-27 原型落地） =====
// 数据来自 dataCenter.transferShowcase：转会焦点、身价榜、上升最快、球员身价、最新转会。
// 金额、涨幅与走势数值全部由服务端统一口径给出，这里只整形展示，不重算、不补造；
// 成交金额按成人／青少年分级（2026-10-27 用户确认）：服务端只回展示文案 priceText 与状态 priceState，
// 页面不接收、不遮挡任何完整金额，也不在端上重新判断年龄或公开范围。

var SHOWCASE_POSITION_DEFS = [
  { key: 'all', text: '全部' },
  { key: 'GK', text: '门将' },
  { key: 'DF', text: '后卫' },
  { key: 'MF', text: '中场' },
  { key: 'FW', text: '前锋' }
]

// 上海时区的日键，用于“今日／昨日／M月D日”
function showcaseDayKey(value) {
  var parts = shanghaiParts(value)
  if (!parts) return ''
  return parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day)
}

function showcaseDay(value) {
  var parts = shanghaiParts(value)
  if (!parts) return ''
  var key = showcaseDayKey(value)
  if (key && key === showcaseDayKey(new Date())) return '今日'
  if (key && key === showcaseDayKey(new Date(Date.now() - 86400000))) return '昨日'
  return parts.month + '月' + parts.day + '日'
}

function showcaseMonthDay(value) {
  var parts = shanghaiParts(value)
  if (!parts) return dateLabel(value)
  return parts.month + '月' + parts.day + '日'
}

// 没有授权形象照时用姓名首字头像，不用生成稿或默认人像冒充球员
function showcaseInitial(value) {
  var name = text(value)
  return name ? name.slice(0, 1) : '球'
}

function showcaseRankText(rank) {
  var value = Number(rank) || 0
  return value > 0 && value < 10 ? '0' + value : String(value)
}

// 走势柱：只用真实快照货币身价，少于两个点不画，高度按区间归一，不补造平滑曲线
function showcaseTrendBars(trend) {
  var values = []
  for (var i = 0; i < (trend || []).length; i += 1) {
    var value = Number(trend[i])
    if (isFinite(value) && value > 0) values.push(value)
  }
  if (values.length < 2) return []
  var min = values[0]
  var max = values[0]
  for (var j = 1; j < values.length; j += 1) {
    if (values[j] < min) min = values[j]
    if (values[j] > max) max = values[j]
  }
  var bars = []
  for (var k = 0; k < values.length; k += 1) {
    var ratio = max === min ? 0.5 : (values[k] - min) / (max - min)
    var height = 14 + Math.round(ratio * 26)
    bars.push({
      key: 'trend-' + k,
      heightText: height + 'rpx',
      barClass: k === values.length - 1 ? 'trend-bar trend-bar-last' : 'trend-bar'
    })
  }
  return bars
}

function showcaseMeta(position, team) {
  if (position && team) return position + ' · ' + team
  if (position) return position
  if (team) return team
  return '位置与球队待记录'
}

function showcaseRankRow(row, index, mode) {
  row = row || {}
  var name = text(row.playerName) || '球员待核验'
  var detail = []
  if (mode === 'rising') {
    if (text(row.deltaText)) detail.push('较上次 ' + text(row.deltaText))
    if (text(row.percentText)) detail.push('涨幅 ' + text(row.percentText))
    if (text(row.previousMoneyText)) detail.push('上一次 ' + text(row.previousMoneyText))
  }
  if (text(row.moneyText)) detail.push('当前身价 ' + text(row.moneyText))
  if (text(row.tierText)) detail.push('评估指数 ' + text(row.tierText))
  if (text(row.computedAt)) detail.push('更新于 ' + showcaseMonthDay(row.computedAt))
  var rank = Number(row.rank) || index + 1
  var percent = text(row.percentText)
  return {
    key: (mode === 'rising' ? 'rise-' : 'top-') + text(row.playerId) + '-' + index,
    rankText: showcaseRankText(rank),
    rankClass: rank === 1 ? 'rank-no rank-no-top' : 'rank-no',
    playerName: name,
    initialText: showcaseInitial(name),
    photoUrl: text(row.photoUrl),
    hasPhoto: Boolean(text(row.photoUrl)),
    metaText: showcaseMeta(text(row.positionText), text(row.teamName)),
    moneyText: text(row.moneyText) || '待评估',
    riseText: mode === 'rising' && percent ? '↑' + percent.replace('+', '') : '',
    detailText: detail.join('\n')
  }
}

function showcasePlayerRow(row, index) {
  row = row || {}
  var name = text(row.playerName) || '球员待核验'
  var bars = showcaseTrendBars(row.trend)
  var hasTrend = bars.length > 1
  // 身价状态由服务端给出：measured＝已测算公开，hidden＝青少年不公开，not_measured＝未测算
  var state = text(row.moneyState) || (text(row.moneyText) ? 'measured' : 'not_measured')
  if (state !== 'measured' && state !== 'hidden') state = 'not_measured'
  var moneyText = state === 'measured'
    ? (text(row.moneyText) || '待评估')
    : (state === 'hidden' ? '身价不公开' : '身价未测算')
  var detail = ['参考身价 ' + moneyText]
  if (state === 'measured' && text(row.computedAt)) detail.push('更新于 ' + showcaseMonthDay(row.computedAt))
  if (state === 'hidden') detail.push('该球员身价暂不公开')
  if (state === 'not_measured') detail.push('该球员暂无身价快照，平台测算后在此展示')
  // 走势只在有连续两次以上测算时展示；未测算与不公开不重复说“没有快照”，避免文案自相矛盾
  if (hasTrend) detail.push('近 ' + bars.length + ' 次测算')
  else if (state === 'measured') detail.push('暂无连续两次以上测算，走势不展示')
  else if (state === 'hidden') detail.push('身价不公开，不展示走势')
  return {
    key: 'player-' + text(row.playerId) + '-' + index,
    playerId: text(row.playerId),
    playerName: name,
    initialText: showcaseInitial(name),
    photoUrl: text(row.photoUrl),
    hasPhoto: Boolean(text(row.photoUrl)),
    metaText: showcaseMeta(text(row.positionText), text(row.teamName)),
    moneyText: moneyText,
    moneyClass: state === 'measured' ? 'player-money' : 'player-money player-money-muted',
    measured: state === 'measured',
    trendBars: bars,
    hasTrend: hasTrend,
    trendText: hasTrend ? '近 ' + bars.length + ' 次测算' : (state === 'measured' ? '走势样本不足' : '暂无走势'),
    actionText: '查看资料',
    detailText: detail.join('\n')
  }
}

// 成交金额文案与配色状态都来自服务端：public 为成人已公开，其余为不公开／待核实／未记录／无转会费
function showcasePriceTextClass(state) {
  return text(state) === 'public' ? 'spotlight-price-text spotlight-price-open' : 'spotlight-price-text spotlight-price-muted'
}

function showcaseTradePriceClass(state) {
  return text(state) === 'public' ? 'trade-price trade-price-open' : 'trade-price trade-price-muted'
}

// 范围筛选条：赛事／年龄段；时间范围尚未接入，不再摆放只能弹说明的无效入口
function showcaseScopeChips(scope) {
  scope = scope || {}
  var defs = [
    { key: 'event', text: text(scope.eventText) || '全部赛事', active: Boolean(text(scope.tournamentId)) },
    { key: 'age', text: text(scope.ageText) || '全部年龄段', active: Boolean(text(scope.ageGroupId)) }
  ]
  var chips = []
  for (var i = 0; i < defs.length; i += 1) {
    chips.push({
      key: defs[i].key,
      text: defs[i].text,
      caret: '▾',
      chipClass: defs[i].active ? 'scope-chip scope-chip-active' : 'scope-chip'
    })
  }
  return chips
}

// 范围选择面板的选项：key 用于 wx:key，value 为回传给接口的真实 id（空串表示全部）
function showcaseScopeOptions(list, selectedValue) {
  var selected = text(selectedValue)
  var options = []
  for (var i = 0; i < (list || []).length; i += 1) {
    var row = list[i] || {}
    var value = text(row.value)
    options.push({
      key: text(row.key) || value || 'all',
      value: value,
      text: text(row.text) || '未命名范围',
      itemClass: value === selected ? 'scope-option scope-option-active' : 'scope-option',
      checkText: value === selected ? '✓' : ''
    })
  }
  return options
}

// 年龄段选项：来自当前赛事名单的竞赛组别（U8/U10…），不是抽签小组
function showcaseAgeGroupOptions(ageGroups, selectedId) {
  var list = [{ key: 'age-all', value: '', text: '全部年龄段' }]
  for (var i = 0; i < (ageGroups || []).length; i += 1) {
    var group = ageGroups[i] || {}
    var id = text(group.id)
    if (!id) continue
    list.push({ key: 'age-' + id, value: id, text: text(group.text) || '未命名组别' })
  }
  return showcaseScopeOptions(list, selectedId)
}

function showcaseTransferRow(row, index) {
  row = row || {}
  var name = text(row.playerName) || '球员待核验'
  var from = text(row.fromTeamName)
  var to = text(row.toTeamName)
  var event = text(row.tournamentName)
  // 成交金额只展示服务端文案：成人已公开时是金额，青少年是“青少年金额不公开”，其余如实标注
  var priceText = text(row.priceText) || '成交价待核实'
  var positionText = text(row.positionText)
  var detail = [
    text(row.typeText) || '转会',
    from && to ? from + ' → ' + to : (to ? '自由球员 → ' + to : '去向待核验'),
    event ? '赛事 ' + event : '赛事待核验',
    '完成 ' + showcaseMonthDay(row.completedAt),
    '成交金额 ' + priceText
  ]
  return {
    key: 'trade-' + index + '-' + text(row.completedAt),
    playerName: name,
    initialText: showcaseInitial(name),
    // metaText 参与搜索（位置或球队），posText 只用于展示位置，缺位置时不占行
    metaText: showcaseMeta(positionText, text(row.teamName)),
    posText: positionText,
    hasPos: Boolean(positionText),
    // 一行展示去向，完整队名只在弹窗详情里展开，列表里不再放队徽与双列队名
    routeText: from ? from + ' → ' + (to || '新球队待核验') : '自由球员 → ' + (to || '新球队待核验'),
    typeText: text(row.typeText) || '转会',
    eventText: event || '赛事待核验',
    // 跨赛事转会显示「赛事A → 赛事B」，列表单列省略，弹窗给全文
    hasCrossEvent: Boolean(row.isCrossEvent),
    crossText: row.isCrossEvent ? '跨赛事' : '',
    dateText: showcaseDay(row.completedAt),
    priceText: priceText,
    priceClass: showcaseTradePriceClass(row.priceState),
    detailText: detail.join('\n')
  }
}

function showcaseFocus(focus) {
  focus = focus || {}
  var name = text(focus.playerName)
  if (!name) return { visible: false }
  var typeText = text(focus.typeText) || '转会'
  var from = text(focus.fromTeamName)
  var to = text(focus.toTeamName)
  var verb = '加盟'
  if (focus.kind === 'free') verb = '自由签约'
  else if (typeText === '租借' || typeText === '整赛季租借' || typeText === '单场租借') verb = '租借加盟'
  else if (typeText === '租借转永久') verb = '租借转永久'
  else if (typeText === '租借续租') verb = '租借续租'
  var event = text(focus.tournamentName)
  var priceText = text(focus.priceText) || '成交价待核实'
  var detail = [
    typeText,
    from ? from + ' → ' + (to || '新球队待核验') : '自由球员 → ' + (to || '新球队待核验'),
    event ? '赛事 ' + event : '赛事待核验',
    '完成 ' + showcaseMonthDay(focus.completedAt),
    '成交金额 ' + priceText
  ]
  return {
    visible: true,
    typeText: typeText,
    titleText: name + verb + (to || '新球队待核验'),
    playerName: name,
    initialText: showcaseInitial(name),
    hasFrom: Boolean(from),
    fromName: from || '自由球员',
    fromInitial: showcaseInitial(from || '自由球员'),
    fromLogo: text(focus.fromTeamLogo),
    hasFromLogo: Boolean(text(focus.fromTeamLogo)),
    toName: to || '新球队待核验',
    toInitial: showcaseInitial(to || '新球队'),
    toLogo: text(focus.toTeamLogo),
    hasToLogo: Boolean(text(focus.toTeamLogo)),
    eventText: event || '赛事待核验',
    hasCrossEvent: Boolean(focus.isCrossEvent),
    crossText: focus.isCrossEvent ? '跨赛事' : '',
    dateText: showcaseDay(focus.completedAt),
    priceText: priceText,
    priceClass: showcasePriceTextClass(focus.priceState),
    detailText: detail.join('\n')
  }
}

// 球员卡片只做位置筛选：赛事/组别需要公开接口给出范围，未接入前不放假按钮
function showcasePositionChips(source, activeKey) {
  var present = {}
  for (var i = 0; i < (source || []).length; i += 1) {
    var bucket = text((source[i] || {}).bucket)
    if (bucket) present[bucket] = true
  }
  var chips = []
  for (var j = 0; j < SHOWCASE_POSITION_DEFS.length; j += 1) {
    var def = SHOWCASE_POSITION_DEFS[j]
    if (def.key !== 'all' && !present[def.key]) continue
    chips.push({
      key: def.key,
      text: def.text,
      chipClass: def.key === (activeKey || 'all') ? 'filter-chip filter-chip-active' : 'filter-chip'
    })
  }
  return chips
}

function filterShowcasePlayers(source, positionKey) {
  var key = text(positionKey) || 'all'
  var out = []
  for (var i = 0; i < (source || []).length; i += 1) {
    var item = source[i] || {}
    if (key !== 'all' && text(item.bucket) !== key) continue
    if (item.view) out.push(item.view)
  }
  return out
}

function formatShowcase(payload) {
  payload = payload || {}
  var topRows = Array.isArray(payload.top) ? payload.top : []
  var risingRows = Array.isArray(payload.rising) ? payload.rising : []
  var playerRows = Array.isArray(payload.players) ? payload.players : []
  var transferRows = Array.isArray(payload.transfers) ? payload.transfers : []

  var topItems = []
  for (var i = 0; i < topRows.length; i += 1) topItems.push(showcaseRankRow(topRows[i], i, 'top'))

  var risingItems = []
  for (var j = 0; j < risingRows.length; j += 1) risingItems.push(showcaseRankRow(risingRows[j], j, 'rising'))

  // 球员卡片保留原始行，供位置筛选复用，不重新请求、不重算身价
  var playerSource = []
  for (var p = 0; p < playerRows.length; p += 1) {
    var playerRow = playerRows[p] || {}
    playerSource.push({ bucket: text(playerRow.positionBucket), view: showcasePlayerRow(playerRow, p) })
  }

  var transferItems = []
  for (var q = 0; q < transferRows.length; q += 1) transferItems.push(showcaseTransferRow(transferRows[q], q))

  // 转会动态：服务端已把最新一条单列为 focus，transfers 只含其余记录，
  // 页面不再把焦点重复塞回列表，同一条转会只出现一次（焦点卡 + 列表）
  var focus = showcaseFocus(payload.focus)
  var dynamicItems = transferItems
  var skipped = scoreValue(payload.skipped)
  var scanLimited = payload.scanLimited || {}
  var notes = []
  if (scanLimited.valuations || scanLimited.transfers) notes.push('数据量较大，榜单只取最近一批记录')
  if (skipped) notes.push('另有 ' + skipped + ' 条球员资料缺失或已删除，未展示')

  var playerLimit = Number(payload.playerLimit) || 0
  var playerTotal = Number(payload.playerTotal) || playerSource.length
  // 发现球员口径：roster＝赛事已审核名单全员（含未测算），rank＝全平台已测算球员
  var playerPool = ['roster', 'public_roster'].indexOf(text(payload.playerPool)) >= 0 ? text(payload.playerPool) : 'rank'
  var playerEndText = ''
  if (playerSource.length) {
    if (playerPool === 'roster' || playerPool === 'public_roster') {
      playerEndText = playerTotal > playerSource.length
        ? '已展示 ' + playerSource.length + ' 位参赛球员，共 ' + playerTotal + ' 位'
        : '已展示全部 ' + playerSource.length + ' 位参赛球员'
    } else {
      playerEndText = playerLimit && playerTotal >= playerLimit
        ? '仅展示身价最高的 ' + playerSource.length + ' 位球员'
        : '已展示全部 ' + playerSource.length + ' 位球员'
    }
  }
  if (playerPool === 'public_roster') playerEndText = playerEndText.replace(/参赛球员/g, '球员')
  var transferCount = Number(payload.transferCount) || 0

  // 范围回显：赛事（含跨赛事）与年龄段；未选赛事时为全平台口径
  var scope = payload.scope || {}
  var scopeMode = text(scope.mode) === 'tournament' ? 'tournament' : 'platform'
  var tournamentId = text(scope.tournamentId)
  var tournamentName = text(scope.tournamentName)
  var ageGroupId = text(scope.ageGroupId)
  var ageGroupText = text(scope.ageGroupText)
  var ageGroups = Array.isArray(payload.ageGroups) ? payload.ageGroups : []
  var rosterState = text(payload.rosterState)
  // 赛事已选但名单缺失时，空态要说清是“没有已审核名单”，不能让人误以为平台没有身价数据
  var rosterMissing = scopeMode === 'tournament' && (rosterState === 'not_recorded' || rosterState === 'none')
  var scopeLabel = scopeMode === 'tournament' ? (tournamentName || '本赛事') : '全平台'
  var scopeFullLabel = ageGroupText ? scopeLabel + ' · ' + ageGroupText : scopeLabel
  var ageGroupOptions = showcaseAgeGroupOptions(ageGroups, ageGroupId)
  var rankScopeNote = scopeMode === 'tournament'
    ? (rosterMissing
      ? '该赛事还没有已审核参赛名单，榜单暂时无法按赛事统计。'
      : '按' + (tournamentName || '本赛事') + '已审核名单统计' + (ageGroupText ? '，当前为' + ageGroupText + '年龄段' : '，可按年龄段细分') + '；名单内未测算身价的球员也会在下方展示。')
    : (playerPool === 'public_roster' ? '球员来自公开赛事已审核名单；已测算球员进入身价榜，未测算球员保留资料展示。' : '当前为全平台口径，只统计已完成身价测算的球员；选择赛事可看到该赛事已审核名单内的全部球员（含未测算）。')
  var scopeNoteText = scopeMode === 'tournament'
    ? '当前范围：' + scopeFullLabel + '；时间范围筛选暂未接入。'
    : '当前为全平台口径；按赛事查看可看到该赛事已审核名单内的全部球员与转会，时间范围筛选暂未接入。'
  var topEmptyText = rosterMissing ? '该赛事还没有已审核参赛名单，暂无可统计身价' : '暂无身价快照，平台测算后在此展示'
  var risingEmptyText = rosterMissing ? '该赛事还没有已审核参赛名单，暂无可比身价' : '暂无可比的上一次身价'
  var playerEmptyText = rosterMissing
    ? '该赛事还没有已审核参赛名单，暂无可展示球员'
    : (scopeMode === 'tournament' ? '该赛事已审核名单内暂无球员' : playerPool === 'public_roster' ? '暂无可展示的公开参赛球员' : '暂无完成身价测算的球员，平台测算后在此展示')
  var feedEmptyText = scopeMode === 'tournament' ? '该赛事暂无公开转会记录' : '暂无已完成的转会记录'

  return {
    focus: focus,
    topItems: topItems,
    hasTop: topItems.length > 0,
    risingItems: risingItems,
    hasRising: risingItems.length > 0,
    playerSource: playerSource,
    players: filterShowcasePlayers(playerSource, 'all'),
    hasPlayers: playerSource.length > 0,
    playerPool: playerPool,
    playerTotal: playerTotal,
    playerHasMore: payload.playerHasMore === true,
    nextPlayerCursor: text(payload.nextPlayerCursor),
    playerPoolVersion: text(payload.playerPoolVersion),
    positionChips: showcasePositionChips(playerSource, 'all'),
    playerEndText: playerEndText,
    // 转会动态列表：只含焦点之外的记录，页面只渲染一遍
    dynamicItems: dynamicItems,
    hasDynamic: dynamicItems.length > 0 || focus.visible,
    dynamicEmptyText: scopeMode === 'tournament' ? '该赛事暂无公开转会，完成后在此官宣' : '暂无公开转会，完成后在此官宣',
    transferCountText: transferCount > 0 ? '已完成 ' + transferCount + ' 条' : '',
    // 范围与空态
    scopeMode: scopeMode,
    tournamentId: tournamentId,
    tournamentName: tournamentName,
    ageGroupId: ageGroupId,
    ageGroupText: ageGroupText,
    scopeEventText: scopeMode === 'tournament' ? (tournamentName || '本赛事') : '全部赛事',
    scopeAgeText: ageGroupText || '全部年龄段',
    scopeChips: showcaseScopeChips({
      eventText: scopeMode === 'tournament' ? (tournamentName || '本赛事') : '全部赛事',
      ageText: ageGroupText || '全部年龄段',
      periodText: '全部时间',
      tournamentId: tournamentId,
      ageGroupId: ageGroupId
    }),
    ageGroupOptions: ageGroupOptions,
    hasAgeGroups: ageGroupOptions.length > 1,
    scopeNoteText: scopeFullLabel,
    rankScopeLabel: scopeLabel,
    // 榜单脚注用短标签：赛事名可能很长，长名放范围胶囊与口径弹窗，脚注只留一句
    rankScopeShort: scopeMode === 'tournament' ? '本赛事' : '全平台',
    rankScopeNote: rankScopeNote,
    topEmptyText: topEmptyText,
    risingEmptyText: risingEmptyText,
    playerEmptyText: playerEmptyText,
    feedEmptyText: feedEmptyText,
    isEmpty: !focus.visible && !topItems.length && !risingItems.length && !playerSource.length && !transferItems.length,
    notRecorded: text(payload.valuationStatus) === 'not_recorded' && text(payload.transferStatus) === 'not_recorded',
    updatedText: text(payload.updatedAt) ? '身价更新于 ' + showcaseMonthDay(payload.updatedAt) : '',
    noteText: notes.join('；')
  }
}

// 赛事卡片：workspace 赛事 + 首页目录补封面、区域与共享赛事，按稳定 tournamentId 合并
function formatEvents(context) {
  var source = (context && context.tournaments) || []
  var entries = (context && context.homeEntries) || []
  var workspaceName = text(((context || {}).currentWorkspace || {}).name)
  var entryMap = {}
  var seen = {}
  var cards = []
  var i
  for (i = 0; i < entries.length; i += 1) {
    var entry = entries[i] || {}
    if (text(entry.type) !== 'tournament') continue
    var entryId = text(entry.id)
    if (entryId) entryMap[entryId] = entry
  }
  for (i = 0; i < source.length; i += 1) {
    var event = source[i] || {}
    var id = text(event.id || event._id)
    if (!id || seen[id]) continue
    seen[id] = true
    cards.push(formatEvent(event, entryMap[id], workspaceName))
  }
  for (var key in entryMap) {
    if (!entryMap.hasOwnProperty(key) || seen[key]) continue
    seen[key] = true
    var row = entryMap[key]
    cards.push(formatEvent({ id: key, name: row.name, statusText: row.statusText }, row, workspaceName))
  }
  return cards
}

function filterEvents(cards, filterId) {
  if (!filterId || filterId === 'all') return cards || []
  return (cards || []).filter(function (item) {
    if (filterId === 'adult') return item.categoryKey === 'adult'
    if (filterId === 'youth') return item.categoryKey === 'youth'
    return true
  })
}

function matchKeyword(items, keyword, fields) {
  var value = text(keyword).toLowerCase()
  if (!value) return items || []
  var keys = fields || []
  return (items || []).filter(function (item) {
    for (var i = 0; i < keys.length; i += 1) {
      if (text(item[keys[i]]).toLowerCase().indexOf(value) >= 0) return true
    }
    return false
  })
}

// 城市取球队资料里登记的「所在城市」，不是手机定位；未登记时按调用方给的兜底文案如实说明
function cityText(city, fallback) {
  return text(city) || (text(fallback) || '城市待定')
}

module.exports = {
  FALLBACK_COVER: FALLBACK_COVER,
  FEED_FILTER_DEFS: FEED_FILTER_DEFS,
  EVENT_FILTER_DEFS: EVENT_FILTER_DEFS,
  FEED_SEARCH_FIELDS: ['publisherName', 'titleText', 'metaText', 'scorerText'],
  EVENT_SEARCH_FIELDS: ['name', 'metaText', 'regionText', 'hostText', 'statusText', 'badgeText'],
  buildTabs: buildTabs,
  buildChips: buildChips,
  pickTeam: pickTeam,
  formatReport: formatReport,
  formatEvents: formatEvents,
  formatPublicEvent: formatPublicEvent,
  formatInvite: formatInvite,
  formatPublicInvite: formatPublicInvite,
  formatShowcase: formatShowcase,
  filterShowcasePlayers: filterShowcasePlayers,
  showcasePositionChips: showcasePositionChips,
  showcaseScopeChips: showcaseScopeChips,
  showcaseScopeOptions: showcaseScopeOptions,
  showcaseAgeGroupOptions: showcaseAgeGroupOptions,
  filterEvents: filterEvents,
  matchKeyword: matchKeyword,
  cityText: cityText,
  timeText: timeText
}
