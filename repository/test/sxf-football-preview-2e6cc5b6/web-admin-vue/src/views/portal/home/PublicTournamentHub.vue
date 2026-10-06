<template>
  <div class="public-center">
    <section class="hero" :style="{ backgroundImage: `url(${stadiumImage})` }">
      <div class="hero-shade"></div>
      <div class="hero-content">
        <span class="hero-kicker">赛小蜂足球 · 公共数据</span>
        <h1>赛事中心</h1>

        <div class="hero-stats">
          <span><b>{{ stats.tournaments }}</b>公开赛事</span>
          <span><b>{{ stats.matches }}</b>公开比赛</span>
          <span><b>{{ stats.ongoing }}</b>正在进行</span>
        </div>
      </div>
    </section>

    <main class="center-body">
      <section class="section-block">
        <header class="section-head">
          <div><span>PUBLIC TOURNAMENTS</span><h2>公开赛事</h2></div>
        </header>
        <div v-if="loading" class="loading-grid"><i v-for="n in 2" :key="n"></i></div>
        <div v-else-if="error" class="state-card"><strong>赛事数据暂时无法加载</strong><p>{{ error }}</p><button @click="loadData">重新加载</button></div>
        <div v-else-if="!tournaments.length" class="state-card"><strong>暂无已公开赛事</strong></div>
        <div v-else class="tournament-grid">
          <article
            v-for="(item, index) in tournaments"
            :key="item.id"
            class="tournament-card"
            :class="{ active: activeTournament === item.id }"
            @click="selectTournament(item.id)"
          >
            <div class="tournament-cover" :style="coverStyle(item, index)">
              <div class="cover-overlay"></div>
              <img v-if="item.logo" :src="item.logo" :alt="item.name" class="event-logo" @error="hideBrokenImage">
              <span v-else class="event-mark">{{ eventMark(item.name) }}</span>
              <span class="event-status">{{ tournamentStatus(item.status) }}</span>
            </div>
            <div class="tournament-copy">
              <span class="event-type">{{ formatType(item.formatType) }}</span>
              <h3>{{ item.name }}</h3>
              <div class="event-meta">
                <span>{{ dateRange(item) }}</span>
                <span>{{ item.city || item.venue || '地点待公布' }}</span>
              </div>
              <footer>
                <span><b>{{ item.teamCount || 0 }}</b>支球队</span>
                <span><b>{{ item.matchCount || 0 }}</b>场比赛</span>
                <button type="button" @click.stop="selectTournament(item.id)">查看比赛</button>
              </footer>
            </div>
          </article>
        </div>
      </section>

      <section id="publicMatches" class="section-block match-section">
        <header class="section-head match-heading">
          <div><span>MATCH CENTER</span><h2>比赛中心</h2></div>
          <button v-if="activeTournament !== 'all'" class="clear-filter" @click="selectTournament('all')">查看全部赛事</button>
        </header>
        <div class="filter-row" role="tablist" aria-label="比赛状态">
          <button
            v-for="item in matchFilters"
            :key="item.key"
            :class="{ active: activeMatchFilter === item.key }"
            @click="activeMatchFilter = item.key"
          >{{ item.label }}<b>{{ matchCount(item.key) }}</b></button>
        </div>
        <div v-if="!loading && !matchGroups.length" class="state-card compact"><strong>暂无符合条件的公开比赛</strong></div>
        <div v-for="group in matchGroups" :key="group.key" class="match-day">
          <header><strong>{{ group.label }}</strong><span>{{ group.items.length }} 场</span></header>
          <div class="match-grid">
            <article v-for="match in group.items" :key="match.id" class="match-card" :class="`is-${match.status}`">
              <div class="match-top">
                <span>{{ match.tournamentName }}</span>
                <b>{{ match.divisionName || match.round || statusText(match.status) }}</b>
              </div>
              <div class="match-main">
                <div class="team">
                  <img v-if="match.homeLogo" :src="match.homeLogo" :alt="match.homeName" @error="hideBrokenImage">
                  <span v-else>{{ teamMark(match.homeName) }}</span>
                  <strong>{{ match.homeName }}</strong>
                </div>
                <div class="score-box">
                  <small>{{ statusText(match.status) }}</small>
                  <div v-if="match.status !== 'upcoming'" class="score"><b>{{ score(match.homeScore) }}</b><i>:</i><b>{{ score(match.awayScore) }}</b></div>
                  <div v-else class="versus">VS</div>
                  <time>{{ matchTimeText(match) }}</time>
                </div>
                <div class="team">
                  <img v-if="match.awayLogo" :src="match.awayLogo" :alt="match.awayName" @error="hideBrokenImage">
                  <span v-else>{{ teamMark(match.awayName) }}</span>
                  <strong>{{ match.awayName }}</strong>
                </div>
              </div>
              <footer><span>{{ match.round || '比赛轮次待公布' }}</span><span>{{ match.venue || '场地待公布' }}</span></footer>
            </article>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getPublicTournamentCenter } from '../../../utils/cloud'

