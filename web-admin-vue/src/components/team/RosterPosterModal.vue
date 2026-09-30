<template>
  <el-dialog
    :model-value="modelValue"
    title="球队名单海报"
    class="roster-poster-dialog"
    width="min(920px, 96vw)"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="roster-poster-tools">
      <div class="roster-poster-palettes" role="group" aria-label="海报颜色">
        <button v-for="option in palettes" :key="option.key" type="button" :class="{ active: palette === option.key }" :aria-pressed="palette === option.key" @click="palette = option.key">{{ option.label }}</button>
      </div>
      <span>{{ roster.length }} 名球员</span>
    </div>
    <el-alert v-if="failedPhotos.size" type="warning" :closable="false" :title="`${failedPhotos.size} 张照片暂时无法加载，海报将使用姓名占位`" />
    <div class="roster-poster-scroll" v-loading="loading">
      <div
        ref="posterElement"
        class="roster-poster-canvas"
        :class="`roster-poster-${palette}`"
        :style="{ zoom: previewZoom, '--poster-stadium': `url('${activePalette.background}')` }"
      >
        <header class="roster-poster-hero">
          <div class="roster-poster-event">
            <img v-if="tournamentLogo && !failedPhotos.has('event-logo')" :src="tournamentLogo" alt="赛事徽章" crossorigin="anonymous" @error="markPhotoFailed('event-logo')" />
            <span v-else class="roster-poster-event-fallback">赛</span>
            <strong>{{ tournament.name || '当前赛事' }}</strong>
          </div>
          <div class="roster-poster-team">
            <img v-if="teamLogo && !failedPhotos.has('team-logo')" :src="teamLogo" alt="球队队徽" crossorigin="anonymous" @error="markPhotoFailed('team-logo')" />
            <span v-else class="roster-poster-team-fallback">{{ (team.name || '队')[0] }}</span>
            <div><small>{{ team.name || '未命名球队' }}</small><h2>一线队大名单</h2><p>{{ divisionName || '当前组别' }} · {{ roster.length }} 名球员</p></div>
          </div>
        </header>

        <section class="roster-poster-section">
          <h3>主教练 <small>HEAD COACH</small></h3>
          <div class="roster-poster-head-coach">
            <template v-if="headCoach">
              <img v-if="photoUrl(headCoach) && !failedPhotos.has(`staff-${headCoach._id}`)" :src="photoUrl(headCoach)" alt="主教练头像" crossorigin="anonymous" @error="markPhotoFailed(`staff-${headCoach._id}`)" />
              <span v-else class="roster-poster-photo-fallback">{{ firstChar(headCoach.name) }}</span>
              <div><span>{{ team.name || '当前球队' }}</span><strong>{{ headCoach.name }}</strong><small>主教练</small></div>
            </template>
            <span v-else class="roster-poster-empty-person">暂无主教练资料</span>
          </div>
        </section>

        <section v-if="coaches.length" class="roster-poster-section">
          <h3>教练组 <small>COACHING TEAM</small></h3>
          <div class="roster-poster-person-grid">
            <div v-for="person in coaches" :key="person._id" class="roster-poster-person">
              <img v-if="photoUrl(person) && !failedPhotos.has(`staff-${person._id}`)" :src="photoUrl(person)" alt="" crossorigin="anonymous" @error="markPhotoFailed(`staff-${person._id}`)" />
              <span v-else class="roster-poster-photo-fallback">{{ firstChar(person.name) }}</span>
              <div class="roster-poster-person-copy"><strong>{{ person.name || '未命名' }}</strong><small>{{ staffRole(person) }}</small></div>
            </div>
          </div>
        </section>

        <section class="roster-poster-section">
          <h3>球员 <small>PLAYERS</small></h3>
          <template v-if="roster.length">
            <div v-if="palette === 'red'" class="roster-poster-positions">
              <section>
                <h4>一线队球员 <small>{{ roster.length }} 人</small></h4>
                <div class="roster-poster-red-grid">
                  <div v-for="player in roster" :key="player._id" class="roster-poster-red-player">
                    <b>{{ formatNumber(player.jerseyNumber) }}</b>
                    <div class="roster-poster-red-copy"><strong>{{ player.name || '未命名球员' }}</strong><small>{{ player.jerseyName || '—' }}</small></div>
                    <img v-if="photoUrl(player) && !failedPhotos.has(`player-${player._id}`)" :src="photoUrl(player)" alt="" crossorigin="anonymous" @error="markPhotoFailed(`player-${player._id}`)" />
                    <span v-else class="roster-poster-photo-fallback">{{ firstChar(player.name) }}</span>
                  </div>
                </div>
              </section>
            </div>
            <div v-else class="roster-poster-player-grid">
              <div v-for="player in roster" :key="player._id" class="roster-poster-player">
                <b>{{ formatNumber(player.jerseyNumber) }}</b>
                <img v-if="photoUrl(player) && !failedPhotos.has(`player-${player._id}`)" :src="photoUrl(player)" alt="" crossorigin="anonymous" @error="markPhotoFailed(`player-${player._id}`)" />
                <span v-else class="roster-poster-photo-fallback">{{ firstChar(player.name) }}</span>
                <div class="roster-poster-player-copy"><strong>{{ player.name || '未命名球员' }}</strong><small>{{ player.jerseyName || '—' }}</small><em>{{ positionLabel(player.position) }}</em></div>
              </div>
            </div>
          </template>
          <p v-else class="roster-poster-empty">当前球队暂无本届正式球员名单</p>
        </section>

        <section v-if="supportStaff.length" class="roster-poster-section">
          <h3>工作人员 <small>STAFF</small></h3>
          <div class="roster-poster-person-grid">
            <div v-for="person in supportStaff" :key="person._id" class="roster-poster-person">
              <img v-if="photoUrl(person) && !failedPhotos.has(`staff-${person._id}`)" :src="photoUrl(person)" alt="" crossorigin="anonymous" @error="markPhotoFailed(`staff-${person._id}`)" />
              <span v-else class="roster-poster-photo-fallback">{{ firstChar(person.name) }}</span>
              <div class="roster-poster-person-copy"><strong>{{ person.name || '未命名' }}</strong><small>{{ staffRole(person) }}</small></div>
            </div>
          </div>
        </section>

        <footer class="roster-poster-credit"><img :src="platformLogo" alt="赛小蜂足球LOGO" /><strong>本海报数据由赛小蜂足球提供</strong></footer>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button :disabled="loading || exporting || !roster.length" @click="printPoster">打印</el-button>
      <el-button type="primary" :loading="exporting" :disabled="loading || !roster.length" @click="downloadPoster">下载PNG</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  tournament: { type: Object, default: () => ({}) },
  tournamentLogo: { type: String, default: '' },
  divisionName: { type: String, default: '' },
  team: { type: Object, default: () => ({}) },
  teamLogo: { type: String, default: '' },
  players: { type: Array, default: () => [] },
  staff: { type: Array, default: () => [] },
  photoDataUrls: { type: Object, default: () => ({}) },
  loading: Boolean
})
const emit = defineEmits(['update:modelValue'])
const palette = ref('green')
const exporting = ref(false)
const failedPhotos = ref(new Set())
watch(() => props.photoDataUrls, () => { failedPhotos.value = new Set() })
const posterElement = ref(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1200 : window.innerWidth)
const base = import.meta.env.BASE_URL
const palettes = [
  { key: 'green', label: '绿色', background: `${base}poster-assets/stadium-green-team-roster-20260930.png` },
  { key: 'red', label: '红色', background: `${base}poster-assets/stadium-red-team-roster-20260930.png` },
  { key: 'blue', label: '蓝色', background: `${base}poster-assets/stadium-blue-team-roster-20260930.png` }
]
const activePalette = computed(() => palettes.find(option => option.key === palette.value) || palettes[0])
const platformLogo = `${base}logo-saixiaofeng.png`
const previewZoom = computed(() => Math.min(0.7, Math.max(0.28, (viewportWidth.value * 0.92 - 70) / 1200)))
const roster = computed(() => (props.players || []).filter(person => person && person._id).slice().sort((a, b) => Number(a.jerseyNumber || 999) - Number(b.jerseyNumber || 999)))
const headCoach = computed(() => (props.staff || []).find(person => /主教练|head[_ -]?coach/i.test(staffRole(person))) || null)
const coaches = computed(() => (props.staff || []).filter(person => person !== headCoach.value && /教练|coach|体能/i.test(staffRole(person))))
const supportStaff = computed(() => (props.staff || []).filter(person => person !== headCoach.value && !coaches.value.includes(person)))
function firstChar(value) { return String(value || '队')[0] }
function photoUrl(person) {
  const fileId = person?._exportPhotoFileId || person?.photoFileID || person?.photoFileId || ''
  const url = String(props.photoDataUrls[fileId] || person?.photoUrl || person?.photo || '')
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(url) ? url : ''
}
function markPhotoFailed(id) { failedPhotos.value = new Set([...failedPhotos.value, id]) }
function staffRole(person) { return String(person?.role || person?.type || '工作人员') }
function positionKey(value) { const text = String(value || '').toUpperCase(); if (/GK|守门/.test(text)) return 'GK'; if (/DF|后卫/.test(text)) return 'DF'; if (/MF|中场/.test(text)) return 'MF'; if (/FW|前锋/.test(text)) return 'FW'; return 'OTHER' }
function positionLabel(value) { return ({ GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' })[positionKey(value)] || '球员' }
function formatNumber(value) { const text = String(value ?? '').trim(); return text ? text.padStart(2, '0') : '—' }
function resize() { viewportWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', resize))
onBeforeUnmount(() => window.removeEventListener('resize', resize))

async function downloadPoster() {
  if (!posterElement.value || !roster.value.length || exporting.value) return
  exporting.value = true
  try {
    const { toBlob } = await import('html-to-image')
    const blob = await toBlob(posterElement.value, {
      width: 1200,
      height: posterElement.value.scrollHeight,
      pixelRatio: 1.5,
      style: { zoom: '1' },
      skipFonts: true
    })
    if (!blob) throw new Error('图片生成失败')
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `${String(props.team.name || '球队').replace(/[\\/:*?"<>|]/g, '-')}-本届名单-${activePalette.value.label}.png`
    link.click()
    setTimeout(() => URL.revokeObjectURL(href), 30000)
    ElMessage.success('海报已下载')
  } catch (error) {
    ElMessage.error(`海报下载失败：${error.message || '请重试'}`)
  } finally { exporting.value = false }
}
function printPoster() { if (posterElement.value && roster.value.length) window.print() }
</script>

<style>
.roster-poster-dialog .el-dialog__body{padding:0 22px}
.roster-poster-dialog .el-dialog__footer{padding-top:14px}
.roster-poster-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;color:#64756c;font-size:13px}
.roster-poster-palettes{display:flex;gap:8px}
.roster-poster-palettes button{min-width:64px;padding:7px 12px;border:1px solid #d7e4da;border-radius:5px;background:#fff;color:#284632;cursor:pointer}
.roster-poster-palettes button.active{border-color:#087a48;background:#ecf8f0;color:#087a48;font-weight:700}
.roster-poster-palettes button:focus-visible{outline:2px solid #087a48;outline-offset:2px}
.roster-poster-scroll{max-height:min(72vh,900px);overflow:auto;background:#e6eae6}
.roster-poster-canvas{width:1200px;min-height:1500px;padding-bottom:20px;background:#053d2d;color:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.roster-poster-green{--roster-base:#07583b;--roster-dark:#012e22;--roster-bright:#0ca868;--roster-accent:#17c37a;--roster-number:#fff;--roster-muted:#c3e9d2}
.roster-poster-red{--roster-base:#a00611;--roster-dark:#390104;--roster-bright:#eb1725;--roster-accent:#f84d58;--roster-number:#fff;--roster-muted:#f5c4c8}
.roster-poster-blue{--roster-base:#07498e;--roster-dark:#041a43;--roster-bright:#167dd9;--roster-accent:#59aefd;--roster-number:#9bd0ff;--roster-muted:#c1dfff}
.roster-poster-canvas{background:repeating-linear-gradient(118deg,transparent 0,transparent 270px,rgba(255,255,255,.035) 270px,rgba(255,255,255,.035) 278px),linear-gradient(180deg,var(--roster-dark),var(--roster-base) 18%,var(--roster-dark) 100%)}
.roster-poster-hero{min-height:500px;padding:64px 66px;background:linear-gradient(180deg,rgba(0,0,0,.2),var(--roster-dark) 100%),var(--poster-stadium) top center/cover no-repeat}
.roster-poster-event{display:flex;align-items:center;gap:22px;min-height:105px}
.roster-poster-event img{width:108px;height:108px;object-fit:contain}
.roster-poster-event strong{max-width:790px;font-size:29px;line-height:1.35}
.roster-poster-event-fallback{display:grid;place-items:center;width:85px;height:85px;border:2px solid #fff;border-radius:50%;font-size:40px}
.roster-poster-team{display:flex;align-items:center;gap:30px;margin-top:74px}
.roster-poster-team img,.roster-poster-team-fallback{width:152px;height:152px;flex:0 0 152px;object-fit:contain}
.roster-poster-team-fallback{display:grid;place-items:center;font-size:70px;font-weight:900}
.roster-poster-team small{font-size:28px;font-weight:700}
.roster-poster-team h2{margin:8px 0;font-size:76px;line-height:1.12}
.roster-poster-team p{margin:0;font-size:24px}
.roster-poster-section{padding:50px 62px 32px}
.roster-poster-section h3{display:flex;align-items:center;gap:23px;margin:0 0 28px;font-size:55px;line-height:1.2}
.roster-poster-section h3 small{color:var(--roster-muted);font-size:23px;letter-spacing:.17em}
.roster-poster-section h3::after{flex:1;height:2px;background:linear-gradient(90deg,rgba(255,255,255,.7),transparent);content:''}
.roster-poster-head-coach{display:flex;align-items:center;gap:38px;max-width:850px;min-height:300px;margin:0 auto;padding:16px 24px;background:linear-gradient(110deg,var(--roster-dark),var(--roster-base));clip-path:polygon(0 0,100% 0,94% 100%,0 100%)}
.roster-poster-head-coach img,.roster-poster-head-coach>.roster-poster-photo-fallback{width:280px;height:265px;object-fit:cover;object-position:top center}
.roster-poster-head-coach>div{display:grid;gap:10px}
.roster-poster-head-coach>div span{font-size:24px;color:var(--roster-muted)}
.roster-poster-head-coach>div strong{font-size:50px}
.roster-poster-head-coach>div small{font-size:21px}
.roster-poster-empty-person,.roster-poster-empty{padding:42px 20px;color:var(--roster-muted);font-size:23px}
.roster-poster-person-grid,.roster-poster-player-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.roster-poster-person,.roster-poster-player{position:relative;height:315px;overflow:hidden;background:linear-gradient(145deg,var(--roster-bright),var(--roster-dark) 85%);clip-path:polygon(0 0,100% 0,92% 100%,0 100%)}
.roster-poster-person img,.roster-poster-player img{position:absolute;right:20px;bottom:35px;width:285px;height:260px;object-fit:cover;object-position:top center}
.roster-poster-person-copy,.roster-poster-player-copy{position:absolute;inset:auto 0 0;padding:30px 18px 16px;background:linear-gradient(transparent,rgba(0,0,0,.88) 48%)}
.roster-poster-person-copy strong,.roster-poster-player-copy strong{display:block;font-size:27px}
.roster-poster-person-copy small,.roster-poster-player-copy small{display:block;margin-top:4px;font-size:17px;color:var(--roster-muted)}
.roster-poster-player>b{position:absolute;top:9px;left:15px;z-index:2;color:var(--roster-number);font-size:61px;font-variant-numeric:tabular-nums}
.roster-poster-player-copy em{position:absolute;right:27px;bottom:35px;font-size:18px;font-style:normal}
.roster-poster-photo-fallback{position:absolute;right:25px;bottom:50px;display:grid;place-items:center;width:185px;height:185px;border:2px solid rgba(255,255,255,.55);border-radius:50%;color:#fff;font-size:85px;font-weight:800}
.roster-poster-head-coach>.roster-poster-photo-fallback{position:static;flex:0 0 280px;border-radius:8px;font-size:100px}
.roster-poster-positions section{margin-bottom:38px}
.roster-poster-positions h4{display:flex;justify-content:space-between;margin:0 0 16px;padding:13px 16px;border-left:7px solid #fff;background:var(--roster-dark);font-size:37px}
.roster-poster-positions h4 small{color:var(--roster-muted);font-size:21px}
.roster-poster-red-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.roster-poster-red-player{position:relative;height:200px;overflow:hidden;background:linear-gradient(135deg,var(--roster-bright),var(--roster-base) 60%,var(--roster-dark))}
.roster-poster-red-player::after{position:absolute;right:175px;top:0;width:30px;height:100%;transform:skew(-12deg);background:rgba(255,255,255,.85);content:''}
.roster-poster-red-player>b{position:absolute;top:18px;left:24px;z-index:2;max-width:285px;color:#fff;font-size:66px;line-height:1;letter-spacing:-.04em;font-variant-numeric:tabular-nums;white-space:nowrap}
.roster-poster-red-copy{position:absolute;right:215px;bottom:20px;left:25px;z-index:2;display:grid;gap:5px;min-width:0}
.roster-poster-red-copy strong,.roster-poster-red-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.roster-poster-red-copy strong{font-size:29px}.roster-poster-red-copy small{font-size:17px}
.roster-poster-red-player img,.roster-poster-red-player>.roster-poster-photo-fallback{position:absolute;right:0;bottom:0;z-index:2;width:200px;height:200px;object-fit:cover;object-position:top center;border:0;border-radius:0}
.roster-poster-red-player>.roster-poster-photo-fallback{display:grid;place-items:center;background:var(--roster-dark);font-size:75px}
.roster-poster-credit{display:flex;align-items:center;gap:20px;margin:62px 62px 0;padding:25px 0 60px;border-top:2px solid rgba(255,255,255,.45)}
.roster-poster-credit img{width:190px;height:68px;object-fit:contain;padding:7px 12px;border-radius:5px;background:#fff}
.roster-poster-credit strong{font-size:23px}
@media print{body *{visibility:hidden!important}.roster-poster-canvas,.roster-poster-canvas *{visibility:visible!important}.roster-poster-canvas{position:absolute!important;left:0!important;top:0!important;width:100%!important;zoom:.65!important}.roster-poster-player,.roster-poster-person,.roster-poster-red-player{break-inside:avoid}}
</style>
