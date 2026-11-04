# 我的球员卡 · AI 定妆照独立生成页（2026-11-04）

> 状态：**代码已完成并自测通过，尚未部署**（前端静态页、`webLoginApi`、`aiPortraitDemo` 均未发布）。
> 源码分支：`codex/h5-card-world-edit-20261103`，提交 `7335a9b1`（主体）+ `2b41c474`（info 接口收敛）。

## 一、这次修的是什么

用户明确指出：「为什么要到球员登记里面去？生成 AI 定妆照直接生成不就行了吗？直接进入到 AI 生成的页面不就可以了吗？」

上一版把卡面页的 AI 入口收口到「球员登记 · 形象照」，用户认为这是绕路。本次改成：

- 卡面页（`index.html`、`design.html`）的「去做 AI 定妆照」**直接进入独立生成页 `portrait.html`**；
- 生成页上传参考照片 → 选姿势 → 生成透明定妆照 → 点「使用这张形象照」→ 直接写进这张球员卡的卡面，回到卡面设计页继续调背景与构图；
- 删除了原 `js/portrait-entry.js`（球员登记中转）与相关的 `registrationEntries` / `resumeRegistration` 调用。

## 二、为什么必须动云函数

「直接生成」不只是跳转：生成的成片要能落到这名球员的卡面上，就必须有服务端能力。

现有能力边界（勘察结论）：

| 环节 | 现有实现 | 卡面场景是否可用 |
|---|---|---|
| 生图 | `aiPortraitDemo`（HTTP，透明 PNG） | 可用，但只接受 `registrationTicket` / `adminTicket` |
| 凭证 | `serviceEntryAiPortraitPrepare`（`portrait_registration_*`） | 不可用：要求 `gate.purpose === 'player_invite_entry'` |
| 入库 | `serviceRegistrationMedia.upload` → `service_entry_sessions` | 不可用：同样要求登记入口会话 |
| 卡面形象照来源 | `playerCards.cjs` 的 `standardPortrait()` | 只读 `parent_portraits` / legacy 名单照，无自助写入 |

所以新增一套**卡面专属**的能力，不复制登记链路的业务，只复用它的计费口径：

1. `webLoginApi/cardPortraitAi.cjs`（新）
   - `cardAiPortraitInfo`：当前会员价、蜂蜜余额、是否可用；
   - `cardAiPortraitPrepare`：先按当前会员价扣蜂蜜（`refId = card-ai-portrait:<requestId>`），再签发 15 分钟一次性凭证，写 `auth_sessions/portrait_card_<sha256(ticket)>`，`scope = card-portrait`，绑定 `userId` / `officialOpenId` / `playerId` / `requestId`；
   - `cardAiPortraitApply`：校验凭证归属与成片（透明 PNG、≤4MB），写回 `players.playerCardAiPortraitFileId` 与 `playerCardSourceFileId`，`playerCardVersion + 1`，并关闭凭证；
   - `cardAiPortraitCancel`：成片未生效才原路退回蜂蜜；已生效不允许退回。
2. `aiPortraitDemo/cardPortrait.cjs`（新）+ `index.js`
   - 新增 `action = cardPortraitGenerate`，校验 `cardTicket`（凭证 + 球员归属双重校验）后强制 `transparentOutput`，成片只写回该凭证文档的 `assets`，不入库、不写登记会话。
3. `playerCards.cjs`
   - 新增上述 4 个 action 的路由；
   - `standardPortrait()` 在服务号会话里优先取 `players.playerCardAiPortraitFileId`（登记邀请会话不受影响），因此卡面预览、卡库列表、卡面渲染都会用新形象照。
4. `servicePrivate.cjs`
   - OAuth 回调白名单增加 `card-world/design.html`、`card-world/portrait.html`（正式 + 预览测试路径），避免授权回来后落到无关页面。

## 三、计费口径（需要产品确认）

