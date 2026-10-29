# 球员登记：身份证前置核验 + 「生成球员卡」按钮可读性修复

2026-10-29 按产品负责人两项反馈落地服务号球员登记链路（正式页 `join-player.html` 与链路测试页 `registration-ai-test.html` 同时生效）：

1. **身份证前置核验**：填满 18 位身份证号即核验本队是否已有同身份证档案（含「待球队确认」的入队申请档案）。命中重复就直接拦住表单提交与「生成球员卡」，不等填完整张表、生成完球员卡才被后端打回。
2. **「生成球员卡」按钮看不清**：形象照区「球员卡待确认」下面的按钮字太小、靠左、几乎不可见，改为整行、居中、16px 主按钮。

## 一、身份证前置核验

### 后端：`getMiniWorkspace` 新增 `check_id`（只读查重，不建档案）

`cloudfunctions/getMiniWorkspace/playerRegistration.cjs`，插在 `select` 分支之后、`submit/preview/check_number/confirm_restore` 白名单之前：

- `idDetails(event.idCard)` 先做格式与校验位校验，非法直接 `IDCARD_INVALID`。
- 复用 `submit` 的同一套查重口径：`readPlayers(team._id)` + `live(p)`（本队在队 + 本队待球队确认），并排除 `session.playerRegistrationChoice.playerId`（当前正在认领的目标自己不算重复），与提交时的 `conflicts` 判定完全一致，不存在「前端放行、后端仍拒绝」的错位。
- 命中时用 `pendingJoin()` 区分两种结论：
  - `PLAYER_IDCARD_PENDING`：本队已有该身份证的**入队申请正在等待球队确认**，提示「请等待球队处理」；
  - `PLAYER_IDCARD_CONFLICT`：本队已有该身份证档案，提示「请返回查找并认领」。
- 未命中返回 `{available:true, idCard, birthDate}`；`available` 与号码核验 `check_number` 的返回结构保持一致。
- **频率保护**：会话内 `playerIdCheckWindow` 60 秒窗口最多 20 次，超出 `PLAYER_IDCHECK_LIMIT`（防脚本刷库）。
- 该分支**只读**：不写 `players`、不建 choice、不读赛事卡模板/草稿/钱包，因此不需要生成球员卡的完整上下文。

### 后端：`webLoginApi` 轻量 relay

- `cloudfunctions/webLoginApi/service-entry.js` 新增 `checkPlayerId(event)`：直接 `cloud.callFunction({name:'getMiniWorkspace', data:{...event, action:'servicePlayerRegistration', operation:'check_id'}})`，失败转 `fail(code, message)`。
  不走 `context()` 重链的原因：会话鉴权已由 `getMiniWorkspace` 的 `loadServiceEntryRegistration` 完成（64 位 hex 会话、未过期、`phoneVerified===true`、gate active/purpose、`scan.subscribed`、手机号唯一账号、微信绑定一致），而查重本身不需要赛事/卡模板/钱包上下文。
- `cloudfunctions/webLoginApi/index.js` action 白名单新增 `case 'serviceEntryCheckPlayerId':`。

### 前端：独立装饰脚本（不触碰并行会话占用的共用文件）

新增 `service-account-h5/registration-idcheck.js` + `registration-idcheck.css`，`join-player.html` 与 `registration-ai-test.html` 各加一行引用，`service-entry.js` / `service-entry.css` 一字节未改（这两个文件正被另一会话的完成页改造占用且未发布）。

- `MutationObserver` 监听 `#content` 渲染，绑定表单里的 `#idCard`（登记表单与认领预填都会重新渲染，绑定后立即补一次核验，因为认领预填只调 `onchange()` 不派发事件）。
- `validIdentity()` 本地先做 18 位 / 出生日期 / 校验位校验，不合格不发请求。
- 输入 debounce 600ms，`blur` 时立即核验。
- 命中重复时在 `#idCardHint` 之后插入红字 `#idCardCheck` 与白底绿框按钮 `#idCardFindOwner`「去查找并认领」。
- **拦截**：document capture 阶段对 `#form` 的 `submit` 和 `#editRegistrationCard` 的点击 `preventDefault + stopPropagation`，把冲突文案写进 `#status` 并滚动到身份证字段 —— 重复档案无法通过提交或「生成球员卡」绕过。
- 「去查找并认领」点 `#backToSearch` 后把身份证写进 `#playerQuery` 并派发 `submit`，直接跳到查找页带出该身份证的档案。

