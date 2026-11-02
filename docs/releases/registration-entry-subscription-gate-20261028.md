# 服务号球员登记「扫码关注」误判修复与差量发布

2026-10-28 服务号球员登记页点「立即生成 100 滴」报红字「请先扫描邀请二维码并关注服务号，再继续登记」的问题已定位并修复，共享后端 `getMiniWorkspace` 以线上包差量方式发布：只改一行关注校验，23:25:00 `$LATEST` 为 Active/Available，回下载 `index.js` SHA-256 `775B73FA` 与发布包完全一致，运行环境 Nodejs18.15 / 512MB / 150s / `InstallDependency=TRUE` 全部保留。`webLoginApi`、`aiPortraitDemo` 与 5 个 H5 文件线上与本地同哈希，本次无需改动。

## 现场证据

用户截图（`www.sxffootball.cn` 球员登记，`service-entry.js?v=20261028-ai-sheet3`）已填身份证、生日、球衣号与位置，AI 形象照弹层「立即生成 100 滴」下方红字，CSS 位置即 `#aiPortraitState` + `.field-error`，说明是服务端错误原文透传，而非页面硬编码文案。

链路：`join-player.html` → `webLoginApi.serviceEntryAiPortraitPrepare` → `getMiniWorkspace.servicePlayerRegistration(authorize_media)` → `playerRegistration.cjs:106` → `loadServiceEntryRegistration`。红字与 `loadServiceEntryRegistration` 的 `ENTRY_SUBSCRIPTION_REQUIRED` 逐字一致；`webLoginApi` 同文案分支的措辞不同（「…再点击登记链接」/「请先关注服务号，再继续登记」），可排除。

发布前回下载线上 `getMiniWorkspace`：`index.js` 258,028 B / `F691CD14`，其中 `if (!scan || scan.subscribed !== true || toTime(scan.expiresAt) <= Date.now())` 仍在，即该误判确实在线。

## 根因

同一份 `service_entry_scans` 记录被三处以不同口径校验：

- `serviceAccountCallback.recordServiceEntryScan`：`expiresAt = min(now + 30 分钟, gate.expiresAt)` —— 这是**扫码链接自身的新鲜度**；
- `webLoginApi.service-entry.js#sessionFor`、`serviceRegistrationRecovery.scope`（继续登记恢复）：只校验 `scan.subscribed === true`；
- `getMiniWorkspace.loadServiceEntryRegistration`：额外把 30 分钟的 `expiresAt` 当成会话有效期一起判。

而登记会话本身是 **12 小时**（`service_entry_sessions` 与前端 `localStorage` 同口径）。于是扫码超过半小时后：页面能打开、草稿能恢复（所以表单是填好的），但第一次服务端动作就被判成「未关注」。这也解释了为什么红字只出现在 AI 弹层——「继续登记」恢复草稿会直接跳到表单、跳过查找与选择，第一次请求就是点「立即生成」。

## 修复

`cloudfunctions/getMiniWorkspace/index.js` 去掉 `toTime(scan.expiresAt) <= Date.now()`，保留 `scan.subscribed === true`（真实取消关注照样拦），并补注释说明 30 分钟只属于扫码链接。扫码链接的新鲜度仍在 `webLoginApi` 的 `scanFor`（授权回跳）里生效，未放宽。

## 验证

- `node --check cloudfunctions/getMiniWorkspace/index.js` 通过。
- `tools/test-service-entry-registration.cjs` **22/22 通过**；新增两条回归：`扫码链接已过 30 分钟但仍在关注 → 不按未关注阻断`、`扫码记录未关注且链接过期 → 仍按未关注阻断`。
- 反向验证：把旧判断临时还原后跑同一用例为 21/22，新增用例 FAIL，确认用例能抓住该缺陷；随后已还原修复版并复跑全绿。
- 线上回读：`fn code download` 后 `index.js` 与发布包同哈希 `775B73FA`，`ENTRY_SUBSCRIPTION_REQUIRED` 行已无 `expiresAt` 判断；`fn detail` 为 Active/Available，`InstallDependency=TRUE`、512MB、150s、Nodejs18.15 未变（CLI 打印「未找到函数配置，使用默认配置」，但读回显示配置未被覆盖）。
- 线上实际调用 `getMiniWorkspace`（`servicePlayerRegistration/authorize_media` + 全零会话）返回 `ENTRY_SESSION_INVALID`，日志 `loadServiceEntryRegistration (index.js:3083)` 与新版行号一致，说明跑的是修复后的包。
- H5 五个文件（`join-player.html`、`service-entry.js`、`service-entry.css`、`registration-resume.html`、`registration-resume.js`）线上与本地 SHA-256 全同，前端无需再发。
- `aiPortraitDemo` `$LATEST` 与本地 `index.js` 哈希一致，`registrationGenerate/Prepare/Cancel` 仍强制 `transparentOutput=true`、`preserveOriginal=true`，透明成片链路未被本次改动影响。

## 链路测试页（正式页未改动）

验收前置：新增独立页面 `https://www.sxffootball.cn/service-account-h5/registration-ai-test.html`（本地 `service-account-h5/registration-ai-test.html`，5,585 B，SHA-256 `A28CACBA`，线上回读一致），正式 `join-player.html` 与其余 4 个 H5 文件一字节未改。

- 与正式登记页共用同一个 `service-entry.js`、同一套后端，只加两样东西：黄色「链路测试页」提示条、页面底部「接口记录」面板（只记动作名、HTTP 状态、结果码、耗时、错误文案与费用，**不打印任何令牌**）。
- 允许省略 `?entry=`：自动复用本机 localStorage 中有效期最晚的 `sxf_entry_session_<entry>`（同站同源共享），因此在微信里不必手改地址栏；若本机没有登记会话，页面会提示先去「继续登记」页点「继续填写」。
- 成本口径：点「立即生成」= 真实调用一次模型（有成本、不扣蜂蜜）；点「确认使用」= 真实扣蜂蜜并写入球员资料。测试页把这两句写在提示条里，避免误以为预览免费。

## 范围与未做

- 只发布 `getMiniWorkspace` 一个函数，未整包上传本地源码：本地该函数仍含其他会话尚未发布的改动（线上包还缺 `eventValuations.cjs` 等），整包发布会把无关改动推上线，需另行授权后再整体发布。
- 未改价格、未改扣费规则、未改模型配置；未代用户操作账号、钱包或业务数据。
- 线上模型目录当前只下发 `hunyuan35`（混元影像 3.5）并作为默认，属后台 `platform_settings/aiPortraitModels` 的配置状态，非本次代码改动。
- 真实微信「扫码 → 关注 → 登记 → 生成 → 确认使用」仍待用户在手机上完整走一遍验收；未开通/蜂蜜不足时仍应出现原有资金提示，不显示假余额 0。
