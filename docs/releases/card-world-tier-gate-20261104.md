# 球员卡世界：卡级灰度门禁、编辑构图入口与 AI 形象照去重（2026-11-04）

日期：2026-11-04，Asia/Shanghai。用户当轮指令（原文）：

1. 「刚才说了吗？还没有达到银卡跟金卡级别的要灰度掉，并提示要达到什么样的积分才能够解锁。」
2. 「还有就是我要进行一个图片构图的修图，我该去点哪个，但是你现在这个卡片效果下面没有编辑按钮。」
3. 「还有这个区域球员登记生成AI定妆照是不对的，直接生成AI形象照就可以了，这两个重复了。编辑卡片替换掉这个形象，对不满意这个框框里。」

## 一、源码

- 分支 `codex/h5-card-world-edit-20261103`，本轮提交 `a4887d3f`（基于上一轮 `7335a9b1`、`2b41c474`）。
- 后端：`cloudfunctions/webLoginApi/playerCards.cjs`（卡级门禁 + `tierRule`）、`cardPortraitAi.cjs`（新增）、`index.js`（4 个 `cardAiPortrait*` 路由）、`servicePrivate.cjs`（授权回跳白名单）、`serviceAiPortrait.cjs`（复用价格导出）；`cloudfunctions/aiPortraitDemo/index.js` + `cardPortrait.cjs`（新增）。
- 前端：`service-account-h5/card-world/{index,design,portrait}.html`、`js/{api,app,design,portrait}.js`、`css/app.css`。

## 二、规则实现（服务端唯一判定）

- `CARD_TIERS = bronze < silver < gold`：请求背景 rank 高于当前 `cardTier` 一律 `PLAYER_CARD_BACKGROUND_LOCKED`，提示含「生涯积分满 X 分并升到银卡/金卡」与 `unlockTier/unlockAt`。
- 会员权益（`canChangeBackground`，满 100 分或会员）**只能在同级以内换背景，不能越级**，会员不能借权益拿到未达等级的背景。
- 预览路径传 `allowLockedBackground`，可出灰度成卡并回传 `backgroundLocked/unlockAt`；保存路径不传，越级保存仍被拒。
- 门槛不写死在前端：`summary()` 下发 `tierRule = {silverAt, goldAt}`，取自 `data-center/score-rule-store.cjs` + `score-rules.parameters()`（默认 45 / 100），单次调用内缓存一次。
- 页面：未达等级显示真实成卡缩略图 + CSS 灰度 + 锁标 + 「45 / 100 分解锁」，点它提示「银卡需要生涯积分满 45 分，还差 25 分」；标题旁「还差 X 分升银卡/金卡」/「已达金卡等级」；历史越级背景打开设计页按当前卡级回退预览。
- 「卡面效果」下方新增「编辑构图」按钮，滚动定位 `#crop-panel` 并短暂高亮；删除构图区重复的 AI 按钮，AI 入口只保留「对卡面形象照不满意？」框内一个，文案统一「直接生成 AI 形象照」（「AI 定妆照」用户可见文案全部改称「AI 形象照」）。

## 三、自测

- `node --check`：`playerCards.cjs`、`index.js`、`servicePrivate.cjs`、`serviceAiPortrait.cjs`、`cardPortraitAi.cjs`、`design.js`、`app.js`、`portrait.js`、`api.js` 全部通过。
- `.codex-artifacts/h5-card-edit-20261103/card-tier-gate.test.js`：16 项通过（越级拒绝/预览灰度/会员不可越级/服务端门槛 120/兜底 100/非法背景等）。
- `.codex-artifacts/h5-card-edit-20261103/design-tier-ui.test.js`：21 项通过（最小 DOM 桩跑真实 `design.js`：灰度、锁标、「45 分解锁」「100 分解锁」、「还差 25 分升银卡」、点击提示、编辑构图定位高亮、金卡全可选、页面仅一处 AI 入口且无「球员登记」文案）。
- 回归 `card-portrait-ai.test.js`（15 项）、`card-portrait-demo.test.js`（10 项）通过。

## 四、发布（正式与测试同步，已执行）

基线均以 `fn code download` 取线上最新包差量拼装，未整文件覆盖线上更新的其它文件：

- `webLoginApi`：线上包 + 覆盖 `playerCards.cjs`、`serviceAiPortrait.cjs`、新增 `cardPortraitAi.cjs`；`index.js` 仅插入 4 个 case（+4 行）；`servicePrivate.cjs` 仅插入 4 条授权回跳白名单 + 1 行注释（+5 行）。
  - `node tools/check-referee-backend-package.cjs <staging>` PASS（含报名上传权限检查），同样对回下载包 PASS。
  - 配置读回：`Status=Active`、`AvailableStatus=Available`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=120`、`InstallDependency=TRUE`、`Handler=index.main`；`CodeSize 42,413,747 → 42,419,929`，`ModTime 2026-11-04 14:09:42`。
  - 回下载 SHA-256 与 staging 逐字节一致：`playerCards.cjs A47EB777…240506E`、`index.js A85171E8…CFE1E029`、`servicePrivate.cjs 8ABF0613…5EC3D935`、`serviceAiPortrait.cjs 3910443B…F90A1519F`、`cardPortraitAi.cjs B7726485…92ED886F`。
- `aiPortraitDemo`：线上包 + 覆盖 `index.js`（+17/−3，卡面凭证分支与 `cardPortrait.save`）、新增 `cardPortrait.cjs`。
  - 配置读回：`Active/Available`、`Nodejs18.15`、`MemorySize=256`、`Timeout=120`、`InstallDependency=TRUE`；`CodeSize 6,068,422 → 6,093,407`。
  - 回下载一致：`index.js FF38CE90…306889DD27`、`cardPortrait.cjs C0392E81…DAE6343970`，其余 4 个依赖文件不变。
- 静态页：`hosting deploy` 上传 `service-account-h5/card-world`（15 文件）与测试 `preview/service-account-h5/card-world-ai`（15 文件）。
- HTTP 回读（`Cache-Control: no-cache`，逐字节一致）：

| 文件 | 正式 | 测试 |
|---|---|---|
| design.html | `A67D9B8E…5AED4AB6` | 一致 |
| index.html | `B1F9784C…65AA9D2` | 一致 |
| portrait.html | `7C32A9F8…A20EF2C2` | 一致 |
| js/design.js | `E48980A6…9F966B06493` | 一致 |
| js/api.js | `993E00F0…3F8F933A1` | 一致 |
| js/app.js | `E9DB726D…532D0703` | 一致 |
| js/portrait.js | `4B023725…4DA10A07EB` | 一致 |
| css/app.css | `9B1C929F…5EEE88663E` | 一致 |

- 接口探针：`POST webLoginApi {action:'cardAiPortraitInfo'}` 返回 `PLAYER_CARD_AUTH_REQUIRED`（新路由已上线，未被当作未知操作）。
- 已知遗留：云端 `service-account-h5/card-world/` 仍有历史文件（`js/portrait-entry.js`、`card-world.html`、`meet-anim-demo.html`、旧版 css/js），本轮未引用也未删除，不影响当前页面。

## 五、待产品确认

1. 会员「可更换专属背景」从此只在同级以内生效，不能越级拿未达等级背景；旧文案是否需要同步调整。
2. 银卡球员换铜卡仍沿用「满 100 分或开通会员」限制，是否放开。
3. AI 形象照计费口径（生成一次 100 滴含写入卡面，不再叠加 100 分换照片）、发起人范围（当前服务号本人/监护人）、是否需审核（当前立即生效）。
