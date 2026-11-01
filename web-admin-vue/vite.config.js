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
  define: {
    // 构建时间戳（本机时区）：用于在页面上直观确认当前跑的是哪一次构建
    __SXF_BUILD__: JSON.stringify((() => {
      const d = new Date()
      const p = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    })())
  },
  plugins: [
    {
      name:'shared-standings-browser',
      enforce:'pre',
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/cloudfunctions/dataCenter/shared/standings.cjs')) return null
        // Keep the single server implementation usable by Vite dev and browser builds.
        return source.replace('module.exports = { pointsRule, buildStandings, rankTeams }', 'export default { pointsRule, buildStandings, rankTeams }')
      }
    },
    {
      name:'shared-pairing-templates-browser',
      enforce:'pre',
      transform(source,id) {
        if (!/\/cloudfunctions\/generateSchedule\/(pairingTemplates|topology|confirmedPairings)\.js$/.test(id.replaceAll('\\','/'))) return null
        return source.replace("const templates = require('./pairingTemplates')", "import templates from './pairingTemplates.js'")
          .replace("const topology = require('./topology')", "import topology from './topology.js'")
          .replace('module.exports = {','export default {')
      }
    },
    {
      name:'registration-import-profile-browser',
      enforce:'pre',
      transform(source,id) {
        if (!id.replaceAll('\\','/').endsWith('/cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs')) return null
        return source.replace('module.exports={supplementImportedIdentity,editableImportedProfile}', 'export {supplementImportedIdentity,editableImportedProfile}')
      }
    },
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
