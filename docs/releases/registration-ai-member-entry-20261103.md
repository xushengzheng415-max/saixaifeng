# 球员登记 AI 形象照资金提示接线「订阅会员」（2026-11-03）

## 1. 用户反馈与结论

用户问：「那个球员登记进行AI形象照补充时，为什么订阅会员没有开放？这个接口不是已经开放了吗？」

结论：**会员接口早已开放，是登记页资金提示的按钮没回接**。

- 会员后端 `servicePrivateMembershipStatus / servicePrivateMembershipSubscribe / servicePrivateMembershipOrderStatus / servicePrivateMembershipOrders` 已于 2026-10-29 随 `webLoginApi` 上线；2026-11-03 向线上 `webLoginApi` 发送无身份 `servicePrivateMembershipStatus`，返回 `{"success":false,"code":"SERVICE_PRIVATE_AUTH_REQUIRED","error":"请重新连接微信"}`，证明 action 存在且受鉴权保护（未暴露数据）。
- 服务号「我的」（`me.html` + `service-personal.js`）会员中心可购买，档位在 2026-10-30 由平台负责人保存生效。
- 线上 `service-account-h5/service-entry.js`（发布前 93,893 B，SHA-256 `A05D8170…8294`）与仓库逐字节一致，其中 `#aiPaywall` 的「订阅会员」是 2026-10-28 面板简化时写死的 `disabled` + `<small>暂未开放</small>` 占位；会员上线后没有回接，线上显示因此落后于真实能力。

## 2. 改动

| 文件 | 改动 |
|---|---|
| `service-account-h5/service-entry.js` | 资金提示第二个按钮改为 `#aiGoMember`「订阅会员 / 去「我的」开通」，去掉 `disabled` 与「暂未开放」；点击先 `saveDraft(true)` 再跳 `./me.html`，保存失败留在本页提示（与「充值蜂蜜」同一口径）；`aiScrollToPaywall` 内 iOS 禁用该入口，提示沿用「iOS 暂不支持购买蜂蜜或会员」 |
| `service-account-h5/join-player.html`、`claim-team.html` | `service-entry.js?v=` 升至 `20261103-memberpay1` |
| `service-account-h5/registration-resume.js` | 继续登记跳转 `join-player.html` 的 `&v=` 同步升到 `20261103-memberpay1`，避免 300 秒 HTML 缓存回到旧版 |
| `service-account-h5/registration-resume.html` | `registration-resume.js?v=` 升至 `20261103-memberpay1` |
| `tools/test-registration-ai-sheet.cjs` | 增补断言：资金提示含「订阅会员」且不含「暂未开放」、非 iOS 可用 / iOS 禁用、会员入口保存草稿失败时留在本页并恢复可点 |

边界：登记页**不创建订单、不写价格、不判定首月资格**，实际可购买状态、价格与会员档位仍由「我的」会员中心按服务端返回展示（符合 `docs/PRODUCT_RULES.md`「充值/订阅按实际购买可用状态展示，不虚构已开放能力」）。iOS 继续按虚拟支付限制禁用购买。

## 3. 发布

- 目标：正式 `/service-account-h5/` 与测试端 `/preview/service-account-h5/`（只传这 5 个文件，不整目录覆盖）。
- 命令：`sxf-cloud.ps1 football run hosting deploy work\h5-memberpay1 service-account-h5`，同参数把目标换成 `preview/service-account-h5`；两次均「文件共计 5 / 上传成功 5」。
- 发布期间检测到另一会话正在发布 H5 i18n 字典变更（HTML 令牌 `20261103-dict1`，`i18n-fixed-en.js`/`i18n-runtime.js` 线上内容与本地同哈希），第一轮上传后其 `join-player.html`/`claim-team.html` 覆盖回旧 `service-entry.js` 令牌。等待其发布稳定后只补传这两个文件（`work\h5-htmlfix`，2 个文件），最终令牌保留对方的 `20261103-dict1`，无功能冲突。

## 4. 回读校验（`Cache-Control: no-cache`，连续两次、间隔 60 秒）

| 文件 | 字节 | SHA-256（前后 16 位） | 正式 | 测试 |
|---|---|---|---|---|
| `service-entry.js` | 94,880 | `1443C98116E7C6C8…` | MATCH | MATCH |
| `join-player.html` | 1,172 | `D9400587AFADD3C6…` | MATCH | MATCH |
| `claim-team.html` | 679 | `41085D1C47BDD836…` | MATCH | MATCH |
| `registration-resume.js` | 5,153 | `19C2875332236FD7…` | MATCH | MATCH |
| `registration-resume.html` | 857 | `7AFCC6B378083EF1…` | MATCH | MATCH |

内容标记（两端 `service-entry.js`）：`id="aiGoMember"` 存在、无「暂未开放」、保存草稿后跳 `./me.html`、`iOS` 禁用分支存在，4/4 PASS；三个 HTML 令牌回读均为 `20261103-memberpay1`。

## 5. 验证与未做

- 已做：三个 JS `node --check`；离线断言 6/6；线上/测试端逐字节回读 10/10 MATCH（两次一致）；线上无身份会员接口探测返回受控鉴权错误。
- 未做：`tools/test-registration-ai-sheet.cjs` 浏览器用例未跑——其依赖的桌面夹具图片（`微信图片_20261028190202_120_1931.png`、`AI证件照.png`、`图片_图片处理.png`）本机已不存在；建议补入仓库内固定夹具后再跑。
- 已知且与本次无关：`tools/test-membership.cjs`、`tools/test-membership-h5-render.cjs` 各有 1 项既有失败（权益数量/背景开放口径），本次未改会员逻辑与 `service-personal.js`。
- 测试端 `me.html`/`service-personal.js` 仍是旧令牌（`20261102-notify1` 等），与本次登记页改动无关，未整目录同步。