const stadiumImage = `${import.meta.env.BASE_URL}images/tournament-center-stadium-v1.webp`
const loading = ref(true)
const error = ref('')
const tournaments = ref([])
const matches = ref([])
const stats = ref({ tournaments: 0, registering: 0, ongoing: 0, matches: 0 })
const activeTournament = ref('all')
const activeMatchFilter = ref('all')
const matchFilters = [
  { key: 'all', label: '全部' },
  { key: 'ongoing', label: '进行中' },
  { key: 'upcoming', label: '待开始' },
  { key: 'finished', label: '已结束' }
]

const filteredMatches = computed(() => matches.value.filter(item =>
  (activeTournament.value === 'all' || item.tournamentId === activeTournament.value) &&
  (activeMatchFilter.value === 'all' || item.status === activeMatchFilter.value)
))

const matchGroups = computed(() => {
  const groups = new Map()
  filteredMatches.value.forEach(item => {
    const key = item.matchDate || 'date-pending'
    const group = groups.get(key) || { key, label: item.matchDate ? displayDate(item.matchDate) : '比赛日期待公布', items: [] }
    group.items.push(item)
    groups.set(key, group)
  })
  return Array.from(groups.values())
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('visualQa') === '1') {
      tournaments.value = [
        { id: 'qa-huaichuan', name: '2026年“怀川”杯全国青少年足球邀请赛', status: 'registering', startDate: '2026-10-02', endDate: '2026-10-06', city: '河南', formatType: '8side', teamCount: 16, matchCount: 40, completedMatchCount: 0, logo: '', cover: '' },
        { id: 'qa-longxiang', name: '濮阳龙翔杯足球赛', status: 'registering', startDate: '', endDate: '', city: '濮阳', formatType: 'tournament', teamCount: 40, matchCount: 100, completedMatchCount: 0, logo: '', cover: '' }
      ]
      matches.value = [
        { id: 'qa-1', tournamentId: 'qa-huaichuan', tournamentName: '2026年“怀川”杯全国青少年足球邀请赛', divisionName: 'U12组', round: '小组赛第1轮', status: 'upcoming', matchDate: '2026-10-02', matchTime: '09:00', venue: '1号场', homeName: '怀川少年A队', awayName: '中原少年B队', homeLogo: '', awayLogo: '' },
        { id: 'qa-2', tournamentId: 'qa-longxiang', tournamentName: '濮阳龙翔杯足球赛', divisionName: 'U10组', round: '联赛第1轮', status: 'upcoming', matchDate: '2026-10-02', matchTime: '10:00', venue: '2号场', homeName: '濮阳少年队', awayName: '郑州青训队', homeLogo: '', awayLogo: '' },
        { id: 'qa-3', tournamentId: 'qa-longxiang', tournamentName: '濮阳龙翔杯足球赛', divisionName: 'U8组', round: '淘汰赛', status: 'finished', matchDate: '2026-09-28', matchTime: '15:00', venue: '中心球场', homeName: '龙翔U8', awayName: '绿茵U8', homeScore: 2, awayScore: 1, homeLogo: '', awayLogo: '' }
      ]
      stats.value = { tournaments: 2, registering: 2, ongoing: 0, matches: 3 }
      return
    }
    const result = await getPublicTournamentCenter()
    if (!result.success) throw new Error(result.error || '公开赛事读取失败')
    tournaments.value = result.data?.tournaments || []
    matches.value = result.data?.matches || []
    stats.value = result.data?.stats || stats.value
  } catch (reason) {
    error.value = reason.message || '请稍后重试'
  } finally {
    loading.value = false
  }
}

