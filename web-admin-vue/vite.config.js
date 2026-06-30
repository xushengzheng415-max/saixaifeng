import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
// import { vitePluginRemoveConsole } from 'vite-plugin-remove-console'  // 暂时注释，构建有问题

export default defineConfig({
  // Vue 应用部署到 /admin/ 子目录，避免与广告页冲突
  base: '/admin/',
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()]
    }),
    Components({
      resolvers: [ElementPlusResolver()]
    }),
    // 生产环境自动移除 console.log（保留 console.error 和 console.warn）
    // vitePluginRemoveConsole({
    //   includes: ['console.log'],
    //   excludes: ['console.error', 'console.warn']
    // })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5174,
    host: true
  },
  // 生产环境构建配置
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus'],
          'vue-vendor': ['vue', 'vue-router']
        }
      }
    }
  }
})
