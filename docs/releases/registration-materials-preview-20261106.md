# 报名材料设置（组别资质）预览发布 2026-11-06

## 范围

PC 后台「报名管理 → 报名材料设置」弹窗：字段口径统一、旧布尔字段派生、预览窗口字段补充。

- 仅前端，未改 `webLoginApi`、未改数据库结构、未改赛程/延期/裁判相关代码。
- 发布目标：`/preview/admin/`。正式 `/admin/` 未发布。

## 代码

| 项 | 值 |
|---|---|
| 基线 | `origin/preview` = `24805064a` |
| 发布分支 | `release/reg-materials-20261106` |
| 提交 | `feat(registration): 报名材料字段口径统一与派生` |
| 文件 | `web-admin-vue/src/utils/registrationMaterials.js`（新增）、`web-admin-vue/src/views/tournament/RegistrationMaterialSettings.vue`（新增）、`web-admin-vue/src/views/tournament/TournamentTeams.vue` |

改动内容：

1. 新增统一口径工具：材料三态、身份证三种提交方式（`number/photos/none`）、`materialRequirements.idDocParts` 嵌套存放、旧值兼容（顶层 `idDocParts`、`identityParts`、`required/optional`）。
2. 弹窗保存改为 `buildMaterialPayload`：同时派生 `identityVerificationRequired`、`portraitRequired`、`identityDocumentRequired`（身份证非“不提交”即为 true）、`faceVerificationRequired`、`insuranceRequired`、`waiverRequired`。
3. 保存前校验球衣号码下限不得大于上限。
4. 预览补充：身份证号按提交方式区分必填/选填/隐藏、球衣号码范围提示、免责签署时点、底部「同一球员限报一个组别 · 球衣号码限 x–y 号」。

## 构建

```
$env:VITE_APP_BASE='/preview/admin/'
npm run build
```

- 工作目录：`e:\Documents\sxf-preview-reg-20261106\web-admin-vue`（origin/preview 基线 worktree）
- 结果：成功，31.14s，410 个文件上传

## 产物核对（本地 = 线上）

本地 dist 与线上 `https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/preview/admin/` 逐文件比对：

| 文件 | 大小 | 本地 = 线上 |
|---|---|---|
| `assets/index-Cd-xyypc.js` | 290,801 | 是 |
| `assets/TournamentTeams-BBoYuPoY.js` | 257,528 | 是 |
| `assets/DivisionRulesWizard-CzJrbCo_.js` | 115,010 | 是 |
| `assets/TournamentScheduleV2-cDQYjaET.js` | 209,416 | 是 |
| `assets/MatchDetail-CYLyXE4y.js` | 176,055 | 是 |
| `assets/LayoutView-CHwxXUX0.js` | 31,577 | 是 |

`index.html` 入口：`/preview/admin/assets/index-Cd-xyypc.js`、`vue-vendor-b1JROl9D.js`、`element-plus-Ft7rCYsc.js`、`index-DFlCJ2Do.css`，全部指向 `/preview/admin/`。

### 本次改动标记

| 标记 | 命中位置 |
|---|---|
| `同一球员限报一个组别` | `TournamentTeams-BBoYuPoY.js`（2）、`DivisionRulesWizard-CzJrbCo_.js`（2） |
| `报名材料设置` | `TournamentTeams-BBoYuPoY.js`（4） |
| `identityDocumentRequired` | `TournamentTeams-BBoYuPoY.js`（3）、`DivisionRulesWizard-CzJrbCo_.js`（5） |

### 未回退核对（场地/赛程线）

| 标记 | 命中位置 |
|---|---|
| `postponedTo` | `TournamentScheduleV2-cDQYjaET.js`（3） |
| `isPostponedPlaceholder` | `TournamentScheduleV2-cDQYjaET.js`（7） |
| `postpone-badge` | `TournamentScheduleV2-cDQYjaET.js`（1） |
| `原定为` | `TournamentScheduleV2-cDQYjaET.js`（1） |
| `延期至` | `TournamentScheduleV2-cDQYjaET.js`（1）、`MatchDetail-CYLyXE4y.js`（1） |
| `sxfSchedulePendingPool` | 全部产物 0 次 |

## 未包含

- `DivisionRulesWizard.vue` 的报名材料重构与旧布尔派生：该部分属于尚未提交的组别规则改动线，本次未带入，避免混入其他线未验收内容。
- 后端受控 action、名单/报名提交校验、号码范围与限报组别的执行点。
- 两个待定业务决策：成年组判据、规则定版后能否改材料。

## 结论

预览已发布并读回一致，未覆盖场地/赛程线已发布的延期标记。正式 `/admin/` 未动。