- 生成 + 直接写进卡面，只扣一次 `AI_PORTRAIT_HONEY_COST`（默认 **100 滴**，会员按当前会员价，标价 150 滴只用于展示折扣）；
- 因为 `apply` 同时把 `playerCardSourceFileId` 指向新形象照，**不会再触发「100 分换照片」的二次扣费**；
- 生成失败或点「返回」离开且未使用成片，走 `cardAiPortraitCancel` 原路退回；「重新生成」按新的一次生成计费（换新 `requestId`）。

> ⚠️ 待确认：`PRODUCT_RULES.md` 里「100 分换照片 / 换背景」与「100 滴定妆照」是否要合并计费仍未确认。当前实现是「AI 生成一次 100 滴，包含写到卡面」，没有叠加换照片的 100 滴。若产品要求二选一或叠加，只需改 `cardPortraitAi.apply` 与 `cardPhotoReplace` 的边界，不需要改前端。

## 四、部署清单（**当前均未执行**，需用户授权）

1. `webLoginApi`：按差量发布流程，先下载最新线上包为基线，叠加本次改动，然后
   `node tools/check-referee-backend-package.cjs <实际包目录>`（须同时通过报名上传权限检查）→ 部署 → 回下载比对 `index.js` / `playerCards.cjs` / `cardPortraitAi.cjs` / `servicePrivate.cjs` / `serviceAiPortrait.cjs`。
2. `aiPortraitDemo`：下载线上包，叠加 `cardPortrait.cjs` 与 `index.js` 的 `cardPortraitGenerate` 分支；部署后回下载核对，并验证 `registrationTicket` 链路未受影响。
3. 静态页：正式 `service-account-h5/card-world/` + 测试 `/preview/service-account-h5/card-world-ai/`（`portrait.html`、`js/portrait.js`、`js/api.js`、`js/app.js`、`js/design.js`、`index.html`、`design.html`、`css/app.css`），发布后回读 SHA-256。
4. 上线后按 AGENTS 六章要求做正式端 + 测试端同步与读回。

## 五、已完成的本地验证

- `node --check`：`webLoginApi/cardPortraitAi.cjs`、`playerCards.cjs`、`servicePrivate.cjs`、`serviceAiPortrait.cjs`、`index.js`、`aiPortraitDemo/cardPortrait.cjs`、`aiPortraitDemo/index.js`、`card-world/js/{portrait,api,app,design}.js` 全部通过。
- `.codex-artifacts/h5-card-edit-20261103/card-portrait-ai.test.js`（15 项，全部通过）：
  info 价格/余额；余额不足不扣费不发凭证；prepare 扣费与凭证内容；未知凭证拒绝；正常 apply 写入卡面素材 + 版本 +1 + 关闭凭证；凭证关闭后再 apply 被拒；已生效不允许退款；未生效原路退回；退款后重新生成重新扣费；非法 requestId 拒绝。
- `.codex-artifacts/h5-card-edit-20261103/card-portrait-demo.test.js`（10 项，全部通过）：
  凭证归属校验、球员换绑后失效、非法/过期凭证、成片写入受控目录 `restricted/player-card-portraits/...`、只保留最近三张、凭证关闭后拒绝且删除已上传文件、非 PNG 拒绝。
- `portrait.js` 里用到的 DOM id 与 `portrait.html` 逐项比对，无缺失。
- 未做：真实设备与云端联调（依赖上面三个部署动作）。

## 六、风险与回滚

- `standardPortrait()` 只在 `playerCardAiPortraitFileId` 有值时改用新素材，字段为空时行为完全不变；回滚时把该字段清空即可恢复登记形象照。
- `players` 新增字段：`playerCardAiPortraitFileId` / `Id` / `RequestId` / `Model` / `UpdatedAt`，不覆盖 `parent_portraits`，不影响人脸核验与登记链路。
- 凭证落在 `auth_sessions`，15 分钟自动失效；成片 2 小时有效，`apply` 后关闭。
- `aiPortraitDemo` 的 `registrationTicket` 链路代码未改动，只在透明输出白名单里增加 `cardContext`。

## 七、仍需产品确认

1. 谁能发起：当前限「服务号里本人或监护人绑定的球员」（`users._id` 归属校验），不含球队端代发起。
2. 生成后是否需要球队/平台审核才生效：当前**立即生效**到卡面。
3. 计费合并：见第三节。
