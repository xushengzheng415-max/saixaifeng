# 身价自测活动与自由球员登记：Trae 续接交接

2026-10-25 追加：注册后本人球队查询、模糊搜索与待审入队申请已补本地候选；见 `../releases/self-register-team-next-20261025.md`。本交接其余内容为10月24日快照，勿据此覆盖后续任务修改；本轮未发布。

交接日期：2026-10-24。项目：赛小蜂足球。正式仓库：`E:/Documents/sxf-football`。

> 当前完整链路尚未上线。平台看板及相关后端已发布，官网自测页未公开，小程序新登记页未上传。用户要求暂停继续实施，先把未完成工作交给 Trae。本文件不是新的发布授权。

## 1. 先看这几个结论

- 不要从头重做：自测 H5、登记页、建队后邀请按钮和运营看板已有代码。
- 用户明确选择：**补齐自由球员登记，再一起开放完整链路**。
- 用户明确选择：**等小程序其他改动收口后，再隔离上传**。当前有大量其他任务的未提交修改，禁止整包贸然上传。
- 现有固定公网服务器签名桥已经接通。之前微信 `40164` 的问题，在本活动签名链路已绕开，不必再让用户开云函数固定出口。
- 注册成功不代表已领卡、已入队或取得参赛资格；这些环节尚未全部接完。
- 公众号文章尚未设置本活动“阅读原文”。不要重复建草稿，更不要自行发表。

## 2. 用户确认的产品链路

公众号文章 → 不登录先自测 → 查看生涯身价估算 → 分享给朋友继续测。

结果页主操作“保存并提升身价” → 手机号认证 → 登记/认领本人球员档案 → 领取自己的球员卡 → 加入已有球队，或去小程序创建球队 → 建队后邀请队员 → 服务号查看自己的资料。

“我只是玩玩”为次操作，可以再给一次简短的留存引导，然后允许直接退出。不能强迫注册、加队或关注。

球队尚未存在时，用户要求直接进入小程序创建球队页。创建者管理自己新建的球队；不能因为某人先填了已有球队名称，就让其取得该球队管理权。加入已有球队继续走有效邀请和管理者确认。

### 文案与问卷

- 自测标题：**踢了这么多年球，你知道自己身价多少吗？**
- 卡面：初始 `¥?`；结果动态显示金额；名称“生涯身价”，同时明确“自测估算”，不是正式身价或转会报价。
- 未成年人不展示金额估值。
- 年龄、身高、体重、位置、球龄；年比赛数量、表现、出场稳定、成长与荣誉等。
- 参赛类型多选：省级、市级、商业、区县、没参加过；“没参加过”与其他选项互斥。
- 正式比赛常见几人制、平时约球常见几人制分开询问：5/7/8/11/其他/未参加。
- 身高体重和赛事类型当前只展示/采集问卷用途，尚未接入自测金额计算，不要写成已经影响身价。
- 自报数据不能进入正式比赛统计、竞技积分、球员卡等级或真实榜单。

## 3. 当前状态表

| 部分 | 当前状态 | 尚缺什么 |
|---|---|---|
| 本地动画自测原型 | 可预览 | 原型不是正式公网入口 |
| 正式 H5 候选源码 | 已准备，未上传 | 清理模拟分支、微信真机、分享与全链路验收 |
| 匿名互动上报/看板摘要接口 | 已部署 | 限流、口径校准、真实运营账号验收 |
| 平台营销看板 | 已发布正式站 | 真账号正向验收；后续多活动扩展 |
| 自由球员登记后端 | 已部署 | 并发防重、历史认领、编号等完善 |
| 自由球员登记小程序页 | 本地编译预览成功 | 隔离上传、体验设置、审核与正式发布 |
| 建队成功“邀请队员入队” | 本地实现 | 随小程序发布并真实邀请验收 |
| 自由球员领卡、建队后本人入队 | 未闭环 | 不能以成功提示代替业务完成 |
| 固定服务器微信 JS 签名桥 | 已接通 | H5 正式域名下真机唤起仍待验证 |
| 阅读原文 | 未设置 | 等正式完整链路可用后再设置 |

