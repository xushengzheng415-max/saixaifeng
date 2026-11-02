# 身价自测营销活动：分阶段发布记录

日期：2026-10-24。活动入口规划为公众号文章“阅读原文”至足球官网 H5；平台运营中心采用“营销活动 → 自测身价”栏目，预留其他活动入口。用户现要求转交 Trae 继续，完整未完成项见 [续接交接](../handoffs/SELF_TEST_MARKETING_TRAE_2026-10-24.md)。官网未公开，小程序新页未上传。

## 已正式完成

- 平台运营中心：初版提交 `c20671f7`；最新回读提交 `7be9c4cc4e4913430eb0443722c2740c8a2e7f74`，发布 `20261024080258-7be9c4cc` 至 `https://pingtai.sxffootball.cn/`，补登记成功统计。独立发布脚本回读 27 个资源 SHA-256 一致。
- 共享后端 `webLoginApi`：以当时刚下载的线上包为基线，仅增加 `marketingSelfTestEvent`、`marketingSelfTestSummary`、`marketingSelfTestWxConfig` 三个 action 和 `marketingSelfTest.cjs`。2026-10-24 14:40:42 更新后 Active/Available；下载回读 6,584 个文件，除 `node_modules/.package-lock.json` 许可证元数据外均与拟发布包一致，147 个依赖版本未变。裁判表包检查通过。
- 数据库集合 `marketing_selftest_events` 与单字段 `day` 索引已创建。创建后只读查询为 0 条，无合成测试记录进入生产统计。
- 匿名无效事件返回 `SELFTEST_EVENT_INVALID`；未登录读取运营摘要返回 `PLATFORM_OWNER_REQUIRED`；非允许域名的微信 JS 签名请求返回 `SELFTEST_URL_INVALID`。这三项为只读或拒绝探针，没有写入测试数据。

## 追加发布回读与限制

- JS 签名改走既有固定服务器桥：webLoginApi → tournamentRegistrationFlow → api.saixiaofeng.com 既有 HMAC 服务。签名探针成功，非允许 URL 拒绝；不再依赖 CloudBase 动态公网出口直接取微信令牌。服务器代码已备份，未新增凭据或开放普通终端。
- tournamentRegistrationFlow 17:00:29 包回读 6,403 文件，webLoginApi 17:06 包回读 6,584 文件，均仅 node_modules/.package-lock.json 元数据差异，入口一致。前者 InstallDependency 已恢复 FALSE。
- 交接时 webLoginApi 已由其他更新到 18:03:04，活动入口仍在；17:06 临时包不是最新部署基线，后续必须重新下载。
- 小程序仅本地 preview 编译成功，1.2.19 未上传。用户明确要求等其他修改收口，再隔离上传；不得把本地 release 文案当上传证据。

## 数据口径说明

`marketing-selftest/1` 固定活动标识 `valuation-20261024`。按随机匿名会话、北京时间日期、事件种类生成幂等文档 ID；每日同会话同事件只计一次。事件：打开、开始、完成、点击分享、分享链接回访、点击去注册、点击去建队。完成事件只保存成年/未成年分组、场上位置、自报赛事类型、正式比赛几人制及约球几人制；不保存姓名、手机号、身份证、准确年龄、身高或体重。

看板展示匿名会话数和自报分布。点击去注册、点击去建队与实际注册、实际建队是不同业务状态。2026-10-24 补充：经小程序手机号主账号认证的新球员登记成功，由 `getMiniWorkspace/selfPlayerOnboard.cjs` 服务端记 `register_success`；公开事件接口拒绝客户端直接上报该事件。建队成功数仍未接入，不得将入口点击写为建队成功。自测经历不进入正式赛事、球员卡积分、身价评级或排行榜。

## 2026-10-24 续接（Trae）：登记防重与建队后本人入队

用户授权本次 `getMiniWorkspace` 差量部署；小程序仍不上传。

