import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
export default defineConfig({base:'/duration-verification/',plugins:[vue()],resolve:{alias:{'@':path.resolve('src')}},build:{outDir:'dist-duration',rollupOptions:{input:path.resolve('src/platform-duration-upgrade.js'),output:{entryFileNames:'duration-upgrade.js'}},emptyOutDir:true}})
