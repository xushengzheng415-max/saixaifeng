import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [vue(), {
    name: 'platform-import-boundary',
    load(id) {
      if (id.replaceAll('\\', '/').includes('/web-admin-vue/')) throw new Error('平台后台禁止引用主办方PC工程：' + id)
    }
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: { 'element-plus': ['element-plus'], 'vue-vendor': ['vue', 'vue-router'] } } }
  }
})
