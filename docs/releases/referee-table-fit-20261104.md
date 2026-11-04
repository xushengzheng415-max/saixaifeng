# 裁判管理表格一屏显示 + 临时裁判认领短信闸门修复（测试站 + 共享后端）

2026-11-04，用户第二次反馈：平板上裁判管理表格右侧按钮仍被裁；同时提出「添加临时裁判登记时提示没有指派任务、还没注册，怎么指派任务」。本次分两部分处理：PC 测试站表格改为 1024 及以上一屏完整显示、更窄时保留左右滑动；共享云函数 `serviceMatchWorkflow` 修复临时裁判认领的短信闸门，使「先认领、再审核、再指派」的链路可以走通。

## 一、PC 裁判管理表格（测试站 `/preview/admin/`）

### 问题

上一版把表格改为 `overflow:auto` + `min-width:1040px`，宽屏可滚动，但列宽仍把操作列压到 22%，1024 宽度下必须横滑才能看到「操作」列按钮，用户仍觉得「没改过来」。

### 本次改动

仅 `web-admin-vue/src/views/referee/HeadRefereeManagement.vue` 样式：

- `table` 最小宽度 1040px → 940px，1024 宽度不再触发横向滚动。
- 列宽重排为 裁判17% / 等级15% / 执裁能力13% / 可用时间12% / 本届执裁8% / 当前状态10% / 操作24%（首列固定 46px）。
- 单元格内边距 `9px 14px` → `8px 10px`，为操作列让出宽度。
- 保留 `overflow:auto` + `overscroll-behavior-x:contain`，窄于 940px（如 900）时仍然可以左右滑动，不再出现被裁切且无法滚动。

### 验证（隔离数据，拦截全部 CloudBase 请求，不写真实数据）

`E:\Documents\sxf-football\output\referee-table-layout-20261104\result-fit.json`：

| 视口 | 面板宽 / 表格宽 | 面板可横滑 | 操作列按钮在可视区 | 行高 | 行内溢出 |
|---|---|---|---|---|---|
| 1280×800 | 1206 / 1206 | 否 | 15/15 | 70px | 0px |
| 1180×820 | 1106 / 1106 | 否 | 15/15 | 70px | 0px |
| 1024×700 | 950 / 950 | 否 | 15/15 | 111px（按钮换行） | 0px |
| 900×650 | 826 / 940 | 是（左右滑动兜底） | 10/15 可见，滑动后可见其余 | 111px | 0px |

`pageOverflowX` 四个视口全部为 0，`.row-actions` 与能力标签均无溢出。

### 构建与发布

- `VITE_APP_BASE=/preview/admin/ npm run build` 通过（19.39s），`dist` 409 个文件。
- 实测产物：`assets/HeadRefereeManagement-GRIWgmBc.css`（13,852 B，SHA-256 `7836AD54B739C0C31476DC1B889CCD3E0CD3B0F3F1FB37847D1DEBBFCD6570AF`）、`assets/HeadRefereeManagement-BlLoOhoY.js`（45,013 B，SHA-256 `A5E3982DB32810556749ADB0257F2A4682D66E781E48B30E6D2AD4BB5E18B835`）、`index.html`（SHA-256 `599CB9847B1100525654FB87473DDAA3121B1BC18C3DE3C4F80839642E496F64`）。
- `sxf-cloud football run hosting deploy <worktree>/web-admin-vue/dist preview/admin` 成功，409 个文件。
- 线上读回 `https://www.sxffootball.cn/preview/admin/assets/HeadRefereeManagement-GRIWgmBc.css`、`...BlLoOhoY.js`、`/preview/admin/index.html`，三个摘要与本地逐字节一致；CSS 含 `min-width:940px`、`nth-child(8){width:24%`、`padding:8px 10px`，JS 含「重新生成二维码」。
- 正式 `/admin/`、`main` 与平板布局均未在本次发布范围内。

## 二、临时裁判认领「没有指派任务」的原因与修复

### 现象与原因

组委会「添加临时裁判」后，本人扫码进入服务号 H5 认领表单，点「获取验证码」提示「该手机号没有待执行的裁判任务，请联系主办方核对」。

原因是共享云函数 `serviceMatchWorkflow` 的 `sendBindSms` / `verifyBindSms` 只按 `getOperatorAssignmentsByPhone(phone)` 授权：要求 `referees.status === 'approved'` 且存在 `match_referees.canOperate === true` 的场次。而组委会新建的临时裁判是 `status: pending_claim`、尚未绑定微信、也还没有任何指派，于是「要先指派才能验证手机号、要先验证才能被指派」形成死锁。

### 修复

后端在原有指派校验之外，增加一条**邀请授权**分支：请求带 `inviteToken`，且存在 `status: 'active'`、`claimMode: 'temporary_no_certificate'`、`targetRefereePhone` 与本次验证手机号一致的 `referee_invitations` 记录时，允许发送与校验验证码；其余情况保持原有指派校验，普通裁判绑定行为不变。

- 新增 `temporaryRefereeClaimInvite(phone, inviteToken)`、`bindPermissionGranted(phone, inviteToken)`。
- `sendBindSms(openId, phoneValue, inviteToken)`、`verifyBindSms(openId, phoneValue, codeValue, inviteToken)` 改用 `bindPermissionGranted`。
- 主入口改为透传 `event.inviteToken`。
- 服务号 H5 `service-account-h5/app.js` 线上版本本就带 `inviteToken`（本地与线上摘要一致 `D82FE99D877F17558F58CF39F7FA30AEA2BA6C5508EDACCDCCDA6EEAF05E3482`），因此 H5 无需改动、也无需重新发布。

