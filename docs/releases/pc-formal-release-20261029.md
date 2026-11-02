# PC 后台正式发布记录（2026-10-29）

## 本次上线内容

- 共享（子）账号可分配球队账号权限：前端放开判定；`webLoginApi` 与 `organizerClaimInvite` 只对 `listTeamAccess / saveTeamAccess / removeTeamAccess / addPlayerAsStaff` 四个动作豁免授权项检查，仍保留会话唯一、机构归属与赛事范围校验。
- 工作人员资料支持编辑：球队详情「工作人员」行新增「编辑」，可改姓名、职务、手机号、身份证、球衣号，保存写回 `coaches`。
- 工作人员手机号列改为「账号手机号优先、未分配时显示资料手机号」。
- 队徽显示修复：内联图片地址不再被 `http(s)://` 判定拦截。
- 报名表解析：籍贯按身份证前 6 位核算；工作人员不做身份证核验，`/`、`—`、`无` 视为未填写；姓名格为占位符的整行跳过。
- 预览构建基路径修复：此前预览包误用 `/admin/` 基路径，导致 `/preview/admin/` 页面引用不存在的正式资源、永久停在「正在打开后台…」。

## 云函数

`webLoginApi`、`organizerClaimInvite` 以线上包差量更新并部署；`node --check` 与 `node tools/check-referee-backend-package.cjs <实际包目录>` 均通过；回读 `organizerClaimInvite` 为 Nodejs18 / 256MB / 30s、无环境变量，`webLoginApi` 512MB / 120s、环境变量未变。

## 前端构建与部署

- 正式：`web-admin-vue` 默认基路径 `/admin/` 构建，`/admin/` 上传 398 个文件。首页与本地 `dist/index.html` SHA-256 一致（`20BEDA4B24F4A7B0`）；入口 `/admin/assets/index-BgaKCdkr.js`、`TeamDetail-LURqY-3w.js`、`teamRegistrationDocx-BVHaKEO2.js`、`index-7eBerNJa.css` 均 HTTP 200，两个分包线上字节 SHA-256 与本地一致。
- 测试：`VITE_APP_BASE='/preview/admin/'` 构建到 `dist-preview`，`/preview/admin/` 上传 398 个文件。首页 SHA-256 一致（`61E9253D30D6CB79`）；入口 `/preview/admin/assets/index-DtUZiL8H.js`、`TeamDetail-CWSRXLoM.js`、`teamRegistrationDocx-lKyZYyIl.js` 均 200 且字节一致。
- 构建未引入 `@cloudbase/js-sdk`。

## 说明

- 桌面客户端外壳仍为 0.2.5，未改动；网页内容随线上更新。
- 本次代码改动仍在工作区未提交（当前分支 `codex/platform-ops`，工作区含其他未提交任务），未执行提交或推送。

## 追加修复（同日）

- 报名表导入的人数上限此前只读 `maxPlayersPerTeam`（组别创建时按赛制写入的默认值，8 人制为 30），组别规则页修改的是 `rosterLimit`，导致改成 50 后仍提示「最多 30 名球员」。现统一为 `rosterLimit → maxPlayersPerTeam → maxPlayers`，与下载模板同源。
- 重新构建并部署两端：正式 `/admin/` 398 文件，首页 SHA-256 `B5F1BF21E0D3004B`，`TournamentTeams-BVET5ox_.js` 200；预览 `/preview/admin/` 398 文件，首页 SHA-256 `F8F274A3CED4B85C`，`TournamentTeams-D8iNjPKs.js` 线上字节一致。
- 安卓平板客户端加载的是 `/preview/admin/`，此前同样受预览基路径故障影响，需在客户端点「刷新」（0.1.1 会清缓存并使用 no-cache）或重开应用。

