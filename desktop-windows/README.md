# 赛小蜂足球 Windows 客户端

客户端为主办方 PC 后台的联网客户端，使用现有正式网页与云端接口。没有复制数据库、机构权限、统计规则或登录逻辑，不提供离线业务写入。网页功能随服务器更新；外壳支持检测新版、显示标识、手动下载并校验安装包，用户退出后运行安装包升级，不自动执行安装。

## 开发与打包

在本目录执行：

```powershell
npm ci
npm start
npm run start:preview
npm test
npm run smoke
npm run build
node scripts/smoke.cjs --packaged
node scripts/smoke.cjs --packaged --preview
node scripts/create-manifest.cjs
```

当前安装包为 `release/SxfFootball-Setup-0.2.8-x64.exe`，解包运行程序为 `release/win-unpacked/SxfFootball.exe`。仅支持 Windows 10/11 x64。构建不上传网页或部署云函数，也不触发任何应用商店发布。升级时先退出旧客户端，再运行新安装包覆盖安装；保留原登录资料。

本地版本未配置发布者代码签名证书；不得将其称为已签名发行包。面向外部分发前应配置组织的代码签名和验证发布者信息。依赖通过锁文件固定，不读取仓库外云凭据。

## 使用

- 默认打开 `https://www.sxffootball.cn/admin/`；微信扫码、手机号确认和业务权限沿用网页流程。
- 菜单「赛小蜂足球 → 切换测试版」重启到 `https://www.sxffootball.cn/preview/admin/`；该次运行的窗口标题标明测试版。普通启动仍默认正式入口。
- 测试前端仍连接正式后端，验收写操作只可使用明确的隔离测试数据。
- 正式与测试资料分别保存于 `%APPDATA%/SxfFootball`、`%APPDATA%/SxfFootball-Preview`。退出账号仍使用网页的退出入口，关闭窗口不等于退出账号。
- 下载沿用网页导出逻辑并弹出 Windows 保存对话框；取消保存不产生业务写入。上传使用系统文件选择器。
- Ctrl+R 刷新/断网重试，Alt+Home 返回首页，Ctrl+P 打印，F11 全屏。打印弹窗继续受沙箱隔离。
- 卸载保留当前 Windows 用户的登录资料；共用电脑请先在页面退出账号。

## 安全边界

远程页面关闭 Node.js，启用 sandbox、contextIsolation 与 webSecurity，没有 preload、IPC 文件访问桥或网页 CloudBase SDK。主窗口仅允许正式网站与微信 OAuth 连接路径导航；外部 HTTPS 网站经确认后转系统浏览器，拒绝外部自定义协议。系统权限默认拒绝；已有文件选择器不受影响。

2026-10-27 用户提供现成竖版 LOGO，源文件为 `E:/Documents/saixiaofeng_football/logo文件/竖版.png`（4167×4167，透明 PNG），原样保存在 `assets/brand-original-vertical.png`。登录页使用完整的原图形、中文标准字和 FOOTBALL，去除重复的手写品牌名；应用小图标从同一高清源图取蜂与足球，等比适配浅薄荷绿容器。`scripts/build-brand.py` 可复现 PNG/ICO、透明与深色版本、小尺寸及预览，来源 JSON 记录原图摘要。安装包仅包含运行所需尺寸，不重新描画标志、不冒充矢量母版，也不打包其他任务或凭据。

随后用户指定 `E:/Documents/saixiaofeng_football/logo文件/方形.png` 作为应用图标源，并要求四角更圆润。v0.2.2 起图标以 `assets/brand-original-square.png` 的原图缩放，圆角半径为边长22%，圆角外透明，保留原蜂、足球和蜂巢背景；替代前述浅绿底图标。登录页仍用完整竖版标识。

## 更新标识与发布入口

- 窗口标题持续显示当前版本；菜单和登录页可手动检查更新。应用启动时和运行期间每6小时检查一次，关闭应用后不运行后台任务。
- 经验证的新版本会在菜单、登录页页脚显示「可更新」，Windows任务栏叠加更新标识。网络失败不伪装为「已是最新版」，自动检查失败不弹窗打断业务。
- 仅接受官方域名 `/desktop/windows/` 下、与版本号匹配的 x64 EXE，校验清单格式、体积和 SHA-256；下载完成后再校验本地文件，失败时提示用户勿运行，不自动安装。
- 更新清单地址为 `https://www.sxffootball.cn/desktop/windows/latest.json`。2026-10-27用户已明确授权发布此目录。最终发布与读回状态见 `docs/releases/windows-client-0.2.3-20261027.md`；本地较新版本夹具只验证提示样式，不当作线上已有未来版本。
- `node scripts/prepare-publish.cjs` 仅在当前版本两入口打包验证及摘要登记通过后准备 `release/publish-<版本>/`（当前安装包和`latest.json`）；此命令不执行云端发布。发布按目录限定，安装包先上传、`latest.json`作为入口最后上传。
- 0.2.1及更早版本没有检查更新代码；0.2.2在真实联网验收中发现Electron响应URL兼容问题。它们均需先手动覆盖安装0.2.3，后续才能正常接收提示。更新清单的未来发布和每个新安装包上架均需按项目规则明确授权、回读HTTP与SHA-256。
- Electron的`net.fetch`可能返回空的`Response.url`。0.2.3固定请求官方HTTPS清单并禁止重定向；URL非空时额外核验来源，不能把空URL误报为离线。复验命令：`node scripts/probe-published-updates.cjs`及加`--preview`，直接运行包内检测器并校验已下载的线上安装包。

