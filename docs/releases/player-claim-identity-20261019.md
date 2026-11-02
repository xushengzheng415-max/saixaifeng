# 无身份证档案认领修复发布（2026-10-19）

## 问题

真机反馈：服务号「球员登记」页，球员查找本队档案（武朝，1993 年生 · 95 号）后点「认领」，页面停住无法进入下一步，顶部出现红字：

> 该档案缺少身份凭据，请让负责人从此球员详情发送补资料邀请

## 原因

`getMiniWorkspace/playerRegistration.cjs` 的 `claimProof` 要求：档案没有身份证号时，必须「已登记手机号匹配」或「定向补资料邀请 + `manualPlaceholder === true`」才能认领。

两处缺陷叠加，形成死循环：

1. **规则过严**：青少年档案常常没有身份证。身份证号本只是检索方式之一，不应成为认领的硬门槛。
2. **提示指向的路径本身是断的**：`manualPlaceholder` 只由小程序「添加球员」手动建档写入；从报名表/历史名单导入的档案（有生日、有球衣号）永远为 `false`，即使负责人从球员详情发了「邀请补资料」，认领仍被拒。提示语让用户去做一件做不到的事。
3. **报错看不见**：提示写在页头 `#status`，用户停在候选人列表时该区域已在视口外，点击「认领」后屏幕上没有任何变化，表现为「按钮点了没反应」。

## 修复

### 1. 认领身份核验（`cloudfunctions/getMiniWorkspace/playerRegistration.cjs`）

按用户 2026-10-19 口径：**身份证只是检索方式之一，没有身份证的青少年档案凭姓名也可以认领。**

- 档案**有**身份证号：必须核对一致；未填写时给出「请填写该档案登记的身份证号」。
- 档案**无**身份证号：允许凭姓名认领，提交时补录的身份证号成为该档案的身份凭据。
- 保留全部原有拦截：已被他人认领（`PLAYER_ALREADY_CLAIMED`）、存在历史微信关联（`PLAYER_IDENTITY_REVIEW`）、已登记联系手机号不符（`PLAYER_PHONE_MISMATCH`）。
- 删除失效的 `targeted = invite.playerId === p._id && p.manualPlaceholder === true` 分支。

### 2. H5 报错可见性（`service-account-h5/service-entry.js`）

`say(message, error)` 在提示条已滚出视口时自动 `scrollIntoView`，保证报错一定能被看到。

「核对球员身份证号」输入框补充说明与占位符（`选填，用于核对档案身份证`），明确它不是认领前置条件。

### 3. 版本号

`join-player.html` / `claim-team.html` 的 `service-entry.js?v=` 升至 `20261019-claim1`，避免 CDN/浏览器缓存旧脚本。

## 发布方式

仍以**当时线上包为基线**、只叠加改动文件，不使用本地目录整体上传（本地 `node_modules` 缺 `pngjs` / `@resvg`，整体上传会 443）。

### getMiniWorkspace

- 基线：上一版线上包 5906 文件（`player-join-review-release-20261019/readback`）。
- 叠加 1 个文件：`playerRegistration.cjs`，与基线**仅 14 行差异**（新增 3 行注释、身份证分支展开、删除 2 行 targeted 拦截）。
- 配置：`runtime Nodejs18.15`、`handler index.main`、`timeout 150`、`memorySize 512`、`installDependency false`、`--deployMode cos --force`。
- 结果：Succeeded 1；回下载 5906 文件，`index.js c9495aad…`、`playerRegistration.cjs 773d6b30…`、`playerJoinReview.cjs 3e4eab92…` 与发布包 **md5 逐字节一致**。
- 运行配置回读：Runtime / Handler / Timeout / MemorySize / InstallDependency / Status 全部保持；两个环境变量（`SXF_FOOTBALL_SERVICE_BRIDGE_KEY`、`SXF_MATCH_PASS_SECRET`）**值未变**。
- 探活：未定义 action 调用返回 `WORKSPACE_LOAD_FAILED`（业务错误），6ms / 27.42MB，模块加载正常、非 443。

### service-account-h5

- 上传 132 个文件（仅变更部分）。
- 回读 `https://www.sxffootball.cn`（`Cache-Control: no-cache`）：
  - `join-player.html` → `service-entry.js?v=20261019-claim1`
  - `claim-team.html` → `service-entry.js?v=20261019-claim1`
  - `service-entry.js` 线上 md5 `88069ebe…` 与本地**一致**，`scrollIntoView` 与「档案已登记身份证时填写」均在线。

## 回归

```
node tools/test-player-registration.cjs          PASS（新增无身份证青少年档案认领用例）
node tools/test-player-join-review.cjs           PASS
node tools/test-service-entry-registration.cjs   PASS
node tools/test-mini-player-library.cjs          PASS
node tools/test-mini-account-participation.cjs   PASS
node tools/sync-data-center.mjs --check          PASS
node tools/test-data-center.mjs                  PASS
node tools/check-data-governance.mjs             PASS
```

新增用例覆盖：`claimProof` 对无身份证档案放行；`select` 返回 `hasIdentity:false`；`submit` 后身份证号写入档案、`guardianUserId` 绑定登记人、`manualPlaceholder` 保持 `false`。

## 真机验收

1. 服务号打开球队邀请 → 查找「武朝」→ 点「认领」→ **应直接进入资料填写页**（不再红字拦截）。
2. 资料页补填身份证号、球衣号、位置、身高体重、形象照 → 提交 → 完成页显示「登记成功」（认领已有档案即时生效，不进待确认）。
3. 档案原有生日 1993 与身份证出生日期需一致，否则提示「出生日期与身份证不一致」。
4. 已登记身份证的档案仍须填写正确身份证才能认领；已由他人认领的档案仍提示「此球员已由其他账号认领」。

## 未变更

- `tournamentRegistrationFlow`、`webLoginApi` 本次未改动。
- 小程序代码未改动、未上传。
- 生产数据未写入（仅函数代码与静态资源）。
- Git 未提交、未推送。
