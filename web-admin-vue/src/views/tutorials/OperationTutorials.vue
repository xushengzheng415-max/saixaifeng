<template>
  <main class="tutorials">
    <header class="tutorial-header">
      <img :src="`${base}logo-saixiaofeng.png`" alt="赛小蜂足球" />
      <h1>操作教程</h1>
      <RouterLink to="/login">登录后台</RouterLink>
    </header>
    <p v-if="loading" class="notice" role="status">正在加载教程…</p>
    <div v-else-if="error" class="notice" role="alert"><p>{{ error }}</p><button @click="loadCatalog">重新加载</button></div>
    <p v-else-if="!lessons.length" class="notice">教程正在整理中</p>
    <div v-else class="tutorial-layout">
      <section v-if="selected" class="lesson-player" aria-label="教程播放">
        <h2>{{ selected.title }}</h2>
        <div v-if="!video" class="unavailable">
          <img :src="selected.coverUrl" alt="" @error="hideBrokenImage" />
          <span>{{ selected.video ? '视频链接暂不可用' : '视频待上线' }}</span>
        </div>
        <div v-else class="video-frame">
          <iframe v-if="started && !failed" :key="video.embedUrl + reload" :src="video.embedUrl" :title="selected.title"
            allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" @load="onPlayerLoad" @error="onPlayerError" />
          <button v-else-if="!failed" class="play-cover" aria-label="播放教程" @click="startPlayer">
            <img :src="selected.coverUrl" alt="" @error="hideBrokenImage" /><span>播放教程</span>
          </button>
          <div v-else class="player-error" role="alert">播放器未能加载，请重试或前往B站观看。</div>
        </div>
        <div v-if="video" class="player-actions">
          <span role="status">{{ playerLoading ? '正在加载播放器…' : '由B站提供播放' }}</span>
          <button v-if="started" @click="startPlayer">重新加载</button>
          <a :href="video.watchUrl" target="_blank" rel="noopener noreferrer">前往B站观看</a>
        </div>
        <p v-if="video" class="playback-note">无法播放或清晰度受限时，可前往B站观看。</p>
        <RouterLink v-if="nextLesson" class="next-lesson" :to="{ path: '/tutorials', query: { lesson: nextLesson.id } }">下一节：{{ nextLesson.title }} →</RouterLink>
      </section>
      <nav class="lesson-list" aria-label="教程目录">
        <RouterLink v-for="(lesson, index) in lessons" :key="lesson.id" class="lesson-link"
          :class="{ selected: selected?.id === lesson.id }" :aria-current="selected?.id === lesson.id ? 'page' : undefined"
          :to="{ path: '/tutorials', query: { lesson: lesson.id } }">
          <img :src="lesson.coverUrl" alt="" @error="hideBrokenImage" />
          <span><small>第{{ index + 1 }}节</small><strong>{{ lesson.title }}</strong><em v-if="!bilibiliVideo(lesson.video, lesson.part)">待上线</em></span>
        </RouterLink>
      </nav>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bilibiliVideo } from '../../utils/operationTutorials'
const base = import.meta.env.BASE_URL
const route = useRoute()
const lessons = ref([]), loading = ref(true), error = ref('')
const started = ref(false), failed = ref(false), playerLoading = ref(false), reload = ref(0)
const selected = computed(() => lessons.value.find(item => item.id === route.query.lesson) || lessons.value[0])
const video = computed(() => bilibiliVideo(selected.value?.video, selected.value?.part))
const nextLesson = computed(() => lessons.value[lessons.value.indexOf(selected.value) + 1])
let timer, request
function clearPlayer() { clearTimeout(timer); started.value = false; failed.value = false; playerLoading.value = false }
watch(() => selected.value?.id, clearPlayer)
function startPlayer() {
  clearTimeout(timer); failed.value = false; started.value = true; playerLoading.value = true; reload.value++
  timer = setTimeout(onPlayerError, 20000)
}
function onPlayerLoad() { clearTimeout(timer); playerLoading.value = false }
function onPlayerError() { clearTimeout(timer); playerLoading.value = false; failed.value = true }
function hideBrokenImage(event) { event.target.style.visibility = 'hidden' }
async function loadCatalog() {
  request?.abort(); request = new AbortController()
  const current = request
  loading.value = true; error.value = ''
  const timeout = setTimeout(() => current.abort(), 12000)
  try {
    const response = await fetch(`${base}tutorials/catalog.json`, { signal: current.signal, cache: 'no-cache', credentials: 'omit' })
    if (!response.ok) throw new Error('catalog')
    const data = await response.json()
    if (!Array.isArray(data.lessons)) throw new Error('catalog')
    const ids = new Set()
    const valid = data.lessons.filter(item => {
      if (!item || !/^[a-z-]+$/.test(item.id) || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || !/^\d{2}\.jpg$/.test(item.cover)) return false
      ids.add(item.id); return true
    })
    if (valid.length !== data.lessons.length) throw new Error('catalog')
    lessons.value = valid.map(item => ({ ...item, coverUrl: `${base}tutorials/covers/${item.cover}` }))
  } catch {
    if (current !== request) return
    error.value = '教程未能加载，请重试。'
  } finally { clearTimeout(timeout); if (current === request) loading.value = false }
}
onMounted(loadCatalog)
onBeforeUnmount(() => { clearTimeout(timer); request?.abort() })
</script>