## v0.2.8 后台下载 + 重启静默更新

启动与定时检查（约每 6 小时）发现更高版本后，自动在后台下载并校验安装包，任务栏显示进度；不必先点「检查更新」。下载完成后弹出「更新已准备就绪」，点「立即重启更新」后客户端关闭并由 NSIS `/S` 静默覆盖安装、自动重新打开——用户侧不再走安装向导。点「稍后」仍可从菜单「重启更新」或登录页入口继续。烟测不触发真实下载。

## v0.2.7 「页面 → 刷新」同址强制重载

测试频道业务页（Vue hash 路由）下，旧版「页面 → 刷新」对当前同址再 `loadURL`，Chromium 常常不真正整页刷新，看起来像没反应。v0.2.7 在站内同址改用 `reloadIgnoringCache()`；断网错误页与 OAuth 一次性 code 回退仍走带 no-cache 头的入口导航。Ctrl+R 同步该逻辑。

## v0.2.6 登录页同时兼容新旧网页（测试版匹配）

PC 测试端（`/preview/admin/`）登录页已改为新版浅色分栏布局：页面自带 `.login-brand` 品牌栏、「微信扫码 / 手机号登录」选项卡，刷新按钮在登录面板内。v0.2.6 之前的外壳依赖旧结构 `.qr-panel` 与网页写死的 `data-desktop-login` 标记，网页一更新就跳过装饰，导致版本行、检查更新入口与二维码状态提示消失。

v0.2.6 的处理：

- 装饰状态改用外壳自身标记 `sxfDesktopDecorated`；网页即使写死 `data-desktop-login` 也不会阻断注入。
- 页面已有 `.login-brand` 时不再插入外壳品牌，避免两套品牌重复；旧版页面仍按原样插入。
- 登录面板按 `.qr-panel` → `.wechat-login-panel` → `.login-auth` 依次兜底；页面已有 `.login-tabs` 时不再补标题和提示。
- 二维码状态框统一挂到 `.qr-shell`；「刷新二维码」按钮统一查找 `.login-card .retry`，新旧位置都能点击。
- 页脚挂到 `.login-overlay`（没有时退回卡片父级），保证版本行与「检查更新」始终存在。

发布约束：PC 测试版（`/preview/admin/`）发布前后各跑一次 `node scripts/smoke.cjs --preview` 与 `node scripts/smoke.cjs`，两条通道都 8 项通过才算网页与客户端匹配；只看到网页更新而客户端装饰缺失，视为未完成。

## v0.2.0 登录页与连接修复

客户端在可信的官方 `/admin/`、`/preview/admin/` 文档中加载本地 `login.css` 与 `login-page.js`，只整理登录页结构、品牌展示、二维码加载/刷新状态与排版。微信页面仅调整样式；扫码 URL、state、回调、手机号验证、账号切换、会话写入和权限规则仍由线上既有流程处理，没有另建认证入口或本地文件 IPC。纯网页登录外观不随安装包改变，也没有部署网页或云函数。

旧版把 `did-start-navigation` 的站内 hash 路由变化也启动了 30 秒整页超时；该类变化不触发新的 `dom-ready`，导致已经可用的页面稍后被错误页覆盖。v0.2.0 的 `connection.cjs` 只为真正的主文档导航计时，忽略同文档路由、子框架失败与主动取消；真实连接失败保留错误码，并从当前入口重试，不重放一次性 OAuth code。

错误页显示错误码；「帮助 → 复制连接诊断」只复制版本、正式/测试入口和最近错误。用户资料目录下的 `connection.log` 最多保留 50 条时间、错误码、域名和路径，排除 query/hash、手机号、账号ID和令牌。二维码显示较久会提示刷新，不把本地提醒当成微信服务端的失效判定。

## 验收范围

自动烟测使用独立临时登录资料，读取线上未登录页面、确认微信 QR 图片、验证二维码刷新和本地刷新提醒、验证渲染器隔离、1024px 布局与同文档路由超时回归、导出本地合成文件、打印合成 PDF、模拟连接错误及恢复。结果、截图位于 `test-output/production` 与 `test-output/preview`。烟测不登录真实账号、不访问赛事私有资料、不调用业务写接口。

真人扫码、手机号绑定、登录切换、跨机构拒绝、真实赛事导出/上传与实体打印机仍需有授权的测试账号验收，不以未登录页或合成文件验证代替。
