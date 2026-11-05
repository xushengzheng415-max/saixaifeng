# H5 右上角中英文按钮自闪修复（2026-11-03）

## 1. 用户现象

服务号 H5 球员登记页（`/service-account-h5/join-player.html`，小程序 web-view 内打开）右上角语言按钮「中文」一直在闪，页面内容始终是中文。

## 2. 根因

`service-account-h5/i18n-runtime.js` 的翻译重试与按钮文案互相触发，形成自持循环：

1. `localStorage.sxf_h5_lang` 已是 `en`（用户之前点过一次按钮），`boot()` 进入 `translatePage()`。
2. `queueFlush()` 发现页面仍有未翻译的中文 → `translating = true` → `updateToggle(true)` 把按钮文案改成 `…` 并禁用。
3. 这次改文案本身就是 `document.body` 子树里的一次 `characterData` mutation，而 `watch()` 用 `observe(document.body, {childList:true, subtree:true, characterData:true})`，**包含按钮自身**，于是立刻再次 `schedule()`。
4. 翻译请求失败 → `catch` → `translating = false` → `updateToggle(false)` 写回 `中文` → 又是一次 mutation → 再 `schedule()` → 再失败……按钮在 `…` / `中文` 之间无限跳，同时持续发请求。

生产必然失败的原因（实测）：

```
POST https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi
{"action":"translateUi","from":"zh","to":"en","texts":["查找球员","未找到本队档案"]}
→ {"success":false,"code":"TRANSLATE_NOT_CONFIGURED","error":"翻译服务尚未配置"}
```

即 `webLoginApi` 生产环境没有配置百度翻译密钥（`BAIDU_TRANSLATE_*`），失败后脚本没有停止条件，且第二个缺陷在翻译可用后同样会闪：按钮文案 `中文` 含汉字，`collect()` 会把它当页面文案送去翻译，`updateToggle` 写的 `中文` 与 `applyOne` 写的译文互相抢写。

## 3. 线上与仓库的版本差异（重要）

线上 `i18n-runtime.js` 为 12,354 B（`F8B1001C…5636D657`，右上角 28px 按钮 + `ensureToggleOffset` 头部避让），仓库当时是 11,420 B 的旧版（右下角 36px 按钮），**该线上版本不在仓库里**。本次以线上包为基线改动，避免用旧版覆盖线上已生效的右上角布局。

## 4. 改动（`service-account-h5/i18n-runtime.js`）

1. **切断自触发**：新增 `quietWrite()`，脚本自身写回（FIXED 译文、接口译文、按钮文案）期间 `observer.disconnect()`，写完 `takeRecords()` 丢弃自身产生的 mutation 再 `observe` 恢复；`watch()` 另加 `isToggleTarget()` 过滤，按钮与 `#sxf-i18n-toggle-style` 内的变化一律不算页面内容变化。页面自身后续的渲染仍会正常触发翻译。
2. **失败停止重试**：新增 `autoFailures` / `autoPaused` / `noteFailure()`；`TRANSLATE_NOT_CONFIGURED`、`TRANSLATE_LANG_DENIED`、`TRANSLATE_AUTH_FAILED` 视为不可恢复，立即暂停自动翻译；其它错误连续 3 次（`MAX_AUTO_FAILURES`）后暂停。`schedule()` 与 `queueFlush()` 都受 `autoPaused` 约束；暂停时清空 `pending`，避免字符串被永久标记。
3. **只有用户点击才重试**：`setLang()` 切到 `en` 时调用 `resetAutoPause()` 再 `translatePage()`；切回 `zh` 走 `restorePage()` 不再发请求。
4. **按钮不参与翻译**：按钮加 `data-i18n-skip`，`skipNode()` 已支持该标记。
5. **请求不再无限挂起**：`apiTranslate()` 增加 8 秒超时（`TRANSLATE_CLIENT_TIMEOUT`）并透传服务端 `code`，避免网络卡住时按钮长期停在 `…`。

同时把 14 个 H5 页面的 `i18n-runtime.js?v=` 统一升到 `20261103-fixed2`（原为 `20261031-fixed1`，`me.html` 为 `20261031-jersey1`），覆盖 `ai-portrait-demo`、`claim-team`、`data-center`、`index`、`join-player`、`me`、`player-card-game`、`player-card-game-demo`、`player-cards`、`registration-ai-test`、`registration-resume`、`self-register`、`tournament-center`、`valuation-self-test`。

## 5. 验证

新增 `tools/test-h5-i18n-toggle.cjs`（Playwright + 本地 http 服务 + 拦截 `webLoginApi`），4 项全部通过：

- 翻译服务未配置时只尝试一次，按钮停在「中文」且无反复切换；
- 页面新增中文内容仍会翻译，按钮文案不会被译文抢写；
- 失败后用户点击可重试，切回中文后不再发请求；
- 网络连续失败最多自动重试 3 次。

对同一用例用「修复前线上包」复现（`SXF_I18N_RUNTIME=<online baseline>`）：4 项全部失败，2.5 秒内发出 **18 次**翻译请求，按钮文案被抢写成 `EN:EN:EN:…中文`——与本条根因一致。

