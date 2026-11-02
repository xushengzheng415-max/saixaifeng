# 运营中心「背景卡 / 皮肤」入口正式发布

日期：2026-11-02（Asia/Shanghai）。用户在本聊天选择「方案 A」并明确授权正式发布 `/admin/`。

## 源码与范围

- 需求来源提交：`08e33b0a`（分支 `feat/card-world-h5-stage1-2`），只含 3 个文件：`web-admin-vue/src/views/tournament-center/PlayerCardSkinStudio.vue`（新增）、`web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`（+6/-3 接线）、`tools/test-card-skin-studio.cjs`（新增）。
- 该分支基线与正式线相差 127 个提交，整包部署会回退正式后台，因此未用分支整包构建，改为 cherry-pick 到 `main`。
- 移植：`main`（`b2f91b5d`，与 `github/main` 一致）cherry-pick `08e33b0a` → 本地提交 `a260ab03`，工作区干净，无冲突。
- 三个文件与 `08e33b0a` 内容逐字节一致（`git diff 08e33b0a a260ab03 -- <3 文件>` 为空）。
- 未改任何业务源码，未执行 `git push`，未改动 `main` 以外分支。

## 构建

- Node `v24.19.0`、npm `11.17.0`。任务建议 Node 20/22，本机只有 24，未使用 Node 16。
- `npm ci` + `npm run build` 通过（44.34s）；`vite.config.js` 的 `base` 为默认 `/admin/`，未设置 `VITE_APP_BASE`。
- 预检：`cardSkins` 命中 `dist/assets/TournamentCenterAdmin-BF1Tpmp2.js`；`dist/index.html` 全部引用 `/admin/assets/`；产物无 `@cloudbase/js-sdk`。
- 产物 407 文件 / 64.6 MB。

## 部署

- `E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy .codex-artifacts/card-skins-admin-20261102/web-admin-vue/dist admin`（未用全局 `tcb login`）。
- 环境 `cloud1-7g8ckb3c7815a011`，`env list` 仅此一个环境且状态正常。
- 上传 407 文件全部成功，CLI 回报部署完成。

## 线上读回

- `https://www.sxffootball.cn/admin/` HTTP 200，入口 `assets/index-wvhmDdFe.js`。
- `index-wvhmDdFe.js` HTTP 200 / 286,518 B，SHA-256 `6EB58DA4F0F8A9D2CDECFC8542D25572D47B4B0024648E0F8A19CC1CC7713DFD`，与本地一致；`stageOrder` 命中 25，说明 `main` 已发布的赛程修复仍在。
- `assets/TournamentCenterAdmin-BF1Tpmp2.js` HTTP 200 / 167,157 B，SHA-256 `C57BC43CA074C00ED830A05FAC16626C68BBF80E427F70D74EFB026579A6852F`，与本地一致。
- 线上分包命中：`cardSkins` 4、`PlayerCardSkinStudio` 1、`制作项目` 1、`已发布样式库` 1、`发放记录` 4、`背景卡` 9。
- 页面入口：`https://www.sxffootball.cn/admin/#/tournament-center-admin?section=cardSkins`（需平台负责人账号登录后可见左侧「背景卡 / 皮肤」导航）。

## 未完成 / 待授权

- `preview` 测试端未同步：`/preview/admin/` 当前入口 `index-C_zASndt.js`（2026-11-02 18:12 北京时间），`cardSkins` 命中 0，测试端落后一次发布。按发布流程需先推送 `preview` 再 `VITE_APP_BASE=/preview/admin/` 构建部署；本次用户禁止 `git push`，故未执行。
- `main` 本地提交 `a260ab03` 未推送 GitHub（用户禁止 `git push`）。
- 平台负责人账号登录后的页面级验收（三个页签实际渲染、上传与发布流程）未在浏览器内完成，本次仅做到资源级读回。
- 提示用户浏览器 `Ctrl/Cmd + Shift + R` 强刷，避免旧包缓存。