## 二、「生成球员卡」按钮可读性修复

**根因**：`#editRegistrationCard` 用的是共用样式 `.text-action`（`min-height:40px; padding:6px 0; font-size:14px`），既没有铺满宽度也没有居中，落在形象照卡片最下方时字小、贴左，几乎看不见。

修复写在 `registration-idcheck.css`（只作用于 `.photo-card #editRegistrationCard`，不改共用样式表、不影响其他页面）：

```css
.photo-card #editRegistrationCard{display:block;width:100%;min-height:46px;margin-top:12px;padding:10px 12px;border:1px solid #087d4b;border-radius:8px;background:#087d4b;color:#fff;font-size:16px;font-weight:600;line-height:1.3;text-align:center;letter-spacing:.5px}
```

即整行、16px、白字、品牌绿主按钮、文字居中，并按 `:active` / `:disabled` 补交互与禁用态。身份证冲突时的红字提示与「去查找并认领」入口也一并落在同一文件。

## 三、验证

- `node --check`：`playerRegistration.cjs`、`webLoginApi/service-entry.js`、`webLoginApi/index.js` 全部通过。
- `node tools/test-player-registration.cjs` **PASS**（含新增 `check_id` 断言）：
  - 命中 `PLAYER_IDCARD_CONFLICT`，文案含「本队已有该身份证档案」，且**不写球员档案**（`players` 仍只有 1 条）；
  - 未占用号码返回 `available:true` 且 `birthDate==='1990-01-01'`；非法号返回 `IDCARD_INVALID`；
  - 已选认领目标自身不算重复（`available:true`）；`playerIdCheckWindow.count===3` 证明限频窗口在累加；
  - 「待球队确认」档案返回 `PLAYER_IDCARD_PENDING`（文案含「等待球队」）。
- `node tools/test-registration-idcheck.cjs` **PASS**（Playwright 隔离浏览器，375×812，全部网络被拦截，真实加载 `service-entry.css` + `registration-idcheck.css` + `registration-idcheck.js`）：
  - 按钮宽度铺满父容器（≥ 父宽 − 30px）、`font-size:16px`、背景 `rgb(8,125,75)`、白字、`text-align:center`、水平居中误差 < 2px、`hidden` 时 `display:none`；
  - 填重复身份证 → 红字提示 + 「去查找并认领」出现；点提交被拦（页面自身 submit 未执行）且 `#status` 显示冲突文案；
  - 换成未占用身份证 → 提示消失、表单可正常提交；
  - 再填重复身份证 → 点「去查找并认领」→ 查找页收到该身份证并自动查找；
  - `serviceEntryCheckPlayerId` 共 3 次且均带会话令牌。
  - 截图：`output/registration-idcheck-20261029/form-button-375.png`、`conflict-375.png`。
- 线上探针（无身份）：`POST webLoginApi {"action":"serviceEntryCheckPlayerId",…}` 返回 `{"success":false,"code":"ENTRY_SESSION_INVALID","error":"登记会话已失效，请从服务号重新打开"}`，证明 action 白名单 → relay → `check_id` 三层已生效（对照未知 action 返回「未知操作」）。

## 四、发布（差量）

### 共享后端（正式环境）

- `getMiniWorkspace`：从线上下载包差量插入 `check_id` 分支（锚点 `if (!['submit','preview','check_number','confirm_restore']`），`fn code update --deployMode cos` 后回下载比对：`playerRegistration.cjs` 41,062 B / `83015055D9EE9E8EEC58262DB4FC276925F3EACAFCDF17413690A3F97DD3CF9C`，含 `operation==='check_id'`、`playerIdCheckWindow`、`PLAYER_IDCARD_PENDING`。函数配置 `InstallDependency: TRUE` / `Nodejs18.15` / `512MB` / `150s` / `Active`，未改配置。
- `webLoginApi`：从线上下载包差量插入 `checkPlayerId` 与路由 case，发布前 `node tools/check-referee-backend-package.cjs <实际包目录>` **PASS**（含报名 Word 上传范围与裁判表模块检查）；`fn code update --deployMode cos` 后回下载：`service-entry.js` 24,419 B / `DCC79AAB8AEF622AA05DEE3F982B6BD96CD883F83D61299FDC52632CB3CE1737`、`index.js` 408,181 B / `39D2F358523AA07713C523EB2FE4A2DE5300219B40E46C185ADC16C37E24B6DD`；对回下载包再跑一次裁判表检查通过。
- 与本地仓库的差异说明（防止误判为「发布不全」）：
  - `playerRegistration.cjs` 线上 41,062 B ≠ 仓库 42,246 B，差额是**另一会话尚未发布的身份证籍贯/永久编号改造**（`nativePlace`、`nativePlaceSource`），线上确认**不含**这些字段；本次未发布他人未验收改动。
  - `webLoginApi/service-entry.js` 线上 24,419 B ≠ 仓库 24,411 B，仅插入块的换行风格不同（线上 CRLF、仓库 LF，8 行差 8 B），逐字节查看逻辑一致。