线上预览页实测（`/preview/service-account-h5/join-player.html`，headless）：HTTP 200，4 秒内 `translateUi` 请求 **1 次**，按钮文案变化 `中文 → … → 中文`（3 个状态，未循环）。

正式页实测（`/service-account-h5/join-player.html`，headless，`localStorage.sxf_h5_lang='en'`）：HTTP 200，4 秒内 `translateUi` 请求 **1 次**，按钮文案 `中文 → … → 中文`，与预览一致。`registration-resume.html`、`index.html` 在浏览器中会先跳 `open.weixin.qq.com` 授权页（非微信内无法停留到页面），因此只有 `join-player.html` 能在 headless 下观察按钮；两者仍按同一份 `i18n-runtime.js` 生效。

## 6. 发布状态

| 目标 | 文件 | 大小 | SHA-256 | 结果 |
|---|---|---|---|---|
| 测试端 `preview/service-account-h5/` | `i18n-runtime.js` | 15,872 B | `7DFF0DA80F736002EB92A091BF7B2E151E60AAFB8D14DC151CDE6A9A0064B7FC` | 已上传，`Cache-Control: no-cache` 回读一致 |
| 测试端 `preview/service-account-h5/` | `join-player.html` | 1,173 B | `A51FDA316743E720DA3D2AE2D26C445B211C413383C28AFEB2349CECD459A9E2` | 已上传，回读一致（正式发布后复核仍一致） |
| 正式 `service-account-h5/` | `i18n-runtime.js` | 15,872 B | `7DFF0DA80F736002EB92A091BF7B2E151E60AAFB8D14DC151CDE6A9A0064B7FC` | 已发布，回读一致 |
| 正式 `service-account-h5/` | 14 个页面入口 | — | 逐个回读一致 | 已发布，见下 |

正式 14 个页面回读（均 `Cache-Control: no-cache`，SHA-256 与上传文件逐字节一致）：

| 页面 | 大小 | SHA-256（前 16 位） | 原令牌 |
|---|---|---|---|
| `ai-portrait-demo.html` | 61,773 B | `6353EDE8D21C60CE` | `20261031-fixed1` |
| `claim-team.html` | 680 B | `E20C3BE6E34D0304` | `20261031-fixed1` |
| `data-center.html` | 1,001 B | `D3C4511D499F6FC3` | `20261101-entop1` |
| `index.html` | 6,315 B | `26B8383D52A26E51` | `20261101-entop1` |
| `join-player.html` | 1,173 B | `98CBB87B2A24B6EB` | `20261031-fixed1` |
| `me.html` | 1,206 B | `2D4CFC5067B4658F` | `20261101-entop1` |
| `player-card-game.html` | 808 B | `88C7A3C3DA1E7F20` | `20261031-fixed1` |
| `player-card-game-demo.html` | 30,372 B | `6049E911A317D409` | `20261031-fixed1` |
| `player-cards.html` | 8,129 B | `B72D7C41285FDA98` | `20261101-entop1` |
| `registration-ai-test.html` | 6,747 B | `407FA634D1692B80` | `20261031-fixed1` |
| `registration-resume.html` | 707 B | `125631B4A2A58F2E` | `20261031-fixed1` |
| `self-register.html` | 1,618 B | `DC0F16D79688EC24` | `20261031-fixed1` |
| `tournament-center.html` | 4,326 B | `A08921E55B1A5CEF` | `20261101-entop1` |
| `valuation-self-test.html` | 34,026 B | `984785BC6DFC8336` | `20261031-fixed1` |

**发布方式（防回退）**：14 个入口均按「线上现有内容 + 只改 `i18n-runtime.js?v=` 一行」重建后上传，每个文件与上传前线上包仅 1 行差异，未把仓库里其它会话的在途改动带上线。其中 `data-center`、`index`、`me`、`player-cards`、`tournament-center` 的线上内容比仓库副本新（线上令牌为 `20261101-entop1`，由其它会话发布），仓库副本内容仍停留在旧版，后续改动这 5 个页面必须先从线上包基线差量修改。

测试端 `join-player.html` 原副本（1,052 B）不含 i18n 脚本，本次只在 `</body>` 前补 `i18n-fixed-en.js` 与 `i18n-runtime.js` 两行（与新令牌一致），未改用正式页覆盖其自身资源版本。

**仍未做**：`webLoginApi` 百度翻译密钥未配置，用户点「EN」仍会失败一次后停止（不再闪），页面保持中文；如要真正中译英需单独授权配置 `BAIDU_TRANSLATE_*`。生产测速、构建产物、小程序均未改动。

> 同日接续：用户选择方案 B，英文改由 `service-account-h5/i18n-fixed-en.js` 人工字典提供，机器翻译默认关闭；后续发布见 `docs/releases/h5-i18n-dictionary-20261103.md`。本节「点 EN 仍保持中文」的结论已被该文替代，自闪修复本身仍有效。

## 7. 回退

正式发布后如需回退：把线上 12,354 B 基线包（本次存档 `work/h5-publish-20261103/online-i18n-runtime.js`，`F8B1001C…`）原样上传，并把页面令牌改回 `20261031-fixed1`/`20261031-jersey1`。注意该基线本身带自闪缺陷，仅在无法保留新版时使用。
