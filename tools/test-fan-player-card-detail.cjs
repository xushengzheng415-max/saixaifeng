const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname,'../service-account-h5/tournament-center-player-list-20260930.js'),'utf8')
const start = source.indexOf('function openPlayerDetail(row, rank) {')
const end = source.indexOf("document.body.insertAdjacentHTML('beforeend', html)",start)
assert(start >= 0 && end > start)
const snippet = source.slice(start,end) + 'return html\n}'
const render = new Function('document','publicImage','escapeHtml',snippet + '\nreturn openPlayerDetail')(
  { getElementById:() => null }, () => '', value => String(value)
)

const base = { name:'样例球员',number:'26',teamName:'真实球队',cardTier:'bronze',cardScoreVersion:'football-player-card-points/2',careerMetrics:{appearances:1,starts:0,minutesPlayed:37,goals:0,assists:0},careerPoints:2,supportDrops:0,supportPoints:0,cardPoints:2,supportCount:0 }
const first = render(base,1)
assert(first.includes('参赛场次：<strong>1 场</strong>'))
assert(first.includes('球员卡积分：<strong>2 分</strong>'))
assert(first.includes('距银卡 43 分'))
assert(first.includes('<dt>出场分钟</dt><dd>37</dd>'))
assert(!first.includes('再 10 场升级'))

const second = render({ ...base,careerMetrics:{...base.careerMetrics,starts:1,minutesPlayed:60},cardPoints:4 },2)
assert(second.includes('球员卡积分：<strong>4 分</strong>'))
assert(second.includes('距银卡 41 分'))

const pending = render({ ...base,cardTier:null,cardPoints:null,careerMetrics:null },3)
assert(pending.includes('球员卡等级待核定') || pending.includes('等级待核定'))
assert(!pending.includes('再 10 场升级'))
assert(!pending.includes('null-card.png'))
const inconsistent = render({ ...base,cardTier:'bronze',cardPoints:4,careerMetrics:null },4)
assert(inconsistent.includes('参赛场次：<strong>统计暂不可用</strong>'))
assert(!inconsistent.includes('参赛场次：<strong>待核定</strong>'))
const supportOnly = render({ ...base,cardTier:'silver',cardPoints:45,careerPoints:0,supportDrops:450,supportPoints:45,careerMetrics:{appearances:0,starts:0,minutesPlayed:0,goals:0,assists:0} },5)
assert(supportOnly.includes('参赛场次：<strong>0 场</strong>'))
assert(supportOnly.includes('球员卡积分：<strong>45 分</strong>'))
assert(supportOnly.includes('<dt>累计收到蜂蜜</dt><dd>450</dd>'))
const oldVersion = render({ ...base,cardScoreVersion:'football-player-card-points/1' },6)
assert(oldVersion.includes('统计暂不可用'))
console.log('PASS: H5 球员资料使用正式参赛场次、积分进度和待核定状态')
