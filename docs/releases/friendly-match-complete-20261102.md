# 发现板块约球系统完善 · 发布清单（2026-11-02）

状态：**本地开发与自检完成，未提交推送、未合并 main/preview、未部署**。
代码分支 `feature/friendly-match-complete-20261102`（worktree `E:\Documents\sxf-football-wt-friendly`，基线 `main e5bbe66a`）。
数据模型与接口口径见 [`../FRIENDLY_MATCH_DATA_MODEL_2026-11-02.md`](../FRIENDLY_MATCH_DATA_MODEL_2026-11-02.md)。

## 一、变更文件

| 文件 | 变更 |
| --- | --- |
| `cloudfunctions/friendlyMatchCenter/index.js` | +1147/−114 行：新增 11 个 action、加固 `createInvite`/`getInvite`/`respondInvite`/`signIn`/`listSignins`/`listTeamInvites`/`listPublicInvites`/`respondPublicInvite`；`healthCheck` 暴露 action 清单、模板路由概览与 `miniProgramSubscribe:'not-enabled'` |
| `cloudfunctions/friendlyMatchCenter/template-fields.cjs`（新增） | 服务号模板字段适配层：`TEMPLATE_DEFS` 每模板一张独立映射表（A 58013 / B 58014）、`clipThing` 20 字截断、`formatInviteTime` 生成 `time2`、`buildDataForTemplate` 统一构造 `data` |
| 通知层（同在 `index.js`） | `TEMPLATE_ID_BY_KEY` + `NOTIFY_SCENE` 显式路由（A：发起/接战/成局/提醒；B：取消/流局），B 未配置时回落 A；`sendTemplate` 改为桥接 `{message:{touser, template_id, url, data}}` 包装、跳转只用 `url`、openid 只认服务号渠道（`serviceAccountOpenId`/`officialOpenId` → `service_identities`），未发送一律计 `skipped` |
| `service-account-h5/friendly-signin.html` | 重写为 H5 报名页（报名 / 查看本人报名 / 取消报名 / 接战） |
| `miniprogram/pages/discover/discover.js`、`.wxml`、`.wxss`、`discover-model.js` | 本队卡进入管理页；三个数字拆分展示，「待确认」口径；公开卡显示服务端状态 |
| `miniprogram/pages/discover/invite-create/invite-create.{js,wxml,wxss}` | canvas 海报（含 H5 报名二维码）、保存相册、复制报名链接、进入管理名单 |
| `miniprogram/pages/discover/invite-manage/*`（新增） | 球队端管理页：名单分页筛选、勾签到/取消签到、代签、移除报名、成局/取消/流局、现场提醒 |
| `miniprogram/pages/discover/invite-qr.js`（新增） | 纯 JS 二维码编码器（字节模式 ECC M，版本 1~10），不新增依赖 |
| `miniprogram/app.json` | pages 数组在 `invite-create` 后追加 `pages/discover/invite-manage/invite-manage`，其余保持 main 原内容 |
| `tools/check-invite-qr.py`、`tools/test-invite-qr.cjs` | 二维码编码交叉验证（Python `qrcode` 逐模块比对） |
| `tools/test-friendly-invite-flow.cjs` | 云端链路内存桩自检，116 项（含模板字段、路由与回落用例） |
| `docs/FRIENDLY_MATCH_DATA_MODEL_2026-11-02.md`、本篇 | 数据模型与发布登记 |

未改动：`cloudfunctions/webLoginApi`（H5 走既有 `friendlySignInWorkflow` relay，新增 action 无需重发）、`cloudfunctions/friendlyMatchCenter/package.json`、`package-lock.json`、`data-center/`、其他云函数、PC 后台、平台后台。

## 二、云函数差量发布清单

### 2.1 线上现状（只读读回，2026-11-02）

| 项 | 值 |
| --- | --- |
| 函数 | `friendlyMatchCenter`，上次修改 2026-10-26 22:46:19，状态「部署完成」 |
| 运行时 / 内存 / 超时 | Nodejs18.15 / 256 MB / 120 s |
| 自动安装依赖 | **FALSE**（node_modules 随包发布） |
| 环境变量 | **无**（`SXF_INVITE_TEMPLATE_ID`、`SXF_SIGNIN_TEMPLATE_ID` 均未配置） |
| 触发器 | 无 |
| 线上包 | `index.js` 52,998 B SHA-256 `74826B0A…B8355`；`package.json`/`package-lock.json` 与本地**完全一致**（SHA-256 `5AA0FDF6…`、`85C4C847…`）；`node_modules` 5,829 文件 / 约 22.9 MB；**无 `data-center/` 目录** |
| 线上 action 数 | 20（含 `healthCheck`） |

只读下载目录：`E:\Documents\_sxf-online-baseline\friendlyMatchCenter-20261102`（仓库外，不提交）。

