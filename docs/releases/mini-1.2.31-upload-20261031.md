# 小程序 1.2.31 开发版上传记录（首屏游客浏览 + 游客赛事中心）

- 日期：2026-10-31，Asia/Shanghai。
- 授权：用户指令「好的，上传 1.2.31 开发版」。
- 目标：球队端小程序 `wx57164cca8676f411`，版本 `1.2.31`（开发版）。
- 结果：微信开发者工具 CLI 返回 `✔ upload`，AppID 回读 `wx57164cca8676f411`，回执 `work/upload-1.2.31-info.json`。

## 本轮改动（审核驳回整改「首屏游客浏览」+ 游客赛事中心入口）

| 文件 | 大小 / SHA-256 | 改动 |
|---|---|---|
| `app.json` | 4,908 B / `5BAF4EB8727CF4DDA0309C85D1F14DA85BC0913CF138049554E21EE73EBD0BEE` | `pages` 首项改为 `pages/home/home`，登录页降为第二项；含同期新增的 `pages/common/official-webview`、`pages/player-self-onboard/index` 等路由 |
| `pages/login/login.wxml` | 1,986 B / `9280AAB685680E06BA207CDDAA78D0F1050061E60AFF669F042A0417AF23854C` | 「先逛逛（免登录浏览）」独立入口块 + 浏览/登录边界说明 |
| `pages/login/login.wxss` | 3,333 B / `69EF0C415F5C409B79E3D4AEA490CDF58E95603B9CDF97700C3E9E30763700FE` | 新增 `.guest-entry-btn/.guest-entry-main/.guest-entry-hint` |
| `components/guest-experience/index.wxml` | 4,253 B / `C9DE7810830255205E936681702B74EBCC95E89A9D72A3C06667B8E2C1E82F52` | 角色介绍下方新增「赛事中心」入口卡，触发既有 `publicEvents` 事件 |
| `components/guest-experience/index.wxss` | 10,694 B / `AA08ABAA21573D47218CE373206E273D9A47D4A938FFDC281D63C42FDDD847A1` | 新增 `.center-entry*` 样式（白底绿边圆角卡） |
| `pages/home/home.js` | 26,402 B / `23BD0283AD1F0459E4B49A86213020DC03A2DC7AFC964411E5E6D560A8AC1B71` | `goToPublicCenter` 打开 `pages/public-tournament-center/index`（web-view 承载 H5），新增失败回退赛事列表 |
| `pages/public-tournament-center/index.js` | 798 B / `809397B7D9C769664370CA93EF0BCC0FBDBC7393A7ABFC43BC007F5C58491B60` | 支持 `hash` 参数拼接到 `https://www.sxffootball.cn/service-account-h5/tournament-center.html` |
| `config/release.js` | 13,261 B / `F683E24563BBAD71FB3BCCC46CDF8BA66CE2899386C17B3ABEC8CB0CF73608DB` | `1.2.30 → 1.2.31`，标题「首屏游客浏览」，首节 3 项（含赛事中心入口） |

游客链路：首页游客态 → `components/guest-experience` → 点「赛事中心」→ `publicEvents` → `home.js:goToPublicCenter` → `pages/public-tournament-center/index` → `web-view` → H5 公开赛事中心（免登录）。

## 包体

| 包 | 1.2.30 | **1.2.31** | 增减 |
|---|---|---|---|
| TOTAL | 5,437,643 | **5,445,452** | +7,809 |
| main | 2,046,707 | **2,054,516** | +7,809 |
| `/packageA/` | 50,324 | 50,324 | 0 |
| `/packageCard/` | 1,429,631 | 1,429,631 | 0 |
| `/packageDiscover/` | 392,496 | 392,496 | 0 |
| `/pages/match/` | 153,341 | 153,341 | 0 |
| `/pages/team/` | 827,422 | 827,422 | 0 |
| `/pages/tournament/` | 537,722 | 537,722 | 0 |

主包 2,054,516 B ≈ 2006.4 KB，距 2,097,152 B 上限约 **41.6 KB**；主包已接近硬上限，后续主包内新增资源需先清减或改放分包。

## 验证

- 暂存源 `work/mini-upload-1.2.31`（`miniprogram/` 全量 771 文件 + 复用已校验精简 `project.config.json`，头字节 `EF BB BF`(123,13,10)、`appid=wx57164cca8676f411`、`miniprogramRoot=miniprogram/`）：source 771 / staged 771 / **mismatch=0**，清单 `work/upload-1.2.31-source-manifest.json`。
- 176 个小程序 JS 文件 `node --check` 全部通过（`js=176 fail=0`）；全部 JSON 文件与 `config/release.js` 解析通过（`json fail=0`）。
- 路由登记完整性：主包 + 6 个分包共 99 个路由，`.js/.json/.wxml` 无一缺失（`routes=99 missing=0`）。
- WXML 表达式扫描：136 个文件，命中仍为既有 2 个文件（`components/guest-guide/index.wxml`、`pages/team/detail/detail.wxml`），本次改动与新增文件**零命中**。
- 相对 1.2.30 清单：变更 10 个、新增 1 个、删除 0 —— `app.json`、`components/guest-experience/index.wxml|.wxss`、`config/release.js`、`pages/home/home.js`、`pages/login/login.wxml|.wxss`、`pages/player/detail.js|.wxml`、`utils/nationality-catalog.json`，新增 `images/flags/al.png`。其中 `pages/player/detail.*`、`utils/nationality-catalog.json`、`images/flags/al.png` 属同期其他任务，随本包一并上传。
- 线上可用性（只读 HEAD）：`https://www.sxffootball.cn/service-account-h5/tournament-center.html` 200 / 4,326 B；业务域名校验文件 `MP_verify_rscNSXUb1BQhGS3O.txt` 200 / 17 B。
- 上传命令：`cli.bat upload --project work\mini-upload-1.2.31 -v 1.2.31 -d "首屏游客浏览：启动页改为游客首页，游客体验新增赛事中心入口直达H5" -i work/upload-1.2.31-info.json`。

## 状态与边界

- 只上传开发版：未提交审核、未发布正式版、未设置体验版（体验版需在微信公众平台「版本管理」手动设为体验版并配置体验成员）。
- 未改云函数与数据库；本轮无后端改动。
- `web-view` 依赖小程序后台「开发管理 → 业务域名」已配置 `www.sxffootball.cn`；校验文件在线可用，若真机空白先核查该项。
- 提审前仍需：提审说明 + 录屏（用户侧材料）；审核驳回 2（登录受限）靠录屏/测试账号说明解决，代码侧不硬编码测试账号。