### H5 静态托管（正式页与测试页同一批）

`tcb hosting deploy` 上传 4 个文件，`www.sxffootball.cn` 带 `Cache-Control: no-cache` 回读，SHA-256 与本地逐一一致：

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `service-account-h5/registration-idcheck.js` | 9,037 B | `7ADA1E2772C5AC1D8856372827BB90558F9780C91A7EEA4F5B04A982776FA2AD` |
| `service-account-h5/registration-idcheck.css` | 1,267 B | `616BDE81DBF5E0897C93D21543C49F97D94C50C2A5368484B560B0673ECFA4B3` |
| `service-account-h5/join-player.html` | 1,052 B | `DFCD64FA412302A774FF24316466DDDD29106280051CEC964D960E6D66E78684` |
| `service-account-h5/registration-ai-test.html` | 6,626 B | `BD5212A1213EEC27E45AF2627FBA3CF65BE20375E0E1F0081A7E3C611D909735` |

- 资源版本号 `?v=20261029-idcheck1`，两页同时引用，正式页与测试页行为一致。
- 未重传 `service-entry.js`（线上 93,247 B）、`service-entry.css`（线上 17,929 B）——并行会话未发布的完成页改造不进入本次发布。

### 测试端同步（`/preview/service-account-h5/`）

按「正式发布后同步测试端」在同一任务内同步已登记的 H5 测试目录：

- 上传 `registration-idcheck.js`、`registration-idcheck.css` 两个新资源（与正式同内容、同哈希）。
- 测试目录的 `join-player.html`、`registration-ai-test.html` **保留其自身资源版本号**（`service-entry.js?v=20261029-ai-sheet7` 等），只追加两行 `registration-idcheck` 引用，不用正式页覆盖测试页。
- 回读（`Cache-Control: no-cache`）SHA-256 全部与上传副本一致：`registration-idcheck.js` 9,037 B `7ADA1E27…`、`registration-idcheck.css` 1,267 B `616BDE81…`、预览 `join-player.html` 1,008 B `769D2967…`、预览 `registration-ai-test.html` 6,626 B `26E28E10…`。
- 云函数为共享正式后端，无独立测试副本，本次不另建测试后端。

## 五、补充：确认取卡后直接提交（同日第二轮反馈）

用户反馈：填完资料、确认取卡后又回到表单，期待的是「提交成功 / 提交失败的结果页」。

### 排查结论

- 上传形象照后页面会**自动**打开球员卡弹层（`handlePhotoFile` 先 `editor.begin('正在处理照片…')`，上传成功后 `editor.generate()`），所以「确认取卡」大多发生在还没点提交的状态。原逻辑只有「先点提交 → 弹层确认」这条路会 `pendingSubmit` 自动提交；用户自己取卡确认后只回到表单，还要再往下滚找「确认新建」，很容易被当成「已经提交了」。
- 顺带发现：线上 `service-account-h5/service-entry.js`（93,247 B）**不含** 19:02 那次发布的独立完成页 `showRegistrationDone`，提交成功后走的是「球员卡预览」页并被改写标题为「登记成功 / 已提交球队确认」。本次**不改**这条路径（属于另一会话的设计，仓库 93,173 B 与线上 93,247 B 已分叉），只在交付中登记，需要恢复独立完成页时另行确认。

### 修复（仍在独立装饰脚本内，不动共用 `service-entry.js`）