## 4. 精确文件清单

以下路径均相对正式仓库；相同文件可能还有其他任务修改，接续时必须逐段核对 diff。

### H5 正式候选（均未公开）

- `service-account-h5/valuation-self-test.html`
- `service-account-h5/valuation-self-test-next-step.js`
- `service-account-h5/valuation-self-test-next-step.css`
- `service-account-h5/valuation-self-test-analytics.js`
- `service-account-h5/valuation-self-test-wechat.js`

预定正式地址：`https://www.sxffootball.cn/service-account-h5/valuation-self-test.html`。

主操作通过微信开放标签跳：`pages/player-self-onboard/index.html?from=selftest&sid=<匿名会话UUID>`。
建队目标：`pages/onboarding/onboarding.html?step=team&from=selftest`。
球队端 AppID `wx57164cca8676f411`；原始 ID `gh_d58816f3de7c`。路径及动态开放标签必须在真实微信环境验证，浏览器模拟通过不能代替。

### 小程序（未上传）

- 新增：`miniprogram/pages/player-self-onboard/index.js`、`index.wxml`、`index.wxss`、`index.json`。
- `miniprogram/app.json`：登记新页面。
- `miniprogram/pages/login/login.wxml`：登录适用角色文字包含球员。
- `miniprogram/pages/onboarding/onboarding.js`：`inviteTeamPlayers` 跳转 `/pages/team/player-invite/player-invite?teamId=<新队ID>`。
- `miniprogram/pages/onboarding/onboarding.wxml`：建队成功主操作邀请入队。
- `miniprogram/config/release.js`：本地版本改为 `1.2.19`；**未上传**。继承的“体验版”字样不是已经生效的证据。

登记页调用 `getMiniWorkspace` 的 `selfPlayerProfile`、`registerSelfPlayer`。需要手机号时返回已有登录流程，携带返回路径与匿名 sid。本人/监护人登记区分；成功后是待完善档案，不是已发卡。

### 后端与看板

- `cloudfunctions/webLoginApi/marketingSelfTest.cjs`：上报、去重、汇总。
- `cloudfunctions/webLoginApi/index.js`：三个 marketing action；本文件有其他任务修改。
- `cloudfunctions/getMiniWorkspace/selfPlayerOnboard.cjs`：自由球员登记与成功事件。
- `cloudfunctions/getMiniWorkspace/index.js`：两个登记 action 分发；有其他修改。
- `cloudfunctions/tournamentRegistrationFlow/index.js`：`marketingSelfTestWxSignature` 调现有固定服务器桥；有其他修改。
- `ops/wechat-football-bridge/server.js`：新增 `js-signature`。
- `platform-admin-vue/src/views/marketing/SelfTestDashboard.vue`。
- `platform-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`：营销活动入口。
- `tools/test-marketing-selftest.cjs`、`tools/test-free-agent-onboarding.cjs`、`tools/test-registration-onboarding-routing.js`。

### 原型、文章与发布证据

- `work/wechat/2026-10-23-valuation/self-test-preview.html`：动画原型，非正式入口。
- 同目录 `self-test-next-step.js/.css`：原型模拟注册链路，不要用于正式注册。
- 同目录 `preview.html`：文章预览，**不是自测页**。
- 同目录 `article-review-v2.txt`、`article-body.html`、`draft-receipt.json`、`upload-ready/`：文章与已有草稿回执。文章题为“赛小蜂足球，身价模式上线”。不要盲目重跑旧构建器覆盖当前文章。
- `docs/releases/marketing-selftest-20261024.md`：分阶段发布记录。
- `work/marketing-selftest-20261024/`：本次临时线上包、回读包和小程序预览证据，仅供比对，不是后续部署基线。

## 5. 已发布内容与回读边界

### 平台运营中心

