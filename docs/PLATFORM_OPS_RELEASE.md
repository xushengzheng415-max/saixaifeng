# 平台运营后台独立发布

2026-10-09 用户确认：平台运营后台独立维护，不与主办方PC后台绑定发布。

| 项目 | 平台运营 | 主办方PC |
|---|---|---|
| 长期分支 | `codex/platform-ops` | `main` / `preview` |
| 工程 | `platform-admin-vue/` | `web-admin-vue/` |
| 构建 | 工程内 `npm ci`、`npm run build` | 原有PC构建流程 |
| 产物 | `platform-admin-vue/dist/` | `web-admin-vue/dist/` |
| 正式入口 | `https://pingtai.sxffootball.cn/` | `https://www.sxffootball.cn/admin/` |
| 发布 | 平台工程内 `npm run deploy` | PREVIEW_RELEASE_WORKFLOW.md |

平台分支固定保留，不因未合入main而删除。平台功能提交留在平台分支；跨端公共改动按独立提交审查和同步，不合并整个分支。旧PC工程中的平台代码仅为历史兼容，不继续同步修改，不作为平台正式发布源。旧 `vite.platform.config.js` 构建入口停用。

发布命令限制分支及目标，拒绝未提交的平台源码，构建后生成版本标记。仅通过既有SSH身份写入平台服务器的独立版本目录，保留旧版本，检查Nginx配置后切换站点目录，再回读线上文件摘要。禁止从该命令部署PC、H5、小程序或云函数。无权访问SSH时报告阻塞，不变更认证配置。

统一卡片绘制 `shared/player-card/draw.js`、字段协议 `cloudfunctions/webLoginApi/player-card-text-styles.json` 是允许的公共依赖；平台构建不依赖PC工程的文件或node_modules。共享后端与租户权限继续遵循AGENTS.md；前端工程拆分不代表新建数据库或自动发布共享云函数。

## 2026-10-23 共享后端代码更新的依赖保护

CloudBase CLI在缺少显式函数配置、从package.json推断配置时可能默认开启installDependency，造成传递依赖浮动。仅锁定根package-lock.json不足以证明云端安装遵循原包树，必须回下载核对实际node_modules版本/完整性。首次建队函数已改为携带完整现网依赖、关闭云端自动安装；赛事报名流程保留原false标志，其余三个本轮函数保留原true并核对实际依赖未变。

本次五个函数的无敏感值代码更新配置为`tools/football-numbering-functions.config.json`。发布前仍应回读实际配置，防止复用过时安装策略；只写name/installDependency，不把环境变量、密钥、超时等运行配置混进代码更新。继续使用足球专用sxf-cloud包装器，显式指定此config-file、函数名及刚下载线上包加最小差量的实际目录。不能因为有此配置文件就从脏工作区整包覆盖后端，也不能把fn deploy上传成功当作代码已更新。

实际状态、存量编码补发与回读证据见`docs/releases/numbering-standard-20261023.md`。

## 2026-10-28 电脑/平板自适应与可安装客户端

平台运营中心与平台后台继续共用同一套页面、权限和数据，不新建端、不改业务规则：

| 能力 | 实现 | 验证入口 |
|---|---|---|
| 平板自适应（抽屉导航、44px 触控、窄屏堆叠） | `src/assets/platform-tablet.css`、`src/components/PlatformTabletNav.vue` | `node tools/test-platform-tablet-ui.cjs` |
| 可安装客户端（PWA） | `public/manifest.webmanifest`、`public/sw.js`、`public/pwa-*.png`、`src/components/PlatformInstallGuide.vue`、`src/utils/serviceWorker.js` | `node tools/test-platform-pwa.cjs` |
| 应用图标 | `scripts/make-pwa-icons.ps1` 由 `public/logo.png` 的蜂+足球徽标生成 | 截图见 `output/` |

安装方式：Windows 用 Edge/Chrome 地址栏“安装”；iPad 用 Safari“添加到主屏幕”；Android 平板用 Chrome“添加到主屏幕”。安装后以独立窗口运行，账号、权限与数据仍经 `webLoginApi` 获取，与网页版完全一致。安装入口只在未安装时出现，已安装（standalone）自动隐藏。

入口位置有两处，未登录也能看到：平台管理员登录页表单下方（“安装应用” / “添加到主屏幕”按钮 + 支持的浏览器说明），以及登录后控制台顶栏。点击后弹出分端安装步骤；浏览器直接支持安装时（`beforeinstallprompt`）改为直接触发系统安装。

Service Worker 边界：只缓存本站 `/index.html`、构建产物 `/assets/` 与图标清单；跨域（`webLoginApi` 等）请求不拦截、不缓存，缓存中不保存任何登录态或业务数据。仅在正式构建注册（`import.meta.env.PROD`），开发态不注册，避免热更新被缓存干扰。HTTPS 是安装前提。

验证结果（2026-10-28 本地）：`npm run build` 通过；`tools/test-platform-tablet-ui.cjs` 覆盖 1440 桌面 + 1180/1024 横屏平板 + 820/768 竖屏平板 × 15 个功能页，0 失败；`tools/test-platform-pwa.cjs` 校验清单、图标尺寸、Service Worker 接管、缓存边界、断网外壳、电脑/iPad/Android 安装入口、登录页入口（电脑“安装应用”、iPad“添加到主屏幕”）与已安装隐藏，0 失败。截图与结果见 `output/platform-tablet-20261028/`、`output/platform-pwa-20261028/`。

验证脚本的 Playwright 统一由 `tools/lib/load-playwright.cjs` 加载，优先使用仓库内 `npm install --no-save playwright-core`，缓存运行时路径失效时不再整批失败。

当前状态：源码在工作区，未提交 Git、未发布 `pingtai.sxffootball.cn`。`npm run deploy` 会拒绝脏工作区，正式发布需先提交平台源码。

