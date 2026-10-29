# 球员登记卡预览改用平台基础等级卡（2026-10-29）

用户指出：球员登记页的「球员卡预览」显示的是赛事专属卡面（截图为「立洋杯 2026·第六届」模板），
但新建球员此时还未加入赛事正式名单，预览应为平台标准金/银/铜基础卡。

本记录替代此前「登记预览按球队参赛关系套赛事预装模板」的实现，赛事预装卡仍在球员卡库按名单资格读取。

## 口径依据

- `docs/PRODUCT_RULES.md`（第 673 行）：新登记只进入球队长期球员库待确认，授予前不自动进入赛事正式名单。
- `docs/PLAYER_CARD_INTEGRATION.md`：基础铜/银/金卡与限定卡同属一个套件；赛事/球队/球员预装是**添加到球员 H5 卡库、与已有卡并存**，不是替换基础卡；赛事资格取最新正式名单 approved/locked。
- `AGENTS.md` 第四章球员卡复用：页面只接入已部署的统一读取接口，等级与卡种由服务端核定。

## 原因定位

- `cloudfunctions/webLoginApi/registrationCardContext.cjs#contexts()` 依据**球队**的 `tournament_teams` 参赛关系（approved/confirmed/active/locked/accepted）生成赛事候选，而不是球员是否在该赛事正式名单。
- `resolve()` 一旦拿到赛事 id 就只返回该赛事的已发布预装模板，找不到则报「本赛事球员卡尚未发布」。
- `serviceRegistrationMedia.cjs` 的 `draftCard()`（登记预览）与 `card()`（登记后展示/保存构图）都调用 `resolve()`，所以新登记的球员也会套上赛事卡。
- H5 表单在球队有多个有效赛事报名时还会渲染「制卡赛事」下拉，并把 `cardTournamentId` 放进 `getPayload()`；单赛事时前端自动带上该赛事 id，同样绕不过赛事模板。

## 改动

### 服务端（webLoginApi）

- `registrationCardContext.cjs` 新增 `base(db,tier)`：返回 `suite.activeTemplate(db,tier)`（平台基础等级卡）与 `stateId = tier`，`tournamentId`/`tournamentName` 为空、`registrationIds` 为空。`resolve()` 与其赛事解析逻辑保留，供卡库等既有入口继续使用。
- `serviceRegistrationMedia.cjs`：`draftCard()` 与 `card()` 改为 `base(db, score.tier)`。等级仍由统一数据中心结果（`playerCardForAuthorizedRegistrationDraft` / `playerCardForAuthorizedPlayer`）核定，页面不能自定卡级；模板缺失仍报 `PLAYER_CARD_TEMPLATE_UNAVAILABLE`，不默认铜卡。
- `draftCard()` 返回的 `cardTournamentId`/`tournamentName` 因此为空，弹窗状态文案不再拼接赛事名。

### 服务号 H5

- `service-entry.js`：移除登记表单里的「制卡赛事」下拉、`getPayload()` 的 `cardTournamentId`、草稿恢复时写回该字段的循环项、以及该下拉的 change 监听。登记阶段不再传赛事上下文。
- `registration-card-modal.js`：`key()` 去掉 `p.cardTournamentId`（该字段已不参与预览输入）。
- 未改动正式页 `join-player.html` 与 `service-entry.css`。

## 影响与边界

- 登记预览、登记完成后回看的初始卡统一为平台基础金/银/铜卡。
- 赛事定向预装卡不删除、不下线，仍由卡库入口（`listMyPlayerCards` / `getMyPreloadedPlayerCard` 等）按最新正式名单 approved/locked 判断资格后展示，与基础卡并存。
- 后端为共享正式后端，正式页刷新后同样走基础卡；正式页前端资源版本号未变，行为差异只在卡面卡种。

## 验证

- `node --check`：`registrationCardContext.cjs`、`serviceRegistrationMedia.cjs`、`service-entry.js`、`registration-card-modal.js` 全部通过。
- `tools/test-registration-card-context.cjs`：PASS。新增断言 `base()` 返回平台基础模板、`stateId=tier`、赛事字段为空，且多赛事时仍取基础卡、不要求选赛事。
- `tools/test-registration-card-modal-backend.cjs`：PASS。mock 的 `registrationCardContext` 只提供 `base()`，`resolve()` 一旦被调用即抛错，证明登记预览不再解析赛事模板；其余（私有场景、一次成片渲染、构图确认、分数缓存、模板/会话/过期拒绝）照旧通过。
- `tools/test-service-registration-media.cjs`：**未通过，但与本次改动无关**。失败点是 `upload()` 的抠图计数断言（`0 !== 1`）：工作区已有其他会话尚未提交的改动把 `existingTransparent` 从「仅 `keepExisting` 时复用」改为「透明 PNG 一律直通、不再调百度抠图」，该测试断言未同步。本轮未修改 `upload()`，也未擅自改这条断言；`card()` 相关断言因中断未执行到。
- 服务端发布：以线上包为基线，仅替换 `registrationCardContext.cjs`、`serviceRegistrationMedia.cjs`；`node tools/check-referee-backend-package.cjs` PASS（含报名上传权限检查）；`fn code update webLoginApi --deployMode cos` 成功；回下载两文件 SHA-256 与本地一致（`registrationCardContext.cjs` `d5f974d7…`、`serviceRegistrationMedia.cjs` `0ae50488…`）。
- 线上探针：HTTP `serviceEntryPlayerCard{draft:true}` 返回 `{"success":false,"code":"SERVICE_ENTRY_FAILED","error":"登记会话已失效，请从服务号重新打开"}`，函数在线、路由正常、无鉴权旁路。
- H5 发布：`service-entry.js`、`registration-card-modal.js`、`registration-ai-test.html` 三个文件经 `hosting deploy` 上传到 `service-account-h5`，HTTP 回读 SHA-256 全部一致（`service-entry.js` 93,247B/`f2e6a09a…`、`registration-card-modal.js` 13,486B/`1e9cdd69…`、`registration-ai-test.html` 6,260B/`811af8b8…`）。测试页资源版本升到 `?v=20261029-ai-sheet7`。

## 待办

- 用户在测试页 `service-account-h5/registration-ai-test.html` 真机确认：预览卡面为基础金/银/铜卡、不再出现赛事名，且「制卡赛事」输入项已消失。
- 验收通过后按既有流程切正式链路（`join-player.html` 打开 `aiV2` 并 bump 版本号）。
- 工作区其余未提交改动（其他会话）未纳入本次发布，也未提交 Git。