- `selfPlayerOnboard.cjs`：档案文档 ID 改为由账号（未成年人按监护人＋姓名＋生日）稳定派生，不同 requestId 的并发提交落同一档案；候选查询完整分页、超上限显式报错；同手机号同人档案已关联其他账号时阻断人工核对；建档后调用统一编号 `afterWrite`。线上包以 19:55 前下载的线上包为基线，仅叠加该文件（5,926 文件），后回下载比对仅 `node_modules/.package-lock.json` 元数据差异、模块 SHA 一致。
- 新增 `selfPlayerTeam.cjs` 与 `selfPlayerJoinTeam` action（index.js 仅加 1 行分发）：账号管理球队不等于球员档案已入队，需本人明确点击才把本人（或明确 `playerId` 的监护档案）加入自己管理的球队；已属其他球队拒绝迁移，重复提交幂等；只写归属字段、`player_team_history`（`joinSource=self_created_team`）与球队登记版本号，不改资料核验、卡片等级或参赛资格。第二次差量部署（5,927 文件）回下载同样仅锁文件元数据差异，`index.js`、新模块 SHA 一致；无登录上下文探针返回 `WORKSPACE_LOAD_FAILED`，未写入任何生产球员。
- 小程序：`pages/onboarding/onboarding` 建队成功页新增「把我的球员档案加入本队」明确入口（未上传，随 1.2.19 走版本流程）。
- 本地验证：`test-free-agent-onboarding.cjs`（并发幂等、历史冲突、全量候选）、`test-self-player-team.cjs`（明确入队、幂等、跨队拒绝、权限与球队范围、监护选择）、`test-registration-onboarding-routing.js` 5/5、`test-marketing-selftest.cjs`、`test-data-center.mjs`、`sync-data-center --check`、`check-data-governance` 全部通过。

## 2026-10-24 续接（二）：历史档案认领入口

用户选择优先补 P0「历史档案认领/人工审核入口」；后端在同一授权范围内再次最小差量部署，小程序仍不上传。

- `selfPlayerProfile` 新增 `claimable`：只列出与本机已验证手机号一致、且完全无归属的历史 `players`，姓名脱敏（首字＋末字），附出生年份、位置、是否在队；已绑定其他账号的档案不列入。
- 新增 `claimSelfPlayer` action：本人或监护人明确选择后只补归属字段，事务内复核档案仍无归属；保留原稳定 `playerId`、球队、`currentHistoryId`、比赛历史、资料核验与卡片等级；登记手机号与当前验证手机号不一致时拒绝；已绑定他人账号转人工核对，不自动换绑、不按姓名或手机号合并。
- 小程序登记页：未登记时展示「可能属于你的历史档案」并可明确认领；已登记时展示本人与已监护档案，建队前必须选择一份入队（多份时无默认，避免随意挑一份），选择随 `joinPlayerId` 传入 `pages/onboarding`，再交给 `selfPlayerJoinTeam`。
- 部署：先下载当下线上包作基线，仅叠加 `selfPlayerOnboard.cjs`，并在线上 `index.js` 副本补 `claimSelfPlayer` 分发；回下载 `getMiniWorkspace-readback3` 与部署包目录文件数一致（差异 0），`index.js`、`selfPlayerOnboard.cjs`、`selfPlayerTeam.cjs`、`data-center/numbering.cjs` SHA-256 全部一致；`fn detail` 显示部署完成、修改时间 2026-10-24 20:20:52，两个环境变量、512MB 与 150s 未变。
- 本地验证：`test-free-agent-onboarding.cjs` 新增认领用例（本人认领、幂等、绑定他人阻断、手机号不一致拒绝、已有本人档案不再认领第二份、监护人认领孩子）全部通过；`test-self-player-team.cjs` 通过；页面状态机用临时脚本核对候选列表、单选默认、多份档案必须选择、再进入保留选择。小程序三个文件仍未上传。

## 2026-10-24 续接（三）：自测 H5 发布正式站

用户确认公众号草稿文章已写好，并授权把自测 H5 发布到正式站。