正式 `https://pingtai.sxffootball.cn/`；直接看板 `https://pingtai.sxffootball.cn/#/tournament-center-admin?section=marketingSelfTest`。

最后回读版本：提交 `7be9c4cc4e4913430eb0443722c2740c8a2e7f74`，发布 `20261024080258-7be9c4cc`，分支 `codex/platform-ops`。部署时 27 个资源摘要一致。此前提交 `c20671f7` 为初版看板。仅平台所有者可查询摘要；真实所有者账号正向读取未独立验收。

### 云函数

- `webLoginApi`：活动 action 和签名 relay 已上线。交接前查到 **18:03:04 又有更新**，营销 action 仍在；因此本次 17:06 的下载包已经不是最新生产包。后续必须重新下载，禁止覆盖其他任务新发布内容。
- `getMiniWorkspace`：本次登记模块上线时间 15:57:14；Active/Available。回读 5,926 文件仅依赖锁文件许可证元数据差异，依赖版本未变。
- `tournamentRegistrationFlow`：签名桥 action 17:00:29 更新；Active/Available。回读 6,403 文件，仅 `node_modules/.package-lock.json` 元数据差异，入口一致。`InstallDependency` 当前为 FALSE，曾被发布工具改变后已恢复；不得再随意切换。
- 本次 `webLoginApi` 17:06 包回读 6,584 文件，亦仅上述锁文件元数据差异，入口一致。这个结论不代表 18:03 包已经逐文件验收。

这些是当时回读快照，Trae 接手后需重新查现状，不应当作永久当前值。

### 固定公网服务器签名桥

沿用现有轻量服务器 `124.221.239.63`，并非另开普通远程开发环境。

链路：H5 → `webLoginApi.marketingSelfTestWxConfig` → `tournamentRegistrationFlow.marketingSelfTestWxSignature` → 已有 HMAC 桥 → 微信 access_token/jsapi_ticket。

- 对外既有前缀 `https://api.saixiaofeng.com/wechat/football/v1`。
- 服务 `sxf-wechat-football-bridge.service`，仅监听 `127.0.0.1:8789`。
- 代码 `/opt/sxf-wechat-football-bridge/server.js`。
- 回滚备份 `/opt/sxf-wechat-football-bridge/backups/20261024-selftest-js-signature/server.js`。
- 发布后代码 SHA-256：`d2485bd05a215321125c03a1af45b723cd888f7b4647c472b1dcb76e071ba856`。
- 现有配置 `/etc/sxf-wechat-football-bridge.env`，**禁止打印、复制或写入交接包**。
- 已验证服务 active、health 200、原 HMAC 探针成功、云端到微信签名成功，返回 40 位签名；非允许 URL 被拒绝。
- `/wechat/service-account/js-signature` 对应端口 3300 的另一个服务，不是本桥，不能混改。
- 不需要继续把云函数观察到的动态出口 IP 加白。微信真机 JS 安全域名/开放标签仍须另验。

## 6. 数据与安全口径

集合 `marketing_selftest_events`；活动 `valuation-20261024`；协议 `marketing-selftest/1`。

事件按“活动 + 北京时间日期 + 匿名 sid + 类型”哈希成文档 ID。同会话同日同类型重试覆盖，不是原始点击次数，也不是跨日期去重的真实人数。

公开事件：view、start、complete、share、referral_open、register_intent、mini_create_intent。`register_success` 只能由已认证登记后端写入，客户端不能伪报。建队成功尚未统计，不能用点击建队代替。

完成事件仅留成年/未成年分组、位置、自报赛事类型、比赛与约球几人制。不留姓名、手机号、身份证、准确年龄、身高体重。生产未写入本任务合成球员与互动测试记录。

已创建 day 索引；players 的 linkedUserId、guardianUserId、playerPhone、guardianPhone 非唯一索引创建返回成功，接手后可再 listIndexes 核对。

