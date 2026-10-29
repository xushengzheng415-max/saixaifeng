# 球员登记 AI 形象照弹层改版（先扣费后生成）测试端发布

2026-10-29 按产品负责人 5 项要求改造服务号球员登记页的 AI 形象照弹层：生成中转圈提示、生成后收起顶部示例、**先扣费后生成**、成片改为 9:16 竖版画框、操作按钮从图片右侧移到图片下方。本轮只发布 **链路测试页** 与共享后端 `webLoginApi`；正式页 `join-player.html` 一字节未改，验收通过后再切正式。

## 用户确认的 5 项要求与落点

| # | 要求 | 落点 |
|---|---|---|
| 1 | 生成时增加转圈动画，提示系统正在工作 | `service-entry.js` 新增 `#aiProgress`（`.ai-spinner` + 阶段文案：`正在校验蜂蜜并准备生成…` → `正在上传头像与球服…` → `系统正在生成形象照，约 30–75 秒，请保持页面打开`）；`service-entry.css` 新增 `.ai-progress` / `.ai-spinner` / `@keyframes aiSpin` |
| 2 | 生成后不再显示顶部示例，只展示本次生成的那张图 | 生成成功后 `aiAnim.hidden = true` 并停止示例动画，结果区 `scrollIntoView`；全程 `[hidden]{display:none!important}` 生效 |
| 3 | 先扣费后生成，不能先生成再扣费 | 见下节：服务端 `prepare` 在 `chargeFirst === true` 时**先扣蜂蜜再签发生图凭证**，失败由新增 `refund` 退回；`apply`（入库）沿用同一 `refId` 天然去重，不再二次扣费 |
| 4 | 生成按钮对应图片布局为 9:16 | `.psheet.ai-v2 .ai-portrait-frame` 固定 9:16 画框（`height:min(52vh,400px)` + 同比例 `width` 兜底，老版微信 WebView 不支持 `aspect-ratio` 时仍是竖版），图片 `object-fit:contain` 居中，透明底用棋盘格 |
| 5 | 旁边按钮移到底部而非侧面 | `.psheet.ai-v2 .ai-portrait-result` 由 `display:flex`（横向）改为 `display:block`，`.photo-actions` 由 `flex-direction:column`（右侧竖排）改为底部横排两个按钮 |

## 先扣费后生成（服务端）

`cloudfunctions/webLoginApi/serviceAiPortrait.cjs`：

- `prepare(db, loaded, event)`：新增可选参数 `chargeFirst`、`requestId`（`^[0-9A-Za-z_-]{12,64}$`）。`chargeFirst === true` 时先 `wallet().spendHoney(...)` 扣本次单价（`refId = 'ai-portrait:' + requestId`），扣费成功后才签发生图凭证；扣费抛错按 `HONEY_SPEND_FAILED` 返回并带上最新 `aiPortrait` 账户状态，不再签发票据。不传 `chargeFirst` 的老调用时序完全不变（正式页当前走这条）。
- 新增 `refund(db, loaded, event)`：按同一 `requestId` 调 `wallet().refundHoney(...)` 退回该笔未退金额，**幂等**（重复退回 `amount = 0`）。若该成片已入库（`service_entry_sessions.playerRegistrationPortraits` 中存在同 `aiRequestId`）则拒绝退回（`AI_PORTRAIT_ALREADY_SAVED`），防止"先退钱再白拿成片"。退款只用 `sessionFor` 校验会话，不再走一次 `authorize_media` 跨函数调用。
- `apply`（入库）复用同一 `refId`：若已完成扣费，`spendHoney` 命中"已扣未退"分支返回 `deduped:true`，**不重复扣费**；退回后再用同一 `requestId` 生成会开新 attempt，不会白送。

前端配合（`service-account-h5/service-entry.js`，全部由 `window.SXF_AI_SHEET_V2 === true` 门控）：

- 生成前以 `requestId` 调 `serviceEntryAiPortraitPrepare`（带 `chargeFirst:true`），成功后 `aiChargeActive = true`；生成/上传失败先提示"正在退回本次蜂蜜"再调 `serviceEntryAiPortraitRefund`，失败文案附带"已退回 N 滴，当前余额 M 滴"。
- v2 下"使用这张形象照"不再自己做余额拦截（余额已在生成前扣掉），也不重复扣费；换图前 `confirm` 明确"本次已扣的蜂蜜不会退回"，避免退成免费重试。
- 返回文案：生成前 `先扣 100 滴`；入库成功 `形象照已保存，本次已扣 100 滴蜂蜜`；空闲提示 `生成前先扣 100 滴蜂蜜，生成失败自动退回`。

`cloudfunctions/webLoginApi/service-entry.js` 新增 `refundAiPortrait(event)`；`index.js` 路由新增 `case 'serviceEntryAiPortraitRefund'`。