- 发布文件（5 个，逐文件上传，未整目录覆盖）：`valuation-self-test.html`、`valuation-self-test-next-step.css`、`valuation-self-test-next-step.js`、`valuation-self-test-analytics.js`、`valuation-self-test-wechat.js`。
- 正式地址：`https://www.sxffootball.cn/service-account-h5/valuation-self-test.html`；回读 5 个文件均为 200，原始字节 SHA-256 与本地一致。
- 修正开放标签路径：`pages/player-self-onboard/index.html` 与 `pages/onboarding/onboarding.html` 去掉 `.html` 后缀，改为标准页面路径后重新上传并回读一致。此前带后缀的写法会导致“页面不存在”。
- 微信分享配置走已上线的 `marketingSelfTestWxConfig`，事件走已上线的 `marketingSelfTestEvent`；本次未写入测试事件，避免污染看板计数。
- 文章“阅读原文”由用户在公众号后台填写；后台 token 链接不入库。**限制：开放标签只能打开已发布的小程序页面，1.2.19 未上传、正式版未发布，所以文章在正式版上线前不宜群发。**

## 2026-10-24 续接（四）：小程序 1.2.19 开发版本上传

用户确认继续上传体验版，使用微信开发者工具 CLI（账号已登录）上传开发版本，未提交审核、未设置体验版、未发布正式版。

- 回执：AppID `wx57164cca8676f411`，版本 `1.2.19`，总包 3,327,902 字节，主包 2,082,589 字节（上限 2,097,152，余量约 14.5KB），其余分包保持基线。证据见 `.codex-artifacts/mini-1.2.19-selftest-20261024/upload-1.2.19.json`。
- 本任务差量：`pages/player-self-onboard`（新增）、`pages/onboarding` 成功页入队入口、`app.json` 路由、`config/release.js` 版本号。
- 如实说明：当前工作树还含今日其他任务的赛事数据/记分表页面与 `pages/login/login.wxml` 改动，已随整包上传；如需完全隔离需另行比对，不能把本次回执当作只含自测登记改动。
- 待办：在微信公众平台“版本管理”把 1.2.19 设为体验版并添加体验成员；真机验证手机号登录→登记/认领→建队→本人入队；通过后再提交审核，正式版发布后才可群发公众号文章。

## 2026-10-24 续接（五）：结果页「保存并提升身价」点击卡死修复

用户反馈结果页「保存并提升身价」点击无响应。定位为 `valuation-self-test-wechat.js` 自身死循环：`MutationObserver(render).observe(stage,{childList:true,subtree:true})` 监听整棵子树，而 `render()` 内部会写 `#register-mini-status` / `#mini-create-error` 的 `textContent`，每次写入又触发 observer，形成无限循环；点击按钮切到「注册球员」视图（`#next-stage` 出现 `#register-mini-slot`）后即开始循环，主线程被占满，表现为按钮“点不动”、页面卡死。浏览器自动化在该页面点击后同样持续超时，与该结论一致。

- 修复：`render()` 增加重入保护；`MutationObserver` 只监听 `stage` 自身 `childList`（视图切换），不再 `subtree`；状态文案改 `setStatus`，内容相同不重复写入。
- 缓存：`valuation-self-test.html` 里 4 个本地资源引用加 `?v=20261024c`，避免微信 WebView 继续用旧脚本。
- 发布：`valuation-self-test.html`、`valuation-self-test-wechat.js` 两个文件重新上传，正式域名回读原始字节 SHA-256 与本地一致，`childList:true})` 与 4 处版本参数均在线。
- 未完成验证：浏览器自动化环境在点击后命令超时，无法取回点击后的 DOM 状态；本次修复依据代码与已复现的卡死现象，仍需微信真机再点一次确认。若微信内仍是旧页面，请在公众号阅读原文链接后加 `?v=20261024c` 或清理微信缓存后重进。

## 2026-10-24 续接（六）：线上 webLoginApi 缺失营销接口，最小差量补齐

用户截图显示注册视图只有文字「请在微信中打开本页」，无拉起按钮。实测线上入口：