function coverStyle(item, index) {
  const image = item.cover || stadiumImage
  const positions = ['center 58%', 'center 44%', 'center 66%']
  return { backgroundImage: `url(${image})`, backgroundPosition: positions[index % positions.length] }
}
function hideBrokenImage(event) { event.currentTarget.style.display = 'none' }
function eventMark(name) {
  const cleaned = String(name || '赛').replace(/^\d{4}年?/, '').replace(/^[“”"'《》【】\s]+/, '')
  const chinese = cleaned.match(/[\u4e00-\u9fff]/)
  return chinese ? chinese[0] : (cleaned.slice(0, 1) || '赛')
}
function teamMark(name) { return String(name || '队').trim().slice(0, 1) || '队' }
function tournamentStatus(value) { return ({ registering: '报名中', published: '已发布', ongoing: '进行中', ended: '已结束', completed: '已结束', finished: '已结束' })[value] || '已公开' }
function statusText(value) { return ({ ongoing: '进行中', upcoming: '待开始', finished: '已结束' })[value] || '待开始' }
function formatType(value) { return ({ tournament: '赛会制', cup: '杯赛制', league: '联赛制', hybrid: '混合制', combined: '混合制', '5side': '五人制', '7side': '七人制', '8side': '八人制', '9side': '九人制', '11side': '十一人制' })[value] || '足球赛事' }
function dateRange(item) {
  if (item.startDate && item.endDate) return `${item.startDate} 至 ${item.endDate}`
  return item.startDate || item.endDate || '比赛日期待公布'
}
function displayDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${['周日','周一','周二','周三','周四','周五','周六'][date.getDay()]}`
}
function matchTimeText(item) { return [item.matchDate, item.matchTime].filter(Boolean).join(' ') || '开赛时间待公布' }
function score(value) { return Number.isFinite(Number(value)) ? Number(value) : '-' }
function matchCount(key) {
  return matches.value.filter(item => (activeTournament.value === 'all' || item.tournamentId === activeTournament.value) && (key === 'all' || item.status === key)).length
}
function selectTournament(id) {
  activeTournament.value = id
  requestAnimationFrame(() => document.getElementById('publicMatches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

onMounted(loadData)
</script>

<style scoped>
.public-center{min-height:100vh;background:#f3f7f4;color:#17231c}.hero{position:relative;min-height:360px;background-size:cover;background-position:center 62%;overflow:hidden}.hero-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,35,25,.96) 0%,rgba(3,54,37,.76) 48%,rgba(2,27,21,.28) 100%),linear-gradient(0deg,rgba(1,23,16,.72),transparent 56%)}.hero-content{position:relative;z-index:1;width:min(1180px,calc(100% - 32px));margin:auto;padding:70px 0 48px;color:#fff}.hero-kicker{display:block;color:#91d6ad;font-size:13px;font-weight:800;letter-spacing:2px}.hero h1{margin:12px 0 10px;font-size:50px;line-height:1}.hero p{max-width:620px;margin:0;color:#dcebe3;font-size:16px;line-height:1.8}.hero-stats{display:flex;gap:34px;margin-top:36px}.hero-stats span{display:grid;color:#bfcec6;font-size:12px}.hero-stats b{margin-bottom:3px;color:#fff;font-size:28px}.center-body{width:min(1180px,calc(100% - 32px));margin:-34px auto 0;position:relative;z-index:2;padding-bottom:56px}.section-block{padding:26px;border:1px solid #dfe9e3;border-radius:22px;background:#fff;box-shadow:0 14px 34px rgba(8,47,37,.08)}.section-block+.section-block{margin-top:22px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:20px}.section-head span{color:#158554;font-size:11px;font-weight:900;letter-spacing:1.5px}.section-head h2{margin:5px 0 0;font-size:26px}.section-head p{margin:0;color:#7d8982;font-size:12px}.tournament-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.tournament-card{display:grid;grid-template-columns:42% 1fr;min-width:0;overflow:hidden;border:1px solid #e0e8e3;border-radius:18px;background:#fff;cursor:pointer;transition:.25s ease}.tournament-card:hover,.tournament-card.active{transform:translateY(-3px);border-color:#66ad82;box-shadow:0 14px 28px rgba(4,84,48,.13)}.tournament-cover{position:relative;min-height:220px;background-size:cover}.cover-overlay{position:absolute;inset:0;background:linear-gradient(145deg,rgba(3,63,40,.34),rgba(1,22,16,.72))}.event-logo,.event-mark{position:absolute;left:18px;bottom:18px;width:66px;height:66px;border:1px solid rgba(255,255,255,.6);border-radius:18px;background:rgba(255,255,255,.92);box-shadow:0 8px 22px rgba(0,0,0,.2)}.event-logo{object-fit:contain;padding:7px}.event-mark{display:grid;place-items:center;color:#087646;font-size:31px;font-weight:900}.event-status{position:absolute;top:14px;left:14px;padding:6px 10px;border-radius:999px;color:#fff;background:rgba(5,116,66,.92);font-size:11px;font-weight:800;backdrop-filter:blur(8px)}.tournament-copy{display:flex;flex-direction:column;min-width:0;padding:21px}.event-type{color:#158554;font-size:11px;font-weight:800}.tournament-copy h3{margin:8px 0 14px;font-size:20px;line-height:1.45}.event-meta{display:grid;gap:7px;color:#6c7971;font-size:12px;line-height:1.5}.tournament-copy footer{display:flex;align-items:center;gap:14px;margin-top:auto;padding-top:18px}.tournament-copy footer span{display:grid;color:#8a948e;font-size:10px}.tournament-copy footer b{color:#203128;font-size:17px}.tournament-copy footer button,.clear-filter,.state-card button{margin-left:auto;padding:8px 13px;border:0;border-radius:999px;color:#fff;background:#0a7b49;font-size:12px;font-weight:800;cursor:pointer}.match-section{scroll-margin-top:76px}.match-heading{align-items:center}.clear-filter{margin-left:0;color:#0a7b49;background:#edf7f1}.filter-row{display:flex;gap:8px;margin:-4px 0 20px;overflow-x:auto}.filter-row button{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:8px 14px;border:1px solid #dce7e0;border-radius:999px;color:#56645c;background:#fff;cursor:pointer}.filter-row button.active{color:#fff;border-color:#087a48;background:#087a48}.filter-row b{display:grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:rgba(0,0,0,.08);font-size:10px}.match-day+ .match-day{margin-top:22px}.match-day>header{display:flex;justify-content:space-between;margin-bottom:10px;color:#33433a}.match-day>header span{color:#8a958e;font-size:12px}.match-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.match-card{overflow:hidden;border:1px solid #e1e9e4;border-radius:16px;background:linear-gradient(180deg,#fff,#fbfdfc)}.match-card.is-ongoing{border-color:#efb1ad;box-shadow:inset 4px 0 #e14d46}.match-top,.match-card>footer{display:flex;justify-content:space-between;gap:12px;padding:11px 14px;color:#78847d;font-size:11px}.match-top{border-bottom:1px solid #edf1ef}.match-top b{color:#26724c}.match-main{display:grid;grid-template-columns:minmax(0,1fr) 100px minmax(0,1fr);align-items:center;gap:8px;padding:18px 12px}.team{display:grid;justify-items:center;gap:7px;min-width:0;text-align:center}.team img,.team>span{display:grid;place-items:center;width:48px;height:48px;border:1px solid #dce7e0;border-radius:15px;object-fit:contain;background:#fff;color:#0a7b49;font-size:18px;font-weight:900}.team strong{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.score-box{text-align:center}.score-box small{color:#e0524c;font-size:10px}.score{display:flex;justify-content:center;align-items:center;gap:9px;margin:4px 0;font-size:24px}.score i{color:#a3ada7;font-style:normal;font-weight:400}.versus{margin:5px 0;color:#718078;font-size:21px;font-weight:900}.score-box time{color:#7d8982;font-size:10px}.match-card>footer{border-top:1px dashed #dfe7e2}.state-card{padding:44px 20px;border:1px dashed #cadbd1;border-radius:16px;background:#f8fbf9;text-align:center}.state-card strong{font-size:18px}.state-card p{margin:8px 0 0;color:#748078;font-size:13px}.state-card button{margin:16px 0 0}.state-card.compact{padding:28px}.loading-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.loading-grid i{height:220px;border-radius:18px;background:linear-gradient(90deg,#edf2ef,#f8faf9,#edf2ef);background-size:200% 100%;animation:loading 1.3s infinite}@keyframes loading{to{background-position:-200% 0}}
@media(max-width:760px){.hero{min-height:310px}.hero-content{padding:52px 0 64px}.hero h1{font-size:38px}.hero p{font-size:14px}.hero-stats{gap:22px;margin-top:28px}.hero-stats b{font-size:23px}.center-body{width:min(100% - 20px,520px);margin-top:-28px}.section-block{padding:18px;border-radius:18px}.section-head{align-items:start}.section-head p{max-width:150px;text-align:right}.tournament-grid,.match-grid,.loading-grid{grid-template-columns:1fr}.tournament-card{grid-template-columns:1fr}.tournament-cover{min-height:174px}.tournament-copy{padding:18px}.match-main{grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr)}.team strong{font-size:12px}}
</style>