新档案来源 `self_registered_free_agent`，teamId/teamCode/orgId 为空，profileStatus=pending，identityStatus=not_verified；成人关联已验证手机号主账号，未成年人关联监护人。不得按姓名自动合并，不写正式参赛快照或比赛积分。

## 7. 未完成工作：按优先级接着做

### P0：先补注册与真实身份链路

1. 审核 `selfPlayerOnboard.cjs` 并发防重。当前同 requestId 幂等，但不同 requestId 的并发“先查后写”可能重复创建成人档案；需要事务或稳定身份唯一约束，不以非唯一索引代替。
2. 修复候选查询只取前 3 条、再过滤删除记录的问题；监护人重复判断也不应只看前 3 条。避免静默漏查，按数据中心协议完整查询。
3. 历史档案冲突目前只提示联系平台，尚无完整认领/人工审核入口。已有被监护球员列表虽返回，页面尚未用来选择。
4. 补统一业务编号登记（当前未接 `numbering.afterWrite`）；核验本人/监护权限、跨账号冲突和重复提交。
5. 领卡未实现：不能把“待完善”成功页写成已领取。先读球员卡套件文档，接统一读取/生成与标准形象照流程，不另画正式卡或自行算等级。
6. 新建球队后，账号有管理权不等于其自由球员档案已入队。补本人明确入队/确认逻辑。已有队目前仅提示找领队发邀请，不能宣传成已实现搜索加入。
7. 补服务号个人资料/球员卡返回承接。H5 问卷目前只传 sid，身高体重等没有自动带入登记表。

### P0：小程序发布限制

用户要求其他改动收口后隔离上传。目前新登记页只本地预览成功，`1.2.19` 未上传。此前 `1.2.17` 上传证据见 `docs/releases/1.2.17-guest-login-20261023.md`，不能据此推断体验设置、审核或正式版状态。

本次预览包总计 3,320,542 字节，主包 2,075,229 字节，接近 2 MiB 上限，新增素材要注意体积。先明确获准基线并隔离本任务差量，再编译/上传/设置体验/审核/正式发布，逐状态记录。开放标签跳正式版时，新页不在正式版就无法完成漏斗。

### P1：自测金额、分享与 H5 清理

1. 金额口径（2026-10-25 更新）：已知五维均分 score 先得基础金额 `round((100 + score*14)/10)*10`，再乘以年龄因子（26 岁 1.00 为峰值，45 岁 0.25，50 岁及以后 0.18，青少年 0.90 起、最低 0.75），最低 100 元；年龄档与 `valuation.cjs` 一致。**仍不是正式八因素身价算法**；不能把自评当已核验生涯数据。全未知、极端值、未成年人、缺失值必须专项测。
2. 正式 next-step.js 仍有不可达模拟选队/建队分支，删除或隔离，防止假注册、假成功。
3. 微信分享不能依赖浏览器 Web Share。补/验证微信好友与朋友圈分享配置、带回访参数的链接及缩略图。点击分享只算点击，不声称分享成功。
4. 下载结果图目前无可回流二维码；若保留图片传播，补正式自测入口二维码。分享者个人信息应最小化。
5. 清理本地预览专属分享提示、调试演示入口、重复脚本；在 390px 和桌面复测。
6. 真实微信检查 wx.ready、动态 wx-open-launch-weapp、合法域名、取消/失败/返回、sid 穿过登录及注册。

### P1：运营看板与生产防护

1. 真所有者账号正向看板，普通用户/主办方/未登录拒绝，测试数据隔离。
2. 多日合计是每日会话事件之和，不是跨日 UV；修正指标名称。旧 scope 说明可能仍写“注册和建队成功数尚未接入”，应与已接 register_success 对齐。
3. 日查询最多 5,000 行，边界恰为 5,000 时也可能误报超限；完善分页、显式完整度和上限行为。
4. 公开上报接口需考虑限流、防滥用、保留期限。不要扩采真实个人资料。
5. 活动 ID 目前写死；未来“营销活动”下多个活动卡片、配置/活动切换尚未实现，不要宣称已是通用活动平台。

