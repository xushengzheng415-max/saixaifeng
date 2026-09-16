import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
// import { vitePluginRemoveConsole } from 'vite-plugin-remove-console'  // 暂时注释，构建有问题

export default defineConfig({
  // 正式环境默认 /admin/；预览构建通过 VITE_APP_BASE 指向独立目录。
  base: process.env.VITE_APP_BASE || '/admin/',
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