- `POST webLoginApi {action:'marketingSelfTestWxConfig'}` → `{"success":false,"error":"未知操作：marketingSelfTestWxConfig"}`
- `POST webLoginApi {action:'marketingSelfTestEvent'}` → `{"success":false,"error":"未知操作：marketingSelfTestEvent"}`

即线上 `webLoginApi` 被后续发布覆盖成了不含营销接口的版本：签名拿不到，`wx.config` 不会成功，开放标签不渲染；自测事件也全部丢弃，看板无数据。

- 修复：下载当下线上包作基线，只在 `index.js` 的 `publicDataCenter` 分支后插入 `marketingSelfTestEvent`／`marketingSelfTestSummary`／`marketingSelfTestWxConfig` 三个 case，并补 `marketingSelfTest.cjs`（仅依赖 `node:crypto`）。
- 校验：两个文件 `node --check` 通过；`node tools/check-referee-backend-package.cjs` 通过，未动裁判表入口。
- 发布：`fn code update webLoginApi --dir <线上基线包>`；回下载 `index.js`、`marketingSelfTest.cjs` SHA-256 与部署包一致；`fn detail` 读回 Nodejs18.15、512MB、超时 120s、修改时间 2026-10-24 21:31:01。
- 复测：`marketingSelfTestWxConfig` 返回 `{success:true,jsConfig:{appId:'wx00918291b0bd8b9e',...}}`；`marketingSelfTestEvent` 返回 `SELFTEST_EVENT_INVALID`（非法事件被拒，入口已加载），未写入任何生产事件。
- 仍待确认（公众号后台，非代码）：服务号 JS 接口安全域名需含 `www.sxffootball.cn`、服务号需已关联 `gh_d58816f3de7c` 对应小程序；否则 `wx.config` 仍会失败，页面继续显示文字提示。

## 2026-10-25 续接（七）：服务号 H5 自助登记上线

用户确认「注册球员都走服务号、建队在服务号/小程序」，并要求打通自测 H5 → 服务号登记 → 小程序建队。线上服务号登记只认邀请二维码（`service-entry.js` 的 `gateByKey` 仅 team_claim_entry / player_invite_entry），`webLoginApi` 的短信登录 actions 已关闭，因此「无邀请自助登记」原本不存在。

- 新增 `service-account-h5/self-register.html` + `self-register.js`：公众号直达，OAuth（snsapi_base）+ 短信验证；表单回填自测页带入的身高/体重/位置与 sid；已绑定账号自动视为已验证；重复手机号、绑定冲突阻断；完成后同页渲染「去小程序创建球队」开放标签。建档仍由 `getMiniWorkspace` 的同一份 `selfPlayerOnboard.cjs` 执行，未另写一套规则。
- 云函数（均以当下线上包为基线只打必要补丁，未整体覆盖）：
  - `webLoginApi`：新增 `selfRegister.cjs`（会话集合 `self_register_oauth_states` / `self_register_sessions`，state 10 分钟、会话 2 小时，短信规则与 `service-entry.js` 一致）与 7 个 action；`marketingSelfTestWxConfig` 的 URL 白名单放开到 `self-register.html`。
  - `getMiniWorkspace`：新增 `serviceSelfPlayerOnboard` 分支与 `selfPlayerH5.cjs`，把服务号会话还原成身份后转交 `selfPlayerOnboard`；服务号 openid 不写入 `linkedOpenId`。
  - `tournamentRegistrationFlow`：`marketingSelfTestWxSignature` 的 URL 白名单同步放开。