<style scoped>
.tutorials{max-width:1320px;margin:auto;padding:24px;color:#203b2d}.tutorial-header{display:flex;align-items:center;gap:24px;border-bottom:1px solid #dce6df;padding-bottom:20px;margin-bottom:24px}.tutorial-header img{width:180px}.tutorial-header h1{font-size:24px;margin:0}.tutorial-header>a{margin-left:auto;color:#087a48;white-space:nowrap}.tutorial-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:32px}.lesson-player{min-width:0}.lesson-player h2{font-size:20px;margin:0 0 16px}.video-frame,.unavailable{position:relative;aspect-ratio:16/9;background:#092c20;overflow:hidden;border-radius:6px}.video-frame iframe{width:100%;height:100%;border:0;position:absolute;inset:0}.play-cover{position:absolute;inset:0;width:100%;height:100%;border:0;cursor:pointer;background:#092c20}.play-cover img,.unavailable img{width:100%;height:100%;object-fit:contain;opacity:.6}.play-cover span,.unavailable>span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;color:#075d37;padding:13px 24px;border-radius:4px;font-size:17px;font-weight:700;white-space:nowrap}.player-actions{display:flex;align-items:center;gap:18px;padding-top:15px;font-size:14px;flex-wrap:wrap}.player-actions>span{color:#6b7c70;margin-right:auto}.player-actions a,.next-lesson{color:#087a48}.player-actions button,.notice button{border:1px solid #b8cebf;background:#fff;color:#087a48;border-radius:4px;padding:7px 12px;cursor:pointer}.playback-note{font-size:13px;color:#718175;line-height:1.6}.next-lesson{display:inline-block;margin-top:23px;line-height:1.6}.lesson-list{display:flex;flex-direction:column;gap:0}.lesson-link{display:flex;gap:13px;align-items:center;padding:13px 8px;border-bottom:1px solid #e1e9e3;text-decoration:none;color:#34483b;min-width:0}.lesson-link.selected{background:#eaf5ed;color:#087a48}.lesson-link img{width:98px;aspect-ratio:4/3;object-fit:cover;background:#e3ede6;border-radius:3px}.lesson-link>span{min-width:0;display:flex;flex-direction:column;gap:5px}.lesson-link strong{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.lesson-link small,.lesson-link em{font-size:12px;color:#7a897e;font-style:normal}.notice{padding:48px 20px;text-align:center;color:#607567}.player-error{position:absolute;inset:0;display:grid;place-content:center;color:#fff;padding:25px;line-height:1.7}.lesson-link:focus-visible,.play-cover:focus-visible{outline:3px solid #b09248;outline-offset:2px}@media(max-width:760px){.tutorials{padding:16px}.tutorial-header{gap:14px}.tutorial-header img{width:120px}.tutorial-header h1{font-size:20px}.tutorial-header>a{font-size:13px}.tutorial-layout{grid-template-columns:1fr;gap:24px}.lesson-player h2{font-size:18px}.lesson-list{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px}.lesson-link{align-items:flex-start;flex-direction:column}.lesson-link img{width:100%}}@media(max-width:380px){.tutorial-header img{width:94px}.tutorial-header{gap:10px}}
</style>
