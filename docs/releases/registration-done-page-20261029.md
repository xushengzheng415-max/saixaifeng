# 球员登记提交后改为独立完成页（本地已改，未部署）

日期：2026-10-29
范围：`service-account-h5`（服务号球员登记 H5）
状态：**已于 2026-10-30 发布正式+测试 H5**（`?v=20261030-donepage2`），回读见 `registration-donepage-idcard-20261030.md`。未推 Git；真机验收待用户。

## 用户指令

> 「邀请，然后建球员的时候，这个球员建立完之后提交档案的时候，一定是要到最后一个确认页面的，确认已提交等待审核。」
>
> 「我意思是一个确认的空页面，然后提交成功，然后做一个页面提示你已经注册完成了，这个流程做完了。」

诉求：提交档案后必须落到一个**独立的完成确认页**，只说明「已提交、等待审核、流程结束」，不再停留在还能继续操作的表单或球员卡页。

## 改前行为（代码证据）

- `service-entry.js` 的 `serviceEntryJoinPlayer` 成功后调用 `showRegistrationCard(true, result, confirmedCardImage)`：
  同一页内渲染「球员卡预览」大标题、卡片画布、裁剪滑块、保存位置按钮，再用标题与说明表达「已提交球队确认」。
- 结论与卡混在一起，家长容易误以为还要继续操作；`completed` 分支和常规预览分支共用一套 DOM，结构耦合。

## 改后行为

- 新增 `showRegistrationDone(receipt)`：提交成功后整块替换 `content`，页面只剩完成态。
  - ✓ 图标 + 标题：待球队确认时「注册完成，等待审核」，认领/补齐（`pendingTeamConfirm=false`）时「注册完成」。
  - 说明：`球员资料已提交。球队负责人确认后正式入队，无需再次提交。` / `球员资料已登记完成。`
  - 结束语：`本流程已结束，可以关闭本页面。`
  - 出口：「继续登记其他球员」（定向邀请不显示）、「前往赛事中心「我的」查看球员卡与积分玩法」（仅非待确认）。
  - 不回读球员卡：邀请新建的档案在球队确认前回读会被服务端拒绝，完成页不展示卡也不请求卡。
- 删除 `showRegistrationCard(completed, receipt, cardImage)` 的 `completed` 分支，函数收缩为纯预览路径；同时清理 `viewMyCards` 元素与 `confirmedCardImage` 变量。
- `service-entry.css` 追加 `.done-page` 系列样式（绿色 ✓、居中结论、结束语、次要出口），沿用现有绿色 `#087d4b` 与灰色 `#627369`。
- 资源版本标记：`join-player.html`、`claim-team.html`、`registration-ai-test.html` 由 `?v=20261028-ai-sheet3` / `?v=20261029-ai-sheet7` 统一升为 `?v=20261029-donepage1`（不换标记，家长手机可能继续跑缓存的旧脚本）。

## 数据口径（未改）

- `cloudfunctions/getMiniWorkspace/playerRegistration.cjs:277`：`pendingTeamConfirm: !target`。邀请新建（无 `target`）→ 待球队确认 → 完成页显示「等待审核」；认领已有球员 → 已入队 → 「注册完成」。
- 负责人确认入口：`playerRegistration.cjs:323` 通知 `pages/team/player-library/player-library?pendingTeamConfirm=1`。
- 本产品当前**没有平台/主办方人工审核层**，这里的「审核」= 球队负责人确认入队。若将来要加平台审核，需先确认产品规则。

## 验证

- `node --check service-account-h5/service-entry.js` 通过。
- `tools/test-registration-ai-sheet.cjs`、`tools/test-player-registration.cjs` 均 PASS。
- `service-entry.css` 花括号 222/222 平衡；三个 HTML 无 BOM、`service-entry.js?v=20261029-donepage1` 引用到位。
- 线上仍是旧版：回读 `https://www.sxffootball.cn/service-account-h5/service-entry.js` 含「已提交球队确认」「登记已提交」，不含新文案 —— 说明本次改动尚未上线。

## 发布方式（待授权）

1. 上传 `service-entry.js`、`service-entry.css`。
2. 上传 `join-player.html`、`claim-team.html`、`registration-ai-test.html`（标记已升）。
3. 回读线上摘要与 `?v=` 标记确认生效，再用真实微信打开邀请链接走一遍提交，确认完成页出现。

注意：`service-entry.js` 工作区还含其他会话未提交的 AI 面板 v2 改动（`window.SXF_AI_SHEET_V2` 灰度，正式页未打开），本次发布是整文件上传，部署前须确认该灰度开关在正式页仍为关闭，避免连带打开未验收功能。

## 未完成

- 未部署、未真机验收。
- 提交前是否再加一页「资料汇总确认」尚未确认；当前确认动作由「球员卡确认弹层」承担。
- `claim-team.html`（球队认领）与 `registration-ai-test.html`（链路测试页）仅同步资源版本，未改变各自流程。