- 监听弹层确认按钮：确认后回到表单且 `#photoState` 为「球员卡已确认」时，自动点击**同一个表单的提交按钮**（与用户手点完全同一条链路；授权未勾选、字段不合法仍由页面自己拦下并提示）。
- 用户自己取卡时把弹层按钮文案从「确认使用」改为「确认并提交登记」，避免以为只是再看一眼。
- 恢复上下文走的是 `restore()`（没有确认点击），因此不会被自动提交。

### 验证

新增 `tools/test-registration-confirm-submit.cjs`（Playwright 隔离浏览器，全部网络拦截、不产生真实提交，真实加载 `service-entry.js` + `registration-card-modal.js` + `registration-idcheck.js`）：

- 场景一（资料齐全 + 已勾选授权）：填表 → 上传形象照 → 弹层自动出卡 → 按钮文案为「确认并提交登记」→ 点击 → `serviceEntryJoinPlayer` **只调用 1 次** → 进入结果页（仓库分支「注册完成，等待审核」，线上分支「已提交球队确认」），表单消失。
- 场景二（未勾选授权）：确认取卡后**不提交**，留在表单并提示「请确认本人或监护人资料授权」。
- 对**线上 93,247 B 版本**和仓库 93,173 B 版本各跑一次，两版都 PASS。
- 截图：`output/registration-confirm-submit-20261029/card-modal-375.png`、`done-page-375.png`、`agree-required-375.png`。
- `tools/test-registration-idcheck.cjs` 复跑 PASS（身份证前置核验未受影响）。

### 发布（`?v=20261029-idcheck2`，正式 + 测试目录）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `service-account-h5/registration-idcheck.js` | 11,403 B | `FD432554E0181BFA52D9103BBD5156F3880FD4767FC32A83F7F92E23AAC120A4` |
| `service-account-h5/join-player.html` | 1,052 B | `0B53F873764F5BED87AE46B1C61B270421F72CB2210ABFEDDF0C15AA7A5F6D23` |
| `service-account-h5/registration-ai-test.html` | 6,626 B | `E95D459C81967121E0B3D15BAFEB4551F7B3486CB6D207813A678134C14152A8` |
| `preview/service-account-h5/registration-idcheck.js` | 11,403 B | `FD432554…`（同正式） |
| `preview/service-account-h5/join-player.html` | 1,008 B | `91A2C2C2C57BA17AD3200C993EF5B4BA56B153D5162D75AAA8DDDCEA359D2E15` |
| `preview/service-account-h5/registration-ai-test.html` | 6,626 B | `A1EA1BBE1000DD7DE7EE3F4B40D28EEAC54A43E280D87E16DA5066EF10D45320` |

回读均带 `Cache-Control: no-cache`，SHA-256 与本地/上传副本逐一一致；`registration-idcheck.css` 本次未变，未重传。

## 六、验收与后续

- 正式页：`https://www.sxffootball.cn/service-account-h5/join-player.html`
- 测试页：`https://www.sxffootball.cn/service-account-h5/registration-ai-test.html`
- 建议验收顺序：填一个**本队已存在**的身份证 → 松手后应立刻出现红字「本队已有该身份证档案，请返回查找并认领」＋「去查找并认领」→ 此时点「生成球员卡」或提交都点不动 → 点「去查找并认领」应跳查找页并自动带出身份证 → 改成未占用的身份证，提示消失、可正常生成与提交 → 形象照区的「生成球员卡」应为整行绿色主按钮、白字居中、清晰可读。
- 取卡验收：填完资料 → 上传形象照 → 弹层自动出卡 → 按钮应显示「确认并提交登记」→ 点击后应直接进入结果页（「已提交球队确认 / 登记成功」＋刚确认的球员卡），不再回到表单；未勾选授权时会留在表单并提示授权。
- 已知分叉：线上 `service-entry.js`（93,247 B）没有独立完成页 `showRegistrationDone`，仓库版本（93,173 B）有；两者对本次装饰脚本的契约一致（弹层类名、确认按钮、`#photoState` 文案、表单提交按钮），因此都能正常工作。若确认要恢复 19:02 的独立完成页，需要先合并这两份分叉，另行处理。
- 未做：未改后端提交时的重复判定（前置核验只是提前同口径提示，最终仍以后端为准）；未改号码核验逻辑；未改小程序与 PC 后台；他人未发布的籍贯/编号与完成页改造未纳入本次发布。