### P2：最后才开放官网与文章入口

完成以上关键链路及微信真机验收后，才发布这 5 个正式 H5 文件，回读 HTTP/摘要，按已登记目标同步测试端；不要猜测新测试地址。再把现有公众号草稿“阅读原文”设为正式自测地址。先读现有回执确认草稿，不重复创建，不擅自群发。

## 8. 接手验证命令与已通过范围

先阅读 `AGENTS.md`、`docs/PRODUCT_RULES.md`、`docs/CURRENT_STATUS.md`、`docs/data-center/README.md`、`CONTRACT.md`、`INTEGRATION.md`。涉及卡片再读 `docs/PLAYER_CARD_INTEGRATION.md`、`PLAYER_CARD_EDITOR_HANDOFF.md`、`docs/data-center/PLAYER_CARD_POINTS.md`。

```powershell
git status --short
git branch --show-current
node tools/test-marketing-selftest.cjs
node tools/test-free-agent-onboarding.cjs
node tools/test-registration-onboarding-routing.js
node tools/check-referee-backend-package.cjs <实际准备发布的webLoginApi目录>
```

前三项已通过；登记路由测试 5/5。但当前没有注册并发测试，也没有真实手机号注册→领卡→建队→邀请→服务号完整验收。浏览器隔离测试只验证打开/开始/完成上报字段、390px 无溢出；模拟 SDK 验证标签路径，不等于微信真机成功。

微信开发者工具位于 `d:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat`。本次成功 preview 的 project 是 `E:/Documents/sxf-football/miniprogram`，不是仓库根目录。证据 `work/marketing-selftest-20261024/mini-onboard-info.json` 与 `mini-onboard-qr.png`。

若当前 shell 没有 node，可使用：`C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。

## 9. 发布与协作红线

- 当前 `codex/platform-ops` 工作区大量脏改动，多数不是本任务。平台独立工程与分支不能整体并入 main；共享后端和小程序按各自流程处理。
- 新增文件多数尚未提交；换机器/切 worktree 前先明确保存这份清单涉及代码，不要只带走 Markdown 就认为代码也已移交。
- 不执行 reset/checkout 清理，不整包覆盖云函数。不复用 work 下旧包发布；先下载当下线上包，做最小差量并核验裁判表守卫。
- 保留云端环境配置、依赖安装设置及其他任务接口。密钥、令牌、验证码、私钥不读出、不打包、不提交。
- 足球云环境 `cloud1-7g8ckb3c7815a011`；CLI 使用足球账号 launcher，不切全局 tcb 登录。
- 正式发布后按项目规则同步对应测试端，分别记录；上传≠体验版生效≠审核≠正式发布。
- 隔离合成数据，不把假球员/比赛写入真实统计、积分、卡片或排行榜。

## 10. 交付验收清单

- [ ] 不登录完成自测；缺失/未成年/异常数据处理正确。
- [ ] 微信分享与朋友回流有效，结果图片能引回活动。
- [ ] 自愿注册，手机号主账号唯一，重复/并发/历史档案/监护情况不造重复人。
- [ ] 正式球员卡真实可读，未完成状态不伪装完成。
- [ ] 新队创建后本人归属正确，可邀请另一真实测试身份并完成确认。
- [ ] 已有球队不能被名称认领夺权，服务号能查看本人资料。
- [ ] 看板正确区分点击、注册成功、建队成功与统计完整度。
- [ ] 小程序、H5 正式与已登记测试入口逐项回读；公众号阅读原文最后设置。
- [ ] 发布记录与知识库同步，保留其他任务修改。

## 给 Trae 的开始指令

先读本文件与仓库 AGENTS.md，核对当前源码/线上状态。优先修自由球员登记防重和真实领卡入队缺口，再完善微信分享与真机链路；先给出明确差量范围，不上传当前混杂小程序包，不重新配置已有固定服务器签名桥。遇到身份/球队管理权或身价算法的新规则，先找用户确认，不用页面默认值替代业务决定。