正确的业务顺序因此变为：组委会添加临时裁判 → 本人扫码（验证手机号 + 上传头像）→ 组委会「确认临时执裁」→ 裁判长「指派场次」。

### 发布与读回

- 基线：`sxf-cloud football run fn code download serviceMatchWorkflow <临时目录>` 取线上包（`index.js` 157,458 B，SHA-256 `D86E32FC34C650C116EB54C3E5D3A408EBB49CFC2372A0AF5094B057D1B27490`），只在本包上叠加上述改动，未整包覆盖其他文件。
- `node --check` 通过；与基线 diff 仅包含上述 4 处改动。
- `sxf-cloud football run fn code update serviceMatchWorkflow --dir <临时目录> --deployMode cos` 成功。
- 回下载比对：线上 `index.js` 158,293 B，SHA-256 `776E962E2322A0C31D2C790D6E91863E76101ECDF4B3EDC50011FF5A6635118A`，与上传包逐字节一致（线上包与基线包已存 `E:\Documents\sxf-football\output\referee-temp-claim-20261104\`）。
- 函数配置未变：`Nodejs16.13` / `index.main` / 超时 60s / 内存 256MB / `InstallDependency=TRUE` / 环境变量 3 个，状态 `Active` + `Available`，ModTime `2026-11-04 21:45:56`。
- 仓库内该文件当前位于共享后端工作树（`codex/platform-ops` 检出目录的 `cloudfunctions/serviceMatchWorkflow/index.js`），该工作树同期还有其他会话未提交改动，故本次未单独提交该文件；补丁已在本文记录，线上包也已回下载存档，后续部署须先确认这段闸门逻辑仍在。

## 仍需处理

- 用户需在平板应用内点「刷新」或重开应用，才会加载新的 `/preview/admin/` 资源；若平板打开的是正式 `/admin/`，需要合入 `main` 并单独授权发布。
- 临时裁判认领的短信门禁已在共享正式后端生效，属于线上改动；如要回退，用上文保存的线上基线包重新 `fn code update` 即可。
- `VisualQaHub` 中「裁判管理」跳转仍写作 `/referee/head-referee?tournamentId=…`，实际路由为 `/tournaments/:id/referees`，本次未改。

## 三、正式发布（`/admin/`）

用户 2026-11-04 明确要求「发布正式版」，本次只把平板布局与裁判页两轮修复合入 `main`，不整支 `preview` 覆盖正式（`preview` 上还有执行规则、轻量模式等其他会话改动，未在本次授权范围内）。

- 基于 `github/main`（`eed912b90`）新建 `codex/formal-referee-pad-20261104`，按序 cherry-pick `6747dc727`、`5df740a98`、`35e22bc20`、`57410b920`，无冲突，得到 `fc9148a20`。
- `npm ci` + `npm run build`（默认 base `/admin/`）通过（19.56s），`dist` 407 个文件；`dist/index.html` 只引用 `/admin/assets/`，不含 `/preview/admin/`。
- 产物摘要：`assets/HeadRefereeManagement-GRIWgmBc.css`（SHA-256 `7836AD54B739C0C31476DC1B889CCD3E0CD3B0F3F1FB37847D1DEBBFCD6570AF`）、`assets/HeadRefereeManagement-AN9lk9KU.js`（SHA-256 `22FE1C2E62F47B9C0A408876CA085877C4E91689628ABCC46F184B57EDCA5004`）、`index.html`（SHA-256 `31C610054C66544D0A0B9AFE3C145FFF5460C5A73B367742D504B46B713EF0D6`）。
- `hosting deploy … admin --concurrency 3 --retry-count 8 --retry-interval 3000` 成功，407 个文件。
- 线上读回 `https://www.sxffootball.cn/admin/index.html`、`/admin/assets/HeadRefereeManagement-AN9lk9KU.js`、`/admin/assets/HeadRefereeManagement-GRIWgmBc.css`：三个摘要与本地逐字节一致；入口只引用 `/admin/assets/`；CSS 含 `min-width:940px`，JS 含「重新生成二维码」；`/admin/` 返回 HTTP 200。
- 已推送 `github` 与 `origin`：`main` 由 `eed912b90` 快进到 `fc9148a20`；随后把已发布 `main` 合入最新 `preview`（合并提交 `8353228f8`），`git diff 57410b920..HEAD` 为空，预览内容无变化，无需重发 `/preview/admin/`。

## 四、追补（同日）：1280 宽含侧栏时也一屏显示

用户 2026-11-04 截图反馈：带左侧栏的窗口（侧栏 300px、内容区约 980px）下，表格右侧「操作」按钮仍被裁。复测该场景面板宽 890px，原 `min-width:940px` 需要横滑 50px。

- 表格最小宽度 940px → 820px，列宽与内边距不变。1280×800（侧栏可见）复测：面板 890 / 表格 890、`panelScrollable=false`、`pageOverflowX=0`、无元素超出视口、行高 98px，「查看资料」「能力」「指派场次」全部在面板内（换行两排）。
- 1024×682（侧栏收起）复测：面板 950 / 表格 950、无横滑、行高 111px。
- 预览站与正式站均重新构建发布；正式读回 `index.html` `61A62708…`、`HeadRefereeManagement-DZ02hYGj.css` `D29335C1…`、`HeadRefereeManagement-CRaIwxea.js` `016FAD45…`，与本地构建逐字节一致，`/admin/` 返回 200。
- 证据：`E:\Documents\sxf-football\output\referee-sidebar-fit-20261104\`。