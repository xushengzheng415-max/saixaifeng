# 报名表护照证件列切换：测试版发布（20261030）

## 一、用户诉求

外籍球员只有护照号没有身份证号时，上传报名表预览表头仍显示「身份证」，未切换成「护照」。

## 二、发布范围（前端，仅测试版）

在既有预览工作树 `E:\Documents\sxf-preview-deploy`（detached `8c43b189` + 此前驳回/删除等未提交文件）上，仅覆盖护照相关 3 个文件：

| 文件 | 变更要点 |
|---|---|
| `web-admin-vue/src/utils/teamRegistrationDocx.js` | 护照识别（须含字母）、表头标签辅助、打码前缀展示、`displayRegistrationIdentity` |
| `web-admin-vue/src/components/tournament/TeamRegistrationWordImporter.vue` | 表头按队切换「护照/身份证/证件」、单元格类型标签、护照可编辑、提交带 `documentType`/`nationality` |
| `web-admin-vue/src/utils/jerseyName.js` | 拉丁姓名球衣名默认取姓大写（外籍名单配套） |

未改云函数；正式 `/admin/` 未发布。主仓 `codex/platform-ops` 工作区仍保留同源改动，未整支合入 `preview` 分支（`preview` 仍被其他 worktree 占用，分支指针仍停在 `b10eb64d`）。

## 三、构建与发布

- `$env:VITE_APP_BASE='/preview/admin/'` → `npm run build`，约 7m46s 成功。
- 入口 `dist/index.html` 仅引用 `/preview/admin/assets/`。
- `sxf-cloud.ps1 football run hosting deploy … preview/admin`：406 文件全部成功。

## 四、回读

| 检查 | 结果 |
|---|---|
| `https://www.sxffootball.cn/preview/admin/index.html` | HTTP 200，SHA MATCH，`preview-paths-ok` |
| `assets/index-B5Ba_CPf.js` / `index-7eBerNJa.css` | HTTP 200，SHA MATCH |
| `assets/teamRegistrationDocx-BtsRfpex.js` | HTTP 200，SHA MATCH；含 `registrationIdentityColumnLabel`、`displayRegistrationIdentity`、`护照` |
| `assets/TournamentTeams-BDDdpltc.js` | HTTP 200，SHA MATCH；含 `护照` |
| 正式 `https://www.sxffootball.cn/admin/index.html` | HTTP 200，仍为 `/admin/assets/`，无预览路径泄漏 |

本地样表 PhoenixFC：24/24 球员 `documentType=passport`，表头标签为「护照」。

## 五、验收路径

1. 无痕或 Ctrl+F5 打开 https://www.sxffootball.cn/preview/admin/
2. 赛事 → 报名管理 → 上传球队资料，选择外籍队 Word（如 PhoenixFC）
3. 球员资料表头应为「护照」；单元格有「护照」标签；打码号显示如 `W979196****（保护）`；籍贯列显示「国籍待确认」
4. 「修改」可补完整护照号；勿对正式赛事点「创建球队」写操作，除非使用明确测试数据