- 校验：5 个关键文件 `node --check` 通过；`node tools/check-referee-backend-package.cjs <webLoginApi 基线>` 输出「裁判表识别、分组保存及必要依赖检查通过」。
- 发布与读回：`getMiniWorkspace` 10:10:03、`tournamentRegistrationFlow` 10:10:19、`webLoginApi` 10:12:25（部署完成时间）；回下载三个线上包，`index.js`、`selfRegister.cjs`、`selfPlayerH5.cjs` SHA-256 与部署包逐一致。运行配置读回未变：`webLoginApi` Nodejs18.15/512MB/120s、`getMiniWorkspace` Nodejs18.15/512MB/150s、`tournamentRegistrationFlow` Nodejs18.15/256MB/60s；三者的 `InstallDependency` 均读回 TRUE，与 2026-10-24 交接记录中该函数为 FALSE 不一致，本次发布未显式写入该项，待后续核对。
- H5：`self-register.html`、`self-register.js`、`valuation-self-test-next-step.js`、`valuation-self-test-wechat.js`、`valuation-self-test.html` 共 5 个文件逐个上传（未整目录覆盖），正式域名回读原始字节 SHA-256 全部一致。
- 生产接口读回：`selfRegisterOAuthUrl` 返回 `authorizeUrl`（服务号 appid `wx00918291b0bd8b9e`，redirect_uri 指向 `self-register.html`，state 40 位）；`selfRegisterContext` 对非会话 token 返回 `SELF_REGISTER_SESSION_EXPIRED`；该探针在 `self_register_oauth_states` 留下 1 条 10 分钟后过期的 state 记录，未写任何球员或账号数据。
- 固定出口中转：`ops/wechat-football-bridge/server.js` 的 `js-signature` 白名单原本只允许 `valuation-self-test.html`，`self-register.html` 因此拿不到 `wx.config`。已把白名单扩到两个页面，备份至 `/opt/sxf-wechat-football-bridge/backups/20261025-self-register-js-signature/server.js`，新代码 SHA-256 `894905713a42d2d4e1616bb38c6518493bd206285ecf77a8bc9ab4faf4d761e1`（旧版 `d2485bd0…` 存档），服务 `active`，本地与公网 `/health` 均 `{"success":true}`；两个页面经云端链路均返回 40 位签名，`valuation-self-test.html` 未回退。
- 限制：小程序 `1.2.19` 仅上传开发版本，开放标签只能打开已发布正式版，因此「去小程序创建球队」当前只会回退为文字提示；服务号内 OAuth、短信、认领与建队仍需微信真机验收。本次未提交 Git、未写生产业务数据。

## 尚未开放

- 官网 `/service-account-h5/valuation-self-test.html` 已于 2026-10-24 发布正式站并回读一致；公众号文章草稿由用户写好，“阅读原文”仍待用户在后台填写，小程序正式版上线前不宜群发。
- 现有球队邀请登记页仍只接受球队邀请。新增小程序 `pages/player-self-onboard/index` 与 `getMiniWorkspace.selfPlayerProfile/registerSelfPlayer/claimSelfPlayer`：复用唯一手机号主账号建立未入队球员档案，按本人/监护人关系核验；无归属且手机号一致的历史档案可明确认领，已绑定其他账号的仍只提示人工核对，平台侧尚无认领审核队列与工单页面。1.2.19 开发版本已上传，但体验版和正式版均未生效，不能对公众宣称入口已可用。
- 从服务号 H5 唤起球队小程序所需的签名 action 已上线，开放标签已随正式站 H5 发布（页面路径已去掉 `.html` 后缀）；仍需在微信真机验收打开效果，且目标页面要等 1.2.19 发布正式版后才对普通用户可见。小程序创建成功页的“邀请队员入队”按钮已随 1.2.19 开发版本上传，未设体验版、未发布正式版。
- 平台运营中心负责人真实账号读取看板与微信端分享回访仍待端到端核验。

## 本地验证

- `node tools/test-marketing-selftest.cjs`：匿名事件幂等、字段白名单、按日汇总和无关字段丢弃通过。
- `node tools/test-registration-onboarding-routing.js`：5/5，包括新建球队后跳球队邀请页。
- `node tools/test-free-agent-onboarding.cjs`：本人、监护人、请求幂等与疑似重复档案拦截通过。新增 `players` 的本人/监护人用户和手机号查询索引已建，未写真实球员记录。
- 平台 `npm run build` 与正式发布脚本通过。
- 服务号 H5 浏览器隔离测试拦截请求：打开、开始、完成三类事件携带允许的自报字段；390px 无横向溢出、无页面异常。不将隔离数据发送正式接口。
