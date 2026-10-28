<template>
  <div class="tablet-navigation">
    <button type="button" class="tablet-menu-toggle" :aria-expanded="open" aria-controls="tablet-navigation-drawer" @click="open = true">
      <el-icon :size="22"><Menu /></el-icon><span>菜单</span>
    </button>
    <span class="tablet-current-page">{{ title }}</span>
    <el-drawer v-model="open" title="功能菜单" direction="ltr" size="320px" append-to-body class="tablet-navigation-drawer">
      <nav id="tablet-navigation-drawer" aria-label="后台功能">
        <template v-for="item in items" :key="item.path">
          <div v-if="item.children?.length" class="tablet-menu-group">
            <strong><el-icon v-if="item.icon" :size="20"><component :is="item.icon" /></el-icon>{{ item.label }}</strong>
            <button v-for="child in item.children" :key="child.path" type="button" :aria-current="isActive(child) ? 'page' : undefined" @click="select(child)">{{ child.label }}</button>
          </div>
          <button v-else type="button" class="tablet-menu-item" :aria-current="isActive(item) ? 'page' : undefined" @click="select(item)">
            <el-icon v-if="item.icon" :size="21"><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
          </button>
        </template>
      </nav>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Menu } from '@element-plus/icons-vue'
const props = defineProps({ items: { type: Array, required: true }, title: { type: String, default: '' }, activePath: { type: String, default: '' }, activeResolver: Function })
const emit = defineEmits(['navigate'])
const open = ref(false)
const isActive = item => props.activeResolver ? props.activeResolver(item) : props.activePath === item.path || props.activePath.startsWith(item.path + '/')
function select(item) { open.value = false; emit('navigate', item) }
watch(() => props.activePath, () => { open.value = false })
let query
function handleMediaChange() { if (!query.matches) open.value = false }
onMounted(() => {
  query = window.matchMedia('(orientation: landscape) and (max-width: 1180px), (orientation: landscape) and (hover: none) and (pointer: coarse) and (min-width: 600px)')
  query.addEventListener('change', handleMediaChange)
})
onUnmounted(() => query?.removeEventListener('change', handleMediaChange))
</script>

<style scoped>
.tablet-navigation{display:none;flex-shrink:0;align-items:center;gap:16px;min-height:52px;padding:4px 18px;border-bottom:1px solid #e2e9e4;background:#fff}
.tablet-menu-toggle{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:8px 12px;border:1px solid #dce6df;border-radius:6px;background:#fff;color:#17623e;font:inherit;cursor:pointer}
.tablet-current-page{min-width:0;overflow:hidden;color:#243b2d;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.tablet-menu-group{padding:8px 0;border-bottom:1px solid #edf1ee}
.tablet-menu-group strong{display:flex;align-items:center;gap:10px;padding:12px;color:#5b6d60;font-size:13px}
.tablet-menu-item,.tablet-menu-group button{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:12px;border:0;border-radius:6px;background:transparent;color:#263d2e;font:inherit;text-align:left;cursor:pointer}
.tablet-menu-group button{padding-left:42px}.tablet-menu-item[aria-current=page],.tablet-menu-group button[aria-current=page]{background:#eaf5ed;color:#087a48;font-weight:600}
.tablet-menu-toggle:focus-visible,.tablet-menu-item:focus-visible,.tablet-menu-group button:focus-visible{outline:2px solid #087a48;outline-offset:2px}
@media (orientation:landscape) and (max-width:1180px),(orientation:landscape) and (hover:none) and (pointer:coarse) and (min-width:600px){.tablet-navigation{display:flex}}
</style>