### 2.2 线上包与 main 基线比对

- 线上 `index.js` → `main e5bbe66a` 的 `index.js`：`+199 / −25`，差异集中在
  `shanghaiEpoch`、`cityKey`、`teamCityOf`、`teamLogoOf`、`loadTeamBriefs`、`listPublicInvites`、`respondPublicInvite`
  七处；其中 **`listPublicInvites`、`respondPublicInvite` 从未上线**（线上是 2026-10-26 版本）。
- `main e5bbe66a` → 本次工作副本：`+1147 / −114`，只落在邀约相关函数与主入口注册，未触碰 AI 生文/生图、比赛记录、场地管理等无关段落。
- 线上包缺 `data-center/`，而 `main` 的 `teamFriendlyStats` 会 `require('./data-center/team-history.cjs')`
  （函数内懒加载）。**只替换 `index.js` 会让 `teamFriendlyStats` 抛 MODULE_NOT_FOUND**，必须同时补依赖闭包。
- 依赖闭包（`team-history.cjs` → `hub-contract.cjs`、`reader.cjs`、动态 `import('./statistics.mjs')`；`statistics.mjs` 无本地依赖）共 4 个文件，取自 main 基线（worktree 内 clean，无 platform-ops 改动）：

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `data-center/team-history.cjs` | 9,337 B | `C6BE258B…806BF` |
| `data-center/hub-contract.cjs` | 8,375 B | `F8E626DA…56A390` |
| `data-center/reader.cjs` | 2,941 B | `5C9A0494…59DB8` |
| `data-center/statistics.mjs` | 35,675 B | `7481C3F0…A776EC` |

- **风险声明**：主工作区 `E:\Documents\sxf-football`（`codex/platform-ops`）的
  `cloudfunctions/friendlyMatchCenter/data-center/` 有未提交改动（`service.cjs` 修改 + 十余个未跟踪模块）。
  这些改动**不进入本次发布**；本次发布包只从上述 worktree 基线取 4 个文件。
  同时提醒：`friendlyMatchCenter` 不在 `tools/sync-data-center.mjs` 的 consumers 列表里，
  其副本是 main 的一次性快照，与 `data-center/shared` 的当前版本不一致（`statistics.mjs`、`reader.cjs` 有差异）。
  是否把该函数纳入同步治理，需另行决定。

### 2.3 拟发布包组装（最后一步执行，需单独授权）

1. 复制线上基线包到新目录（保留 `node_modules`、`package.json`、`package-lock.json` 原样）。
   本次实际用到的三个目录（均在仓库外）：基线 `E:\Documents\_sxf-online\fmc-20261102-r3`、
   拟发布 `E:\Documents\_sxf-online\fmc-20261102-publish`、发布后回下载比对 `E:\Documents\_sxf-online\fmc-20261102-verify`。
2. 用本次 `index.js` 覆盖该目录 `index.js`，并放入 `template-fields.cjs`；新建 `data-center/` 并放入上表 4 个文件，其余不动。
3. 对拟上传目录执行 `node --check index.js`、`node --check template-fields.cjs`，并对 `data-center/*.cjs/*.mjs` 逐个 `node --check`。
4. `sxf-cloud football run fn code update friendlyMatchCenter --dir <拟发布目录>`（不改运行环境/内存/超时/环境变量/触发器）。
5. 更新前后各读一次 `fn detail`，确认 **自动安装依赖仍为 FALSE**；若被 CLI 改写，立即按 AGENTS 受控配置改回 FALSE 并复核。
6. 回下载线上包，比对 `index.js`、`template-fields.cjs` 与 4 个 `data-center` 文件 SHA-256，确认 `package.json`/`node_modules` 未变。
7. 调用 `healthCheck` 读回 `version`、`actions`（应为 33 项，含 11 个新 action）、`inviteStates`（五态）、
   `templateRoutes`（两套模板的 `fieldMap` / 生效 ID / 回落情况）、
   `templateConfigured`（环境变量为空 → 预期 `false`，此时所有通知只计 `skipped`）、`miniProgramSubscribe:'not-enabled'`。
8. 用测试球队/测试球员走一遍：创建 → H5 报名 → 管理页名单 → 勾签到 → 取消 → 通知统计；不写真实邀约。

### 2.4 其他端口（本次均未发布）

- `service-account-h5/friendly-signin.html`：随服务号 H5 静态资源发布，需与正式站 `/service-account-h5/` 一起上线后再用真实 token 验证。
- 小程序：`pages/discover/*` 与 `app.json` 变更需重新上传开发版；体验版/正式版按 AGENTS「正式发布后同步测试端」另行处理。
- PC 后台、平台后台：本次无改动。

### 2.5 通知模板环境变量

