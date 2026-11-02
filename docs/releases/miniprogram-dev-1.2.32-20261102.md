# 小程序开发版 1.2.32 上传记录（2026-11-02）

状态：**开发版已上传**（AppID `wx57164cca8676f411`）；体验版未设置、未提审、未合并 `main`/`preview`、未发布正式站 H5。

## 一、源码基线

- 分支 `codex/platform-ops`，上传时 `HEAD=7290abaf`。
- 包含：主工作区 6 批在途改动（`13415037` 小程序、`1f2cc2ea` 云函数、`556a231d` PC 后台、`e5cfff5c` 服务号 H5、`3bba983d` docs、`62679321` tools）。
- 包含：发现页约球 4 个提交（`90faadf8`、`bba5e3c8`、`e976a07b`、`5c1b6b1f`，由 `feature/friendly-match-complete-20261102` cherry-pick）。
- 包含：版本日志提交 `7290abaf`（`miniprogram/config/release.js` 升到 `1.2.32`）。
- GitHub 可见：`github` 远端 `codex/platform-ops` 已推送至 `5c1b6b1f`，本记录与版本日志提交随后再推。

## 二、`app.json` 并集结果

- 主包页面 **41** 个，比 platform-ops 的 40 页只新增 `pages/discover/invite-manage/invite-manage`；
  约球分支带来的 `pages/discover/discover`、`invite-create`、`pages/public-tournament-center/index` 在主包已存在，未重复追加。
- 首项仍为 `pages/home/home`（首屏游客浏览版本），`tabBar` 5 项全部仍在 `pages` 内。
- 41 个主包页面、59 个分包页面的 `.js`/`.wxml` 均存在；`invite-manage` 4 个文件齐全。

## 三、上传参数与包体

| 项 | 值 |
| --- | --- |
| 项目目录 | `E:\Documents\sxf-football\miniprogram`（MCP `upload`，需在开发者工具确认） |
| 版本号 | `1.2.32` |
| 备注 | 在途改动合并 + 发现页约球系统（H5报名/签到/管理页/海报/服务号通知 58013/58014） |
| TOTAL | 5,107,312 B |
| main | 2,019,538 B |
| `/packageCard/` | 1,424,273 B |
| `/pages/team/` | 742,947 B |
| `/pages/tournament/` | 429,863 B |
| `/packageDiscover/` | 371,139 B |
| `/pages/match/` | 85,452 B |
| `/packageA/` | 34,100 B |

首次上传失败原因：开发者工具使用旧的文件索引，报 `app.json ["pages"][40] could not find ... invite-manage.wxml`。
关闭项目窗口后重新打开（fullMode）再上传即成功；不是源码缺文件。

## 四、预览二维码（开发者工具「预览」码，非体验版码）

- 发现页入口：`E:\Documents\_sxf-online\release-1.2.32\preview-qrcode-discover.jpg`（47,977 B）
- 首页入口：`E:\Documents\_sxf-online\release-1.2.32\preview-qrcode-home.jpg`（47,168 B）

## 五、自检结果

- `node --check`：`friendlyMatchCenter/index.js`、`template-fields.cjs`、`discover.js`、`discover-model.js`、
  `invite-create.js`、`invite-manage.js`、`invite-qr.js` 全部通过。
- `node tools/test-friendly-invite-flow.cjs`：通过 116 项、失败 0 项。
- `node tools/test-invite-qr.cjs` + `python tools/check-invite-qr.py`：3 组样本 × 8 掩码，与 Python `qrcode` 逐模块一致 **27/27**。
- `app.json` 可解析；41 主包页面与 59 分包页面文件齐全；管理页路由已注册。

## 六、未完成与待验收

- **体验版**：上传只产生开发版，需在微信公众平台「版本管理」把 1.2.32 设为体验版并添加体验成员。
- **真机验收路径**：发现页 → 发起约球 → 复制链接/扫海报二维码走 H5 报名 → 发现页本队卡进入管理页 →
  勾签到/代签 → 取消（核对服务号模板 58014）→ 成局/提醒（核对模板 58013）。
- **后端**：`friendlyMatchCenter` 已于 2026-11-02 发布（`version=1.8.0`、33 个 action、桥接 `configured=true`），
  小程序端使用的 15 个 action 均在其中；H5 仅测试端 `/preview/service-account-h5/friendly-signin.html` 已发布，正式站未发。
