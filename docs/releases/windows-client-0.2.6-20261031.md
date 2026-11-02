# Windows 客户端 v0.2.6：登录页同时兼容新版与旧版网页

## 背景

2026-10-31 用户要求：发测试版时，线上网页与应用程序必须匹配，不能出现“网页端更新了、客户端没跟上”的失配状态。

实测发现 PC 测试端（`/preview/admin/`）登录页已改为新版浅色分栏布局（`login-overlay modern-login` + `login-card` + `login-auth` + `wechat-login-panel` + `qr-shell`，刷新按钮在面板内），而 v0.2.5 外壳的登录页装饰依赖旧结构：

- 外壳用 `card.dataset.desktopLogin` 判断是否已装饰，而新版网页模板直接写死了 `data-desktop-login="true"`，导致整套注入被跳过；
- 旧逻辑只找 `.qr-panel`，新版页面没有该容器，即使去掉标记也会在插入标题处抛错；
- 「刷新二维码」按钮按 `.login-card > .retry` 查找，新版 `.retry` 在登录面板内，状态框按钮点不动；
- 品牌栏由外壳插入，新版页面自带 `.login-brand`，直接补回会出现两套品牌。

后果：测试版客户端登录页仍能扫码，但缺版本行、「检查更新」入口和二维码加载/过期状态提示；若新版登录页合并到 `/admin/`，正式版客户端同样受影响。

## 修改（仅外壳，不改网页）

`desktop-windows/src/login-page.js`：

- 装饰状态改用外壳自身标记 `sxfDesktopDecorated`，网页写死 `data-desktop-login` 不再阻断注入（仍同步写回该标记供既有判断使用）。
- 页面已有 `.login-brand` 或 `.sxf-desktop-brand` 时不再插入外壳品牌，消除重复品牌；旧版页面无品牌栏时照常插入。
- 登录面板按 `.qr-panel` → `.wechat-login-panel` → `.login-auth` 兜底；页面已有 `.login-tabs` 时不再补「微信扫码登录」标题与提示，避免与页面文案重复。
- 二维码状态框统一挂在 `.qr-shell`，空容器时跳过而不是抛出。
- 「刷新二维码」按钮统一查找 `.login-card .retry`，新旧位置都能触发页面自身的刷新逻辑。
- 页脚挂到 `.login-overlay`（缺失时退回卡片父级），版本行与「检查更新」入口始终存在。

`desktop-windows/scripts/runtime-smoke.cjs`：品牌断言兼容两种来源（外壳品牌或网页 `.login-brand img[alt]`），新增页脚与「检查更新」入口存在性断言，仍然保持 8 项检查。

`desktop-windows/package.json`：0.2.5 → 0.2.6；`scripts/prepare-publish.cjs` 更新清单说明；`README.md` 增补 v0.2.6 说明与“测试版发布前后必须两通道 8 项通过”的约束。

## 验证

- `node scripts/smoke.cjs --preview`：8/8 通过，`entry=https://www.sxffootball.cn/preview/admin/`，`version=0.2.6`；新版登录页单套品牌、页脚显示“测试版 · 共用正式服务 · v0.2.6 检查更新”、二维码加载与过期刷新正常。
- `node scripts/smoke.cjs`（正式）：8/8 通过，`entry=https://www.sxffootball.cn/admin/`，旧版登录页品牌、标题、二维码刷新、断网恢复与打印均未回归。
- `npm test`：15 项断言通过。
- 打包后 `node scripts/smoke.cjs --packaged` 与 `--packaged --preview`：两通道 8/8 通过，`version=0.2.6`；`scripts/create-manifest.cjs` 逐文件校验包内源码摘要一致。安装包 `SxfFootball-Setup-0.2.6-x64.exe`，122,430,507 字节，SHA-256 `20c94ea201e98028d48695402a65ac3ca76852693deddca6dff46a8ce507abfe`。

## 发布与线上回读

- 仅发布 `desktop/windows/`：`sxf-cloud.ps1 football run hosting deploy desktop-windows/release/publish-0.2.6 desktop/windows --entry latest.json --verify`，2 个文件上传成功并通过发布后一致性校验；未改动 `/admin/`、`/preview/admin/`、H5、小程序、云函数或环境配置。
- 线上 `https://www.sxffootball.cn/desktop/windows/latest.json` 回读：版本 `0.2.6`、122,430,507 字节、SHA-256 `20c94ea2…07abfe`，与本地一致。
- 完整回下载安装包复核：122,430,507 字节，SHA-256 `20c94ea201e98028d48695402a65ac3ca76852693deddca6dff46a8ce507abfe`，与清单一致。
- `node scripts/probe-published-updates.cjs --expect-feed=0.2.6`（正式/测试通道各一次）：HTTP 200、`application/json`，清单源版本 0.2.6，公开安装包校验通过。
- 发布后工作区出现并发会话的 0.2.7 构建（`package.json` 与 `release/win-unpacked` 已被更新），本记录只对应已验证并上线的 0.2.6 线上包，不包含该 0.2.7 构建。

## 待办

- 已安装 0.2.5 的机器需通过「检查更新 → 立即更新」升级到 0.2.6 后，测试版登录页的版本行与检查更新入口才会恢复（旧版本仍可扫码登录与使用业务）。
- 真人扫码、手机号验证、账号切换与真实赛事写操作仍需有授权的测试账号验收，不以未登录页烟测代替。
- 网页端 `LoginView.vue` 模板仍写死 `data-desktop-login="true"`；v0.2.6 已不依赖该字段，但该标记语义属于外壳，建议网页侧后续移除，避免再次被误读为“网页已装饰”。