| 变量 | 模板 | 填值 |
| --- | --- | --- |
| `SXF_INVITE_TEMPLATE_ID` | A 58013「约球成功通知」 | 模板 ID（本次为 `Mkd_hCt-ZeMC61TwjxPVl8p9FIlZnsxu0J-Vc145P3Y`） |
| `SXF_SIGNIN_TEMPLATE_ID` | A（旧名兼容） | 与 A 同值 |
| `SXF_CANCEL_TEMPLATE_ID` | B 58014「约球已取消通知」 | 模板 ID（本次为 `1xxlMlNIksN8v_F3pdmcgrNfZH3BBq8VrLz-gH6-Jr0`） |

未配置 `SXF_CANCEL_TEMPLATE_ID` 时取消 / 流局会按语义回落到 A 模板，`healthCheck` 与 `notify` 返回结构会标出实际用的模板和回落状态。
2026-11-02 已在线上写入这 3 项与 `SERVICE_ACCOUNT_APP_ID`、`SERVICE_ACCOUNT_APP_SECRET`（共 5 项，值不入库）。

## 三、自检结果（本地）

- `node --check`：`friendlyMatchCenter/index.js`、`template-fields.cjs`、`discover.js`、`discover-model.js`、`invite-create.js`、`invite-manage.js`、`invite-qr.js` 全部通过。
- `node tools/test-friendly-invite-flow.cjs`：**通过 116 项，失败 0 项**（21 段用例：鉴权、脱敏、报名幂等、分页与明文开关、勾签到/代签、接战、人工成局与通知、终态封锁、防超卖、截止校验、历史「待确认」、旧接口 `listSignins` 鉴权、公开列表跨队应战、WXML 表达式合规、事件处理函数对齐；新增模板字段适配（A/B 映射表、20 字截断、`time2` 单/区间/非法）与模板路由回落（只配 A → 取消回落 A、A+B → 取消/流局走 B、成局/提醒走 A、原因并入 `thing1` 与超长截断、`healthCheck.templateRoutes`））。
- `node tools/test-invite-qr.cjs` + `python tools/check-invite-qr.py`：3 组样本 × 8 掩码，与 Python `qrcode` 逐模块一致 **27/27**。
- 未能验证（本地自检阶段）：真机小程序交互与 canvas 导出（未上传开发版）、真实 H5 线上页面。

## 四、发布记录（2026-11-02）

- **代码**：`fn code update friendlyMatchCenter --dir E:\Documents\_sxf-online\fmc-20261102-publish`，COS 上传，成功；
  线上包 = 2026-10-26 基线（`node_modules`、`package.json`、`package-lock.json` 原样）+ 新 `index.js` + `template-fields.cjs` + `data-center/` 4 文件。
- **配置**：`config update fn friendlyMatchCenter -y`（覆盖模式）→ `timeout=120s`、`memory=256MB`、`runtime=Nodejs18.15`、
  `handler=index.main`、`envVariables` 5 项；自动安装依赖仍为 **FALSE**。
- **回读自证**：重新下载线上包，`index.js` `ADF693AA…55EFE7`、`template-fields.cjs` `BB9E7A28…2DDDA3`、
  4 个 `data-center` 文件与本地拟发包逐一致；`package.json`/`package-lock.json` SHA 未变。
- **healthCheck**：`version=1.8.0`、33 个 action（含 `listPublicInvites`/`respondPublicInvite`/`listInviteSignups`/
  `checkInInviteSignup`/`proxyCheckInInvite`/`removeInviteSignup`/`confirmInvite`/`cancelInvite`/`abandonInvite`/`remindInviteSignups`）、
  `inviteStates` 五态、`templateConfigured=true`、两套模板均 `configured=true` 且 `fallbackTo` 为空、`notifyScenes` 路由符合预期。
- **通道阻断（未解决）**：本地直连 `cgi-bin/token` 返回 `40164 invalid ip 115.60.48.39`，说明服务号 AppSecret 开启了 IP 白名单。
  CloudBase 动态出口历史上同样被拦（见 `docs/PRODUCTION_EXTERNAL_CONFIGURATION.md` §2）；
  正式通道应走已健康的固定出口 `https://api.saixiaofeng.com/wechat/football/v1`（`/health` 返回 `{"success":true}`），
  该函数尚未配置 `SXF_FOOTBALL_WECHAT_BRIDGE_URL` / `SXF_FOOTBALL_WECHAT_BRIDGE_SECRET`，因此当前真实发送仍不可用。
  配置桥接后 `healthCheck.configured` 才会变 `true`，且不再受本地/云端出口 IP 限制。
- **测试消息**：未发送。通道 40164 阻断后按约定停止重试，未向任何真实用户推送。
- **回滚包**：发布前基线保存在 `E:\Documents\_sxf-online\fmc-20261102-r3`，如需回滚用
  `fn code update friendlyMatchCenter --dir E:\Documents\_sxf-online\fmc-20261102-r3`。