## 9:16 的取舍（待产品负责人确认）

`cloudfunctions/aiPortraitDemo/index.js` 的出图比例白名单只有 `3:4` / `1:1` / `4:3`（L1101），Seedream 尺寸映射同样只有这三档，线上默认模型 `hunyuan35`（混元影像 3.5）**不接收比例参数**。因此本轮把 9:16 做在**展示画框**：成片仍是 3:4，在 9:16 画框内上下留透明边居中显示（透明底即最终入库素材，不会被裁掉）。

要得到真正 9:16 的成片需要二选一，未擅自改动：
1. 生成后按中心裁切/扩图成 9:16（会裁掉头顶或脚部，需要确认裁切口径）；
2. 在 `aiPortraitDemo` 与平台后台模型目录里新增 9:16 档位（要为新尺寸单独验证出图质量与成本）。

## 验证

- `node --check`：`service-entry.js`（H5）、`service-entry.js`（云函数）、`serviceAiPortrait.cjs`、`index.js` 全部通过。
- `tools/test-registration-transparent-portrait.cjs` **PASS**，新增覆盖：`chargeFirst` 先扣后签发、入库复用同一 `refId` 余额不再变化、已入库拒绝退回、失败退回一次 + 重复退回 `amount=0`、余额不足既不扣费也不签发凭证。
- 线上探针（无身份）：`serviceEntryAiPortraitRefund` 返回 `{"success":false,"code":"SERVICE_ENTRY_FAILED","error":"登记会话已失效，请从服务号重新打开"}`，对照不存在的 action 返回 `{"success":false,"error":"未知操作：…"}`，证明新路由确实在线。

## 发布（差量）

### `webLoginApi`（共享后端，正式环境）

- 基线：`fn code download webLoginApi` 下载线上包，只覆盖 `service-entry.js`、新增 `serviceAiPortrait.cjs`、并对线上 `index.js` 插入一行 `case 'serviceEntryAiPortraitRefund':`（406,647 → 406,690 B，缩进与线上一致，未整文件覆盖）。
- 发布前 `node tools/check-referee-backend-package.cjs <包目录>`：`PASS: actual backend package retains scoped registration Word uploads and denies cross-event/invalid file type` + `裁判表识别、分组保存及必要依赖检查通过`。
- `fn code update webLoginApi --deployMode cos` 成功；`fn detail` 状态 **部署完成**，CodeSize 42,218,973 B，`Nodejs18.15 / 512MB / 120s / 自动安装依赖 TRUE`，环境变量 26 项与既有登记一致，未做任何配置变更。
- 回下载比对（SHA-256 全部一致）：
  - `index.js` 406,690 B `17F648E31C904ADD…0737E02C2`
  - `service-entry.js` 23,716 B `3D89CCEDDFA697FB…2807FB4BA`
  - `serviceAiPortrait.cjs` 13,792 B `CB2ABDF85BDA0D95…AD1910E22`

### H5 静态托管（`service-account-h5/`）

`tcb hosting deploy` 发布 3 个文件，`www.sxffootball.cn` 带 `Cache-Control: no-cache` 回读，SHA-256 与本地逐一一致：

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `service-entry.js` | 90,415 B | `63C76604E9D7A4DA…3AC25FF1` |
| `service-entry.css` | 16,382 B | `1BB9B829630DD4FC…483FAD24` |
| `registration-ai-test.html` | 6,183 B | `33FB7A8FACDFB1A6…52AD9D75` |

- 测试页资源版本号升到 `?v=20261029-ai-sheet5`（`window.SXF_AI_SHEET_V2=true` 只在测试页置位）。
- 正式页 `join-player.html` 线上与本地同摘要 `9DB6ACF72D1ABF89…`，仍引用 `?v=20261028-ai-sheet3`，**未发布、未改动**；新版 `service-entry.js` 对正式页行为无影响（v2 分支全部由开关门控，未置位的页面渲染与交互与改造前一致）。

## 验收与后续

- 测试地址：`https://www.sxffootball.cn/service-account-h5/registration-ai-test.html`
- 建议验收顺序：进弹层 → 看转圈与三段阶段文案 → 生成成功删除顶部示例、只留 9:16 竖版成片、两个按钮在图片下方 → 「使用这张形象照」提示"本次已扣 100 滴" → 故意断网/失败一次，确认红字里带"已退回 100 滴，当前余额…"。
- 通过后再切正式链路：把 `aiV2` 默认打开（`join-player.html` 置 `window.SXF_AI_SHEET_V2=true` 或去掉开关）并 bump 版本号，同时更新 `docs/CURRENT_STATUS.md`。
- 未做：出图比例仍为 3:4；未改价格、模型目录、扣费单价与蜂蜜规则；未改小程序与 PC 后台；工作区其他会话的改动未纳入本次发布。
