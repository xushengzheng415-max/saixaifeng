// vite.config.js
import { defineConfig } from "file:///E:/Documents/sxf-football/web-admin-vue/node_modules/vite/dist/node/index.js";
import vue from "file:///E:/Documents/sxf-football/web-admin-vue/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import AutoImport from "file:///E:/Documents/sxf-football/web-admin-vue/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///E:/Documents/sxf-football/web-admin-vue/node_modules/unplugin-vue-components/dist/vite.js";
import { ElementPlusResolver } from "file:///E:/Documents/sxf-football/web-admin-vue/node_modules/unplugin-vue-components/dist/resolvers.js";
import path from "path";
var __vite_injected_original_dirname = "E:\\Documents\\sxf-football\\web-admin-vue";
var appBase = process.env.VITE_APP_BASE || "/admin/";
var pcDeployVersion = process.env.VITE_PC_DEPLOY_VERSION || "1.0.31.001";
var pcChannel = process.env.VITE_PC_CHANNEL || (appBase.includes("/preview/") ? "preview" : "production");
function pcReleaseManifestPlugin() {
  return {
    name: "sxf-pc-release-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: JSON.stringify({
          product: "saixiaofeng-football-pc",
          version: pcDeployVersion,
          channel: pcChannel,
          base: appBase
        }, null, 2) + "\n"
      });
    }
  };
}
var vite_config_default = defineConfig({
  // 正式环境默认 /admin/；预览构建通过 VITE_APP_BASE 指向独立目录。
  base: appBase,
  define: {
    __SXF_PC_DEPLOY_VERSION__: JSON.stringify(pcDeployVersion),
    __SXF_PC_CHANNEL__: JSON.stringify(pcChannel)
  },
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
    pcReleaseManifestPlugin()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 5174,
    host: true
  },
  // 生产环境构建配置
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: {
          "element-plus": ["element-plus"],
          "vue-vendor": ["vue", "vue-router"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxEb2N1bWVudHNcXFxcc3hmLWZvb3RiYWxsXFxcXHdlYi1hZG1pbi12dWVcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkU6XFxcXERvY3VtZW50c1xcXFxzeGYtZm9vdGJhbGxcXFxcd2ViLWFkbWluLXZ1ZVxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRTovRG9jdW1lbnRzL3N4Zi1mb290YmFsbC93ZWItYWRtaW4tdnVlL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJ1xuaW1wb3J0IEF1dG9JbXBvcnQgZnJvbSAndW5wbHVnaW4tYXV0by1pbXBvcnQvdml0ZSdcbmltcG9ydCBDb21wb25lbnRzIGZyb20gJ3VucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3ZpdGUnXG5pbXBvcnQgeyBFbGVtZW50UGx1c1Jlc29sdmVyIH0gZnJvbSAndW5wbHVnaW4tdnVlLWNvbXBvbmVudHMvcmVzb2x2ZXJzJ1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCdcbi8vIGltcG9ydCB7IHZpdGVQbHVnaW5SZW1vdmVDb25zb2xlIH0gZnJvbSAndml0ZS1wbHVnaW4tcmVtb3ZlLWNvbnNvbGUnICAvLyBcdTY2ODJcdTY1RjZcdTZDRThcdTkxQ0FcdUZGMENcdTY3ODRcdTVFRkFcdTY3MDlcdTk1RUVcdTk4OThcblxuY29uc3QgYXBwQmFzZSA9IHByb2Nlc3MuZW52LlZJVEVfQVBQX0JBU0UgfHwgJy9hZG1pbi8nXG5jb25zdCBwY0RlcGxveVZlcnNpb24gPSBwcm9jZXNzLmVudi5WSVRFX1BDX0RFUExPWV9WRVJTSU9OIHx8ICcxLjAuMzEuMDAxJ1xuY29uc3QgcGNDaGFubmVsID0gcHJvY2Vzcy5lbnYuVklURV9QQ19DSEFOTkVMIHx8IChhcHBCYXNlLmluY2x1ZGVzKCcvcHJldmlldy8nKSA/ICdwcmV2aWV3JyA6ICdwcm9kdWN0aW9uJylcblxuZnVuY3Rpb24gcGNSZWxlYXNlTWFuaWZlc3RQbHVnaW4oKSB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ3N4Zi1wYy1yZWxlYXNlLW1hbmlmZXN0JyxcbiAgICBnZW5lcmF0ZUJ1bmRsZSgpIHtcbiAgICAgIHRoaXMuZW1pdEZpbGUoe1xuICAgICAgICB0eXBlOiAnYXNzZXQnLFxuICAgICAgICBmaWxlTmFtZTogJ3JlbGVhc2UuanNvbicsXG4gICAgICAgIHNvdXJjZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHByb2R1Y3Q6ICdzYWl4aWFvZmVuZy1mb290YmFsbC1wYycsXG4gICAgICAgICAgdmVyc2lvbjogcGNEZXBsb3lWZXJzaW9uLFxuICAgICAgICAgIGNoYW5uZWw6IHBjQ2hhbm5lbCxcbiAgICAgICAgICBiYXNlOiBhcHBCYXNlXG4gICAgICAgIH0sIG51bGwsIDIpICsgJ1xcbidcbiAgICAgIH0pXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIC8vIFx1NkI2M1x1NUYwRlx1NzNBRlx1NTg4M1x1OUVEOFx1OEJBNCAvYWRtaW4vXHVGRjFCXHU5ODg0XHU4OUM4XHU2Nzg0XHU1RUZBXHU5MDFBXHU4RkM3IFZJVEVfQVBQX0JBU0UgXHU2MzA3XHU1NDExXHU3MkVDXHU3QUNCXHU3NkVFXHU1RjU1XHUzMDAyXG4gIGJhc2U6IGFwcEJhc2UsXG4gIGRlZmluZToge1xuICAgIF9fU1hGX1BDX0RFUExPWV9WRVJTSU9OX186IEpTT04uc3RyaW5naWZ5KHBjRGVwbG95VmVyc2lvbiksXG4gICAgX19TWEZfUENfQ0hBTk5FTF9fOiBKU09OLnN0cmluZ2lmeShwY0NoYW5uZWwpXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSxcbiAgICBBdXRvSW1wb3J0KHtcbiAgICAgIHJlc29sdmVyczogW0VsZW1lbnRQbHVzUmVzb2x2ZXIoKV1cbiAgICB9KSxcbiAgICBDb21wb25lbnRzKHtcbiAgICAgIHJlc29sdmVyczogW0VsZW1lbnRQbHVzUmVzb2x2ZXIoKV1cbiAgICB9KSxcbiAgICAvLyBcdTc1MUZcdTRFQTdcdTczQUZcdTU4ODNcdTgxRUFcdTUyQThcdTc5RkJcdTk2NjQgY29uc29sZS5sb2dcdUZGMDhcdTRGRERcdTc1NTkgY29uc29sZS5lcnJvciBcdTU0OEMgY29uc29sZS53YXJuXHVGRjA5XG4gICAgLy8gdml0ZVBsdWdpblJlbW92ZUNvbnNvbGUoe1xuICAgIC8vICAgaW5jbHVkZXM6IFsnY29uc29sZS5sb2cnXSxcbiAgICAvLyAgIGV4Y2x1ZGVzOiBbJ2NvbnNvbGUuZXJyb3InLCAnY29uc29sZS53YXJuJ11cbiAgICAvLyB9KVxuICAgIHBjUmVsZWFzZU1hbmlmZXN0UGx1Z2luKClcbiAgXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpXG4gICAgfVxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTc0LFxuICAgIGhvc3Q6IHRydWVcbiAgfSxcbiAgLy8gXHU3NTFGXHU0RUE3XHU3M0FGXHU1ODgzXHU2Nzg0XHU1RUZBXHU5MTREXHU3RjZFXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgYXNzZXRzRGlyOiAnYXNzZXRzJyxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgJ2VsZW1lbnQtcGx1cyc6IFsnZWxlbWVudC1wbHVzJ10sXG4gICAgICAgICAgJ3Z1ZS12ZW5kb3InOiBbJ3Z1ZScsICd2dWUtcm91dGVyJ11cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1MsU0FBUyxvQkFBb0I7QUFDNVUsT0FBTyxTQUFTO0FBQ2hCLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sZ0JBQWdCO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLE9BQU8sVUFBVTtBQUxqQixJQUFNLG1DQUFtQztBQVF6QyxJQUFNLFVBQVUsUUFBUSxJQUFJLGlCQUFpQjtBQUM3QyxJQUFNLGtCQUFrQixRQUFRLElBQUksMEJBQTBCO0FBQzlELElBQU0sWUFBWSxRQUFRLElBQUksb0JBQW9CLFFBQVEsU0FBUyxXQUFXLElBQUksWUFBWTtBQUU5RixTQUFTLDBCQUEwQjtBQUNqQyxTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixpQkFBaUI7QUFDZixXQUFLLFNBQVM7QUFBQSxRQUNaLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFFBQVEsS0FBSyxVQUFVO0FBQUEsVUFDckIsU0FBUztBQUFBLFVBQ1QsU0FBUztBQUFBLFVBQ1QsU0FBUztBQUFBLFVBQ1QsTUFBTTtBQUFBLFFBQ1IsR0FBRyxNQUFNLENBQUMsSUFBSTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUE7QUFBQSxFQUUxQixNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUEsSUFDTiwyQkFBMkIsS0FBSyxVQUFVLGVBQWU7QUFBQSxJQUN6RCxvQkFBb0IsS0FBSyxVQUFVLFNBQVM7QUFBQSxFQUM5QztBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsSUFBSTtBQUFBLElBQ0osV0FBVztBQUFBLE1BQ1QsV0FBVyxDQUFDLG9CQUFvQixDQUFDO0FBQUEsSUFDbkMsQ0FBQztBQUFBLElBQ0QsV0FBVztBQUFBLE1BQ1QsV0FBVyxDQUFDLG9CQUFvQixDQUFDO0FBQUEsSUFDbkMsQ0FBQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU1ELHdCQUF3QjtBQUFBLEVBQzFCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFFQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxjQUFjO0FBQUEsVUFDL0IsY0FBYyxDQUFDLE9BQU8sWUFBWTtBQUFBLFFBQ3BDO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
