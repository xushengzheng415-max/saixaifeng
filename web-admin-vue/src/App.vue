<template>
  <router-view v-if="ready" />
  <div v-else class="startup-state" role="status">
    <span>{{ startupError ? '页面加载失败，请重新加载' : '正在打开后台…' }}</span>
    <button v-if="startupError" type="button" @click="reload">重新加载</button>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const ready = ref(false)
const startupError = ref(false)
const router = useRouter()
const removeErrorHandler = router.onError(() => { if (!ready.value) startupError.value = true })
router.isReady().then(() => { ready.value = true }, () => { startupError.value = true })
onUnmounted(removeErrorHandler)
function reload() { window.location.reload() }
</script>

<style scoped>
.startup-state{min-height:100vh;display:flex;align-items:center;justify-content:center;gap:12px;color:#087a48;font-size:14px}.startup-state button{padding:7px 12px;border:1px solid #087a48;border-radius:4px;background:#fff;color:#087a48;cursor:pointer}
</style>
