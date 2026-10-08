import {mergeConfig,defineConfig} from 'vite'
import base from './vite.config.js'
import path from 'node:path'
export default mergeConfig(base,defineConfig({base:'/',build:{outDir:'dist-platform',rollupOptions:{input:path.resolve('platform-ops.html')},emptyOutDir:true}}))
