# 蜂蜜充值与微信支付实现说明（2026-10-27）

> 范围：服务号 H5「我的蜂蜜」充值面板 + 充值订单面板 + `honey_orders` 集合 + 微信支付 APIv3（JSAPI）服务端。
> 前置文档：`docs/HONEY_TOPUP_HANDOFF_2026-10-27.md`（数据模型/错误码/文件所有权）、`docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`（价格口径）。
> **当前状态：代码本地完成，未提交、未部署。** 未配置任何微信支付凭据，线上仍按「支付未开通」展示，不创建订单、不扣款。

---

## 一、硬约束的落点（逐条对应）

| 约束 | 实现位置 | 行为 |
|---|---|---|
| `fan_points_ledger` 唯一事实来源，镜像只读校验 | `honeyRecharge.cjs#creditOrder` / `#refundOrder` | 改任何一侧之前先算账本合计，要求 `fan_profiles.honeyBalance === 账本合计`；不等即 `HONEY_RECONCILING`，不写流水、不改镜像 |
| 扣费/退回只走 `honeyWallet.cjs` | 未修改 `spendHoney`/`refundHoney` | 充值模块只调用 `readHoney`（只读）确认账户可核对，不复制扣费逻辑 |
| 入账只在服务端回调，前端「支付成功」不作数 | `honeyRecharge.cjs#handleNotify` → `#confirmOrder` → `#creditOrder` | 回调验签 → 解密 → **主动查单复核金额** → 事务内「写正数流水 + 镜像加同额 + 订单置 paid」；H5 只轮询服务端订单状态 |
| 退款式冲销 | `honeyRecharge.cjs#refundOrder` | 只写 `delta=-totalDrops` 的负数冲销流水 + 订单置 `refunded`，不删除、不改写原充值流水；**默认关闭** |
| 1 元 = 10 滴，档位不可写死 | `honeyRecharge.cjs#parsePacks` | 档位只认环境变量 `HONEY_TOPUP_PACKS`，且必须满足 `priceCents === drops * 10`；旧五档、赠滴、重复档位一律整组拒绝 |
| iOS 不售卖虚拟滴 | `service-personal.js#homeRechargeEntry` / `honeyRecharge.cjs#createOrder` | iOS 渲染 disabled 按钮；服务端 `clientPlatform==='ios'` 二次拦截 `IOS_VIRTUAL_PAYMENT_RESTRICTED` |

---

## 二、新增与修改文件

| 文件 | 类型 | 说明 |
|---|---|---|
| `cloudfunctions/webLoginApi/honeyRecharge.cjs` | 新增 | 下单、回调、查单、退款、订单列表与展示态 |
| `cloudfunctions/webLoginApi/index.js` | 修改 | ① `?action=honeyPayNotify` 在通用参数解析前拦截（保留原始报文供验签）② 注册三个 `servicePrivateHoney*` action |
| `cloudfunctions/webLoginApi/servicePrivate.cjs` | 修改 | 让三个充值 action 复用自然人会话鉴权（`referee_h5_sessions` + `hashSessionToken`） |
| `cloudfunctions/webLoginApi/servicePersonalAccount.cjs` | 修改 | `rechargeAvailable`/`rechargeReason`/`packs`/`recentOrders`，流水文案补 `honey-topup`、`honey-topup-refund` |
| `service-account-h5/service-personal.js` | 修改 | 充值面板、支付拉起、轮询确认、充值订单面板、iOS 拦截；删除本地 4 档 `HONEY_PACKS` |
| `service-account-h5/me.html` | 修改 | `service-personal.js` 版本查询串 → `?v=20261027-honey2` |
| `tools/test-honey-recharge.cjs` | 新增 | 离线自检（临时 RSA/AES 材料，不联网、不读凭据） |
| `cloudfunctions/platformOwner/index.js` | 修改 | 平台运营中心：3 个只读 action（概览/列表/详情）+ 手动加滴（查询账户/加滴/加滴记录），不开放退款 |
| `platform-admin-vue/src/views/honey-orders/HoneyOrdersAdmin.vue` | 新增 | 平台「蜂蜜充值」页：收款概览、档位分布、订单筛选分页、详情与账本一致性、手动加滴 |
| `platform-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue` | 修改 | 侧栏「营销活动 → 蜂蜜充值」入口与区块 |
| `tools/test-platform-honey-orders.cjs` | 新增 | 平台接口离线自检（只读 + 手动加滴；伪平台会话，不联网） |
| `cloudfunctions/webLoginApi/honeyRecharge.cjs` | 修改 | 新增 `paymentConfigStatus()`：支付配置体检只回「已配置/未配置/格式异常 + 脱敏指纹」，不回密钥正文；`normalizePem` 统一去首尾空白（真实换行与 `\n` 转义得同一指纹） |
| `cloudfunctions/webLoginApi/index.js` | 修改 | 注册 `platformHoneyPaymentConfig`（网页会话 + `principalType === 'platform_owner'` 才能读） |
| `platform-admin-vue/src/views/payment-settings/PaymentSettingsAdmin.vue` | 新增 | 平台「支付设置」页：配置体检表、档位只读核对、APIv3 生成器、微信侧三步指引 |
| `tools/test-platform-payment-settings.cjs` | 新增 | 支付设置体检离线自检（不返回明文、格式异常可定位、档位对比、action 鉴权闸门） |
| `cloudfunctions/webLoginApi/honeyRecharge.cjs` | 修改 | B 方案：`platform_payment_secrets` 加密存储（AES-256-GCM + `PAYMENT_SECRET_KEK`）、`ensureSecrets` 60 秒缓存与强制刷新、`savePaymentSecrets`/`clearPaymentSecrets` + 审计、`paymentConfig()`/`rechargeState()`/`paymentConfigStatus()` 改为库内优先 |
| `cloudfunctions/webLoginApi/index.js` | 修改 | 注册 `platformHoneyPaymentSecretSave` / `platformHoneyPaymentSecretClear`（仅 `platform_owner`，带操作人 IP） |
| `cloudfunctions/webLoginApi/servicePersonalAccount.cjs` | 修改 | 取充值态前 `await honeyRecharge.ensureSecrets(db)`，否则 H5「我的」读不到库内档位 |
| `platform-admin-vue/src/views/payment-settings/PaymentSettingsAdmin.vue` | 修改 | 新增「写入支付配置」表单、来源列与逐项清除、凭据存放卡片、KEK 缺失/指纹不匹配提示 |
| `tools/test-platform-payment-secrets.cjs` | 新增 | B 方案离线自检（KEK 缺失、加密入库、明文不外泄、库内优先、换 KEK、逐项/全清、审计不记值） |

未改动：`honeyWallet.cjs`、`serviceAiPortrait.cjs`、`aiPortraitDemo/**`、`service-entry.js`、`dataCenter/shared/**`。

---

## 三、接口

三个 action 全部走 `webLoginApi`（零浏览器 SDK），服务号个人中心会话鉴权：

| action | 入参 | 返回要点 |
|---|---|---|
| `servicePrivateHoneyRecharge` | `packId`（服务端档位 id，如 `pack-1000`）、`clientPlatform` | `{success, reused, order, payParams, balance}`；`payParams` 直接给 `WeixinJSBridge.getBrandWCPayRequest` |
| `servicePrivateHoneyOrders` | 无 | `{success, rows, recharge, balance}`；只返回本人订单，读取失败明确报错 |
| `servicePrivateHoneyOrderStatus` | `outTradeNo` | `{success, order, balance, recharge}`；`order.status==='pending'` 时服务端主动查单补记 |

回调入口（固定，不对外暴露业务 action）：**`https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify`**
微信支付 APIv3 的 `notify_url` **不允许携带查询串**，所以正式回调走「云开发 HTTP 访问服务」里单独加的 `/honeyPayNotify` 路径（映射到同一个 `webLoginApi` 函数），`webLoginApi` 同时按路径与 `?action=honeyPayNotify` 识别回调。可用 `WXPAY_NOTIFY_URL` 覆盖（必须是 https，且不带 query）。成功必须回 `HTTP 200 + {"code":"SUCCESS"}`。

---

## 四、环境变量（全部由云函数环境变量提供，不进仓库）

| 变量 | 必填 | 说明 |
|---|---|---|
| `WXPAY_MCH_ID` | 是 | 微信支付商户号 |
| `WXPAY_SERIAL_NO` | 是 | 商户证书序列号 |
| `WXPAY_PRIVATE_KEY` | 是 | 商户 API 私钥 PEM（`apiclient_key.pem` 内容，可含 `\n` 转义） |
| `WXPAY_APIV3_KEY` | 是 | APIv3 密钥（32 位） |
| `WXPAY_PLATFORM_PUBLIC_KEY` | 是 | 回调用验签公钥 PEM：新商户填「微信支付公钥」（`pub_key.pem`），旧商户填平台证书 PEM |
| `WXPAY_PLATFORM_SERIAL` | 否 | 回调用公钥/证书 ID：微信支付公钥填 `PUB_KEY_ID_...`；平台证书填 40 位十六进制序列号。配置后与回调头 `Wechatpay-Serial` 不一致即拒绝 |
| `WXPAY_APP_ID` | 是 | **服务号** AppID（下单与 openid 必须同主体）；可回退云函数已有的 `SERVICE_ACCOUNT_APP_ID`。**不会回退网站应用 AppID `wx5a42aae0e5d0669c`**（那是 PC 扫码登录用的网站应用，配错必然下单失败） |
| `WXPAY_NOTIFY_URL` | 否 | 回调地址覆盖值（必须是 https） |
| `HONEY_TOPUP_PACKS` | 是 | 档位 JSON，2026-10-27 已确认上架 5 档：`[{"priceCents":100,"drops":10},{"priceCents":500,"drops":50},{"priceCents":1000,"drops":100},{"priceCents":5000,"drops":500},{"priceCents":10000,"drops":1000}]` |
| `HONEY_TOPUP_REFUND_ENABLED` | 否 | 默认关闭；只有 `true` 才允许内部退款函数 |
| `WXPAY_API_BASE` | 否 | 仅调试用，默认 `https://api.mch.weixin.qq.com` |
| `PAYMENT_SECRET_KEK` | 是（B 方案） | 支付凭据加密主密钥，≥16 字符，只在云函数环境变量配一次；用于解密库内 `platform_payment_secrets`。缺失时后台保存返回 `PAYMENT_SECRET_KEK_MISSING`，读取回退环境变量 |

> 2026-10-28 起，上表中除 `WXPAY_APP_ID` / `WXPAY_NOTIFY_URL` / `WXPAY_API_BASE` / `HONEY_TOPUP_REFUND_ENABLED` 外的 7 项，也可由平台负责人在「支付设置」页填写后**加密入库**（见九D）。库内值优先于同名环境变量，环境变量保留为回退。两种方式同时存在时以库内为准。

**任一必填项缺失即 `rechargeAvailable=false`，前端不展示任何档位、不创建订单。**
凭据只放 `%LOCALAPPDATA%\SxfCloud\credentials\`（DPAPI 加密），不得读取、打印、复制或提交。

价格口径：`HONEY_TOPUP_PACKS` 里每条都必须满足 `priceCents = drops × 10`。
带 `bonusDrops` 的档位会被整组拒绝（`PRICE_BONUS_UNCONFIRMED`），因为赠滴规则尚未确认。
定妆照标价 150 / 实售 100 仍只由 `AI_PORTRAIT_HONEY_LIST_COST` / `AI_PORTRAIT_HONEY_COST` 决定，充值模块不碰。

---

## 五、`honey_orders` 集合

文档 ID = `outTradeNo`（26 位：`HT` + 北京时间 14 位 + 6 位随机 + 4 位摘要），天然唯一，无需二次去重。

| 字段 | 说明 |
|---|---|
| `outTradeNo`（=_id） | 商户单号，幂等键之一 |
| `openId` | 服务号 OpenID（账本归属，与 `fan_points_ledger.serviceAccountOpenId` 一致） |
| `userId` / `profileId` | 自然人账号与 `fan_profiles` 文档 ID 快照 |
| `packId` / `priceCents` / `drops` / `bonusDrops` / `totalDrops` | 下单时的档位快照 |
| `priceSnapshot` | 完整价格快照（含 `rate`、`packId`），回调复核用 |
| `status` | `pending` / `paid` / `closed` / `refunded` |
| `ledgerState` | `pending` / `credited` / `blocked`（`blocked` + `paid` 表示「已支付·待入账」） |
| `transactionId` | 微信支付单号（幂等键之一） |
| `prepayId` / `prepayCreatedAt` | 预支付会话，用于 90 分钟内复用待支付订单 |
| `appId` / `clientPlatform` | 下单渠道（`ios` 会被拒绝） |
| `notifyCount` / `lastNotifyAt` | 回调计数，便于对账排查 |
| `createdAt` / `paidAt` / `closedAt` / `updatedAt` | 时间戳 |

建集合与索引建议（部署时执行）：

1. 新建集合 `honey_orders`，权限设为**仅管理端可读写**（不得开放客户端直读）。
2. 索引：`openId`（升序）+ `createdAt`（降序）——订单列表、待支付复用。
3. `fan_points_ledger` 若尚无 `serviceAccountOpenId` 索引，补一条（充值/扣费都按该字段读合计）。

---

## 六、幂等与并发

1. **订单级**：`honey_orders` 文档 ID 就是 `outTradeNo`；重复回调不会生成第二条订单。
2. **流水级**：充值流水文档 ID 固定 `htp-<sha1(outTradeNo) 前 24 位>`，`refId = honey-topup:<outTradeNo>`；并发只有一条能写入。
3. **事务内复核**：进入事务后再读一次订单快照、流水、profile，要求镜像仍等于进事务前读到的账本合计，否则 `HONEY_RECONCILING`。
4. **已入账短路**：订单 `paid + credited` 或账本已含该 `refId`/流水 ID → 只补订单状态，`deduped:true`，不加滴。
5. **待入账痕迹**：因镜像/账本不一致或并发冲突失败时，订单写 `ledgerState:'blocked'` + `ledgerError`，后续主动查单可重试入账，绝不按任意一侧强行加滴。
6. **金额复核**：`mchid` / `appid` / `out_trade_no` / `amount.total === priceCents`（CNY）/ `payer.openid === order.openId` / `transaction_id` 必填，任一不符即拒绝（`HONEY_ORDER_MISMATCH` / `HONEY_AMOUNT_MISMATCH` / `HONEY_TRANSACTION_MISSING`）。

---

## 七、前端行为

- 档位与「是否可充」全部来自 `servicePrivateAccountData` 的 `wallet.packs` / `rechargeAvailable` / `rechargeReason`；页面不写死价格与档位。
- 未开通时面板显示原因文案 + 「当前不会创建订单，也不会扣款」，支付按钮 `disabled`。
- iOS（含 iPadOS 桌面模式 UA）不渲染可点击充值入口；服务端再拦一次。
  限制：服务端只能依据前端上报的 `clientPlatform` 与 UA 判断，无法从微信接口自证端类型；如需硬性拦截，需要在商户侧补充端信息校验（本轮未做）。
- 非微信环境点支付只提示「请在微信中打开后再支付」，不创建订单。
- 支付拉起用 `WeixinJSBridge.invoke('getBrandWCPayRequest')`；桥未就绪 3 秒超时给失败提示。
- **支付回调只触发「确认到账」，不加余额**；到账判定只轮询 `servicePrivateHoneyOrderStatus`（1.2/2/3/4/6 秒，最多 5 次），确认 `status==='paid'` 才刷新账户。
- 充值订单面板列出本人订单，待支付订单提供「我已完成支付，刷新状态」。

---

## 八、退款（默认关闭）

- 仅内部函数 `refundOrder(db, {outTradeNo, reason})`，**不对 HTTP 开放 action**。
- 前置：`HONEY_TOPUP_REFUND_ENABLED=true`；订单必须 `paid + credited`；账本合计 ≥ 订单滴数（已消耗则 `HONEY_REFUND_INSUFFICIENT`，人工处理）。
- 先调微信退款，成功后在事务内写负数冲销流水、镜像减同额、订单置 `refunded`；原充值流水保留不动。

---

## 九、验证记录（本轮实际执行）

| 检查 | 结果 |
|---|---|
| `node --check honeyRecharge.cjs / index.js / servicePrivate.cjs / servicePersonalAccount.cjs / service-personal.js` | 通过 |
| `node tools/test-honey-recharge.cjs` | 通过（档位口径、请求签名、回调验签含篡改/过期、AES-GCM 解密、金额与付款人复核、入账幂等、镜像漂移阻断、iOS 与未配置拦截、订单越权、回调 401/400；**完整回调路径**：签名+解密→查单复核→事务入账 200/流水+1/镜像+100、重放仍 200 且不重复加滴、查单金额不符 400 且流水与镜像不动） |
| `node tools/check-referee-backend-package.cjs cloudfunctions/webLoginApi` | 通过（裁判表识别/分组/依赖标记完整） |
| 浏览器 SDK | 未引入 `@cloudbase/js-sdk`，H5 仍走 `fetch` 调 `webLoginApi` |
| 凭据 | 仓库、日志、前端包中均无商户号/密钥/私钥 |
| `node --check cloudfunctions/platformOwner/index.js` | 通过 |
| `node tools/test-platform-honey-orders.cjs` | 通过（平台会话鉴权、汇总与成功率口径、逐日不省略零值、档位按价格降序、状态/账本状态/关键词筛选与分页、OpenID 脱敏、详情账本合计 vs 镜像一致性、镜像漂移暴露不一致、不存在单号与非法单号、集合缺失 `available:false`） |
| `platform-admin-vue` `npm run build` | 通过（含 `check-boundary.mjs`：平台独立边界检查通过，45 个源码文件） |

自检期间修正一处实现缺陷：回调验签原本对原始报文做了 `trim()`，导致改动首尾空白的报文也能验签通过；已改为按原始字节验签。
平台档位分布原按「单数优先、同单数按价格升序」排序，同单数时顺序不稳定；已改为固定按价格从高到低，单数只作分布信息。

未验证（需要真实凭据与授权）：真实下单、真实收银台、真实回调验签、真实退款、线上集合与索引。

---

## 九A、支付方案选型（微信支付官方 APIv3，不引入第三方库）

- 项目使用的就是微信支付**官方成熟方案**：APIv3 的 JSAPI 下单 / 查单 / 回调通知 / 申请退款，签名与验签按官方文档实现，已在 `#authorization`、`#wxRequest`、`#verifyNotifySignature`、`#decryptResource` 完成。
- 官方 SDK 只提供 Java / PHP / Go；**Node.js 没有官方 SDK**。GitHub 上可用的 Node 库（如 `wechatpay-node-v3`、`wechatpay-axios-plugin`）均为社区维护，非官方。
- 结论：云函数保持零新增依赖（Node 18 兼容、包体小、可控审计），**不引入社区库**。即使将来引入，也必须保留本项目自己的「查单复核金额 + 事务内幂等 + 镜像一致性」逻辑，库只能替换签名/HTTP 层。
- 自动续费不能复用 JSAPI：必须单独申请微信支付**委托代扣**能力，并在下单页同时明示首月价与续费价。

---

## 九B、平台运营中心的收款/订单能力（P0 只读已实现，P1 待确认）

收款与订单归**平台运营中心**（`pingtai.sxffootball.cn`，`platform-admin-vue`，分支 `codex/platform-ops`），不放主办方 PC 后台，因为收入、退款与对账属于平台侧职责，且 `honey_orders` 按 OpenID 归属自然人，与机构租户边界无关。

| 优先级 | 能力 | 数据来源 | 权限 | 状态 |
|---|---|---|---|---|
| P0 | 收款总览：区间销售额、笔数、支付成功率、`paid+blocked` 待入账、退款额、每日与档位分布 | `honey_orders` 聚合 | 平台负责人 | ****已上线（2026-10-27 23:22 平台前端发布 20261027152237-078009d9）**** |
| P0 | 订单查询与详情：时间/状态/账本状态/单号筛选，价格快照、微信单号、回调次数、`ledgerState`、本单流水与「账本合计 vs 镜像余额」一致性 | `honey_orders` + `fan_points_ledger` + `fan_profiles` | 平台负责人 | ****已上线（2026-10-27 23:22 平台前端发布 20261027152237-078009d9）**** |
| P1 | 退款处理：输入单号 → 校验 → 调 `refundOrder`；（退款规则确认后开放） | `refundOrder` | 平台负责人 + 二次确认 | 未做，等规则 |
| P1 | 对账：下载微信对账单与本地订单比对，输出差异清单（需商户平台账单权限） | 商户对账单 + `honey_orders` | 平台负责人 | 未做 |
| P0 | **手动加滴**：按手机号定位服务号蜂蜜账户 → 校验账本合计 = 镜像余额 → 写一条正数流水 + 镜像同额 → 留审计记录 | `fan_points_ledger` + `fan_profiles` + `honey_manual_grants` | 平台负责人 + 二次确认 | ****已上线（2026-10-27 23:22 平台前端发布 20261027152237-078009d9）**** |

技术落点：

- 后端 `cloudfunctions/platformOwner/index.js` 新增 3 个只读 action，复用 `resolveCurrentUser` + `requireOwner`（平台负责人鉴权）：
  - `honeyOrdersOverview`：`days ∈ {1,7,30,90}`（默认 7），返回 `totals`（`created/paid/pending/closed/refunded/blocked/grossYuan/refundYuan/netYuan/creditedDrops/successRate`）、`byDay`（逐日给出，不省略零值）、`byPack`（按价格从高到低）。
  - `honeyOrderList`：`status` / `ledgerState` / `keyword` / `page` / `pageSize ∈ {10,20,50}`，返回 `total / page / pageCount / scanned / truncated`。
  - `honeyOrderDetail`：`outTradeNo`（正则 `^HT[0-9A-Za-z]{6,40}$`），返回订单、价格快照、本单 `refId` 流水，以及账本合计与镜像余额是否 `consistent`。
- 只读口径：单次最多扫描最近 3000 条订单，超出如实返回 `truncated` 与说明，不把截断结果当全量；`honey_orders` 集合不存在时返回 `available:false` + 原因，而不是把 0 当成「已统计」。
- 隐私：不返回原始 OpenID（`openIdMasked` 形如 `oXyZ12****abcd`），不含手机号、不含任何商户凭据。
- 前端：`platform-admin-vue/src/views/honey-orders/HoneyOrdersAdmin.vue`，接入 `TournamentCenterAdmin.vue` 侧栏「营销活动 → 蜂蜜充值」。
- **未开放退款 action**：退款规则未确认前，平台侧只能看、不能退，避免页面默认为产品做决定。

手动加滴（2026-10-27 用户要求「在运营后台要可以手动加蜂蜜滴数」）：

- 3 个 action：`honeyGrantAccount`（按手机号或充值单号查账户与余额）、`honeyGrantDrops`（加滴）、`honeyGrantList`（最近 20 条加滴记录）。
- 定位规则：手机号 → `service_identities`（`phoneVerified:true`）的 `serviceAccountOpenId`；找不到再回退 `users`（`phone`/`phoneNumber`）→ `fan_profiles.userId`。也可从订单详情直接「给该付款账户加滴」——后端按 `outTradeNo` 反查账户，**OpenID 不返回浏览器**。命中多个直接阻断（`HONEY_ACCOUNT_CONFLICT`），不挑一条继续。
- 写入规则（与 `honeyWallet` 同口径）：先算账本合计，**镜像必须严格等于账本合计**，否则 `HONEY_RECONCILING` 且不写任何数据；事务内再复核镜像未变，然后 `honeyBalance += drops` + 写一条 `delta` 为正、`reason: honey-manual-grant`、`refId: honey-manual-grant:<requestId>` 的流水；账本超过 1000 条时拒绝（`HONEY_LEDGER_TOO_LARGE`），不按不完整合计加滴。
- 约束：只加不减；单次 1–50000 滴；原因必填 4–120 字并写入流水 `grantNote`；`requestId` 幂等（同一编号重复提交只返回原结果，不重复加滴）；审计记录写 `honey_manual_grants`（`_id = hg-<sha1(requestId)>`，含操作人、加滴前后余额、原因）。
- 页面：手机号 → 「查询账户」显示昵称/脱敏手机号、账本余额、镜像余额与是否一致；一致才出现加滴表单；提交前二次确认弹窗写明「余额 X → Y、不产生订单收入、不可在此撤回」。订单详情另有「给该付款账户加滴」入口，按单号定位同一账户。
- `honey_manual_grants` 集合已由产品负责人创建（2026-10-27），权限需设为「仅管理端可读写」。**手动加滴不替代退款**：退款仍走订单冲销，不得用加滴抹平多收或少收。

## 九C、平台「支付设置」页（A 方案：体检 + 生成器，档位只读）

用户 2026-10-27 要求「最好能在支付设置里面做支付配置页面」。提供 A/B/C 三档方案后，用户选择 **A（推荐）**：只做「配置体检 + APIv3 生成器」，档位保持只读，密钥继续只走云函数环境变量。

口径：

- **密钥永不进页面**。`platformHoneyPaymentConfig` 只回答四件事：有没有配、格式对不对、脱敏当前值、缺哪一项；APIv3 密钥只回「已配置（32 位）」，商户私钥/平台公钥只回「PEM 类型 + SHA-256 前 12 位指纹」，商户号与序列号首尾保留中间打码。
- **不在页面写环境变量**。改配置仍在云开发控制台完成，页面负责让人知道缺什么、去哪补。
- **档位只读**。页面把线上 `HONEY_TOPUP_PACKS` 展开成 chips，并与已确认 5 档（1/5/10/50/100 元 → 10/50/100/500/1000 滴）逐项对比，缺档/多档都会点名；需要变更时先由产品确认再改变量，页面只提供「复制已确认档位 JSON」。
- **APIv3 生成器**只在本页内存生成 32 位字母数字（排除 `0/O/o/1/I/l`），显示一次、可复制、刷新即消失，不落库、不上传；另提供粘贴校验框（长度 + 字符集）。

鉴权：`platformHoneyPaymentConfig` 必须先过 `authenticateWebSession(params)`，且 `principalType === 'platform_owner'` 才执行，否则返回 `PLATFORM_OWNER_REQUIRED`。上线后未带令牌探测返回该 code（已回读）。

前端：`platform-admin-vue/src/views/payment-settings/PaymentSettingsAdmin.vue`，接入 `TournamentCenterAdmin.vue` 侧栏「营销活动 → 支付设置」。样式全部带 `.pay-settings` 前缀，避免与其他视图同名 class 互相污染。

**不复制账本算法、不改 `honeyWallet.cjs` 语义、不做客户端直连 `honey_orders`。**

验证：`node tools/test-platform-honey-orders.cjs` 通过（非平台会话拒绝、汇总口径、筛选分页、关键词、OpenID 脱敏、详情账本一致性、镜像漂移暴露为不一致、不存在单号 `HONEY_ORDER_NOT_FOUND`、非法单号拦截、集合缺失 `available:false`；手动加滴：手机号定位、余额按账本合计、正数流水 + 镜像同额、原因必填、上限拦截、同一 `requestId` 重复提交不重复加滴、镜像漂移时拒绝且不改镜像）；`platform-admin-vue` 的 `npm run build` 通过（含平台独立边界检查）。

---

## 九D、支付凭据加密入库（B 方案，2026-10-28 用户批准）

用户问「就不能在后台填写保存么？」，并明确「按 B 实施，因为这个后台是平台管理方的！所以不会泄露」。九C 的 A 方案（只体检、仍去控制台改环境变量）升级为 B：**平台负责人在「支付设置」页直接填写并保存**，凭据加密存数据库，主密钥只在云函数环境变量。

### 存储与优先级

| 项 | 值 |
|---|---|
| 密文集合 | `platform_payment_secrets`，单文档 `_id = 'wxpay'`，`keys.<变量名> = { v:1, iv, tag, data }` |
| 算法 | AES-256-GCM，每项独立 12 字节 IV + 16 字节 AuthTag，Base64 存储 |
| 主密钥 | 云函数环境变量 `PAYMENT_SECRET_KEK`（≥16 字符）；实际密钥 = `sha256(PAYMENT_SECRET_KEK)`，**永不入库、不进前端、不写日志** |
| 密钥指纹 | `sha256('kek:' + keyHex).slice(0,8)`，只用于判断「库内密文是否由当前主密钥加密」，不可逆 |
| 可写字段 | `WXPAY_MCH_ID`、`WXPAY_SERIAL_NO`、`WXPAY_APIV3_KEY`、`WXPAY_PRIVATE_KEY`、`WXPAY_PLATFORM_PUBLIC_KEY`、`WXPAY_PLATFORM_SERIAL`、`HONEY_TOPUP_PACKS`（7 项） |
| 读取优先级 | 库内密文 → 同名环境变量；两者并存时**库内优先**，便于逐项迁移与回退 |
| 缓存 | 每实例 60 秒；保存/清除后本实例 `force` 立即刷新；其他实例最迟 60 秒生效 |
| 审计 | `platform_payment_secret_audit`，记录 `action / keys / operatorId / operatorName / ip / at`，**不记录任何值**；审计写入失败只告警，不阻断保存 |

不加密入库、仍只走环境变量的 2 项：`WXPAY_APP_ID`（回退 `SERVICE_ACCOUNT_APP_ID`）、`WXPAY_NOTIFY_URL`（默认纯路径 `DEFAULT_NOTIFY_URL`）——它们是公开标识与公开地址，不是凭据。

### 接口与鉴权

| action | 入参 | 行为 |
|---|---|---|
| `platformHoneyPaymentConfig` | 无 | 体检表 + `secretStore`（`kekReady / kekFingerprint / savedCount / savedKeys / decryptableCount / error`）；每项带 `source: 'db' \| 'env' \| ''` |
| `platformHoneyPaymentSecretSave` | `{ secrets: { 变量名: 值, ... } }` | 校验 → 合并旧档 → 加密写库 → 审计 → 返回新 `status`（只含脱敏信息） |
| `platformHoneyPaymentSecretClear` | `{ keys: [..] }` 或 `{ all: true }` | 删指定项或整档删除文档 → 审计 → 返回新 `status` |

三个 action 都先过 `authenticateWebSession(params)`，且 `principalType === 'platform_owner'`，否则 `PLATFORM_OWNER_REQUIRED`。操作人取会话 `userId` + 昵称 + `x-forwarded-for` 首段 IP。

错误码（由 `honeyRecharge.cjs` 内 `failResult` 保住 code，`index.js` 通用 catch 丢 code 的问题已在模块侧解决）：

- `PAYMENT_SECRET_KEK_MISSING`：未配 `PAYMENT_SECRET_KEK` 或长度不足 16；**保存前就拒绝，不写库**。
- `PAYMENT_SECRET_INVALID`：格式不合格（商户号非纯数字、序列号非字母数字、APIv3 非 32 位字母数字、PEM 缺 `-----BEGIN ...-----`、档位不满足 1 元 = 10 滴 / 含赠滴 / 重复 / 超过 8 档）；错误信息只点名变量，**不回显用户填的值**。
- `PAYMENT_SECRET_EMPTY`：提交里没有任何可写字段。
- `PAYMENT_SECRET_SAVE_FAILED` / `PAYMENT_SECRET_CLEAR_FAILED`：写库异常。

### 不变的红线

- 页面**永不回读明文**：响应只有「有没有配 / 格式对不对 / 脱敏值 / 来源 / 指纹」，没有密钥正文，也没有长度以外的信息。
- 支付链路仍只认服务端：`confirmOrder` / `handleNotify` / `refundOrder` / `createOrder` / `orderStatus` 与 `create().handle` 都先 `await ensureSecrets(db)`，读配置失败（集合不存在、KEK 缺失、密文被换过 KEK）一律按「没有」处理并由环境变量兜底，绝不让支付整体崩溃。
- `servicePersonalAccount.cjs` 在拼 `rechargeState()` 前也 `await honeyRecharge.ensureSecrets(db)`，否则服务号 H5「我的」拿不到库内档位。
- 集合权限必须在云端设为「仅管理端可读写」（客户端不得直连）。

### 风险与恢复

1. **`PAYMENT_SECRET_KEK` 只配一次**。丢失或更换后，库内旧密文全部无法解密（`decryptableCount → 0`，体检页会显示指纹不匹配告警），此时要么把旧 KEK 找回来，要么在页面重填 7 项。
2. 审计集合 `platform_payment_secret_audit` 未创建时，保存仍成功，只是 `audited: false`；创建后建议保留默认仅管理端权限。
3. 换主密钥属于凭据变更，必须单独确认并留记录。

### 前端

`platform-admin-vue/src/views/payment-settings/PaymentSettingsAdmin.vue` 新增：

- 第 4 张结论卡「凭据存放」：`{{ secretStore.savedCount }} 项已加密入库` + KEK 指纹 + 可解密数。
- KEK 缺失时的提示条（说明需先在控制台配一次 `PAYMENT_SECRET_KEK`）；密文与主密钥指纹不一致时的告警条。
- 「写入支付配置」表单：7 个输入项（私钥/公钥/档位用 textarea），只提交非空项、提交前二次确认、成功后清空输入框并立即刷新体检。
- 体检表新增「来源」列：`加密存储` / `环境变量` / `未配置`，每行可单独「清除」（仅 `db` 来源出现）。
- 「填入本页生成的密钥」与「填入已确认 5 档」把生成器/档位结果送进表单，避免来回切换窗口复制。
- 文案明确：AES-256-GCM、主密钥只在云函数环境变量、页面不回读明文。

### 验证

- `node tools/test-platform-payment-secrets.cjs`（新建）：KEK 缺失拒绝且零写库、7 项保存、响应无明文、库内仅密文且每项独立 IV/Tag、库内优先于同名环境变量、非法格式拒绝且不回显值、逐项保存不减项、换 KEK → `decryptableCount === 0`、逐项清除、全清删文档、审计不含值、审计写失败不阻断、纯环境变量路径仍可用。
- `node tools/test-platform-payment-settings.cjs`（改造为 async）：三个 action 的 `platform_owner` 闸门与统一实现调用、`source === 'env'`、`secretStore.savedCount === 0`、`kekReady === false`。
- `node tools/test-honey-recharge.cjs`：仍通过。
- `platform-admin-vue npm run build`：通过，bundle 含 `platformHoneyPaymentSecretSave` / `platformHoneyPaymentSecretClear` / `PAYMENT_SECRET_KEK` / `AES-256-GCM`，`@cloudbase/js-sdk` 计数 0。

---

## 十、上线步骤（需当前任务明确授权）

1. 确认分支归属：这批改动属 `main` 侧，但依赖的 `servicePrivate.cjs` / `servicePersonalAccount.cjs` / `honeyWallet.cjs` 目前**不在 `main`**（只在 `codex/platform-ops` 的存档提交 `4dd180fe` 与当前工作区），需要先定这组服务号个人中心代码的归属再提交，禁止整分支互相覆盖。
   建议方式（待产品负责人确认后再执行）：从 `main` 拉 `codex/honey-pay`，把「服务号个人中心 + 蜂蜜充值」作为**整组**一次提交，文件清单：`cloudfunctions/webLoginApi/{servicePrivate.cjs, servicePersonalAccount.cjs, honeyWallet.cjs, honeyRecharge.cjs}`、`cloudfunctions/webLoginApi/index.js`（只取相关片段，不带其他会话改动）、`service-account-h5/{service-personal.js, me.html}`、`tools/test-honey-recharge.cjs`；平台侧 `platformOwner/index.js` + `platform-admin-vue/**` 留在 `codex/platform-ops`。整组提交的理由是这四份云函数文件互相 import，单独提交任一份都会让线上 `servicePrivateAccountData` 或扣费入口不可用。
2. `honey_orders` 集合已由产品负责人创建（2026-10-27）：补「仅管理端可读写」权限与 `openId + createdAt` 索引；配置上表环境变量（凭据从 DPAPI 目录读取后写入，不打印）。
3. 商户平台：申请 API 证书（序列号 + `apiclient_key.pem`）、设置 APIv3 密钥、下载「微信支付公钥」（或平台证书）、关联服务号 AppID、JSAPI 支付授权目录填 `https://www.sxffootball.cn/`。回调不需要在商户平台登记，`notify_url` 随下单传入。
4. 云开发「HTTP 访问服务」新增路径 `/honeyPayNotify` → 函数 `webLoginApi`（微信支付 v3 回调不允许带查询串）。逐项操作见第十三节。
5. `node tools/check-referee-backend-package.cjs <拟上传目录>` 必须通过后再部署 `webLoginApi`；部署后回读生产 `/honeyPayNotify` 与 `servicePrivateHoneyOrders`。
6. 部署 `service-account-h5` hosting，确认 `me.html` 引用 `service-personal.js?v=20261027-honey2`。
7. 平台侧：部署 `platformOwner`（✅ 2026-10-27 23:15 已用 `fn code update` 部署并读回一致，含 3 个只读 action + 手动加滴 3 个 action），再构建发布 `platform-admin-vue` 到 `pingtai.sxffootball.cn`（✅ 2026-10-27 23:22 提交 `078009d9` 并 `npm run deploy`，release `20261027152237-078009d9`，回读 27 个文件摘要一致），读回「蜂蜜充值」页实际数据。平台负责人鉴权与「订单只读 + 只加不减」口径不变。
8. 正式发布后同步测试端（已登记的测试入口），分别读回验证。

---

## 十一、待产品负责人确认（确认前不写死）

1. ~~旧五档是否废止~~ **2026-10-27 已确认：旧五档与旧四档全部废止，只保留 1 元 = 10 滴，不设赠滴**；~~具体上架几档、每档金额~~ **2026-10-27 已确认：1 / 5 / 10 / 50 / 100 元 → 10 / 50 / 100 / 500 / 1000 滴**。
2. 退款规则（是否可退、退多少、已消耗是否可退、赠滴是否回收）；当前实现默认关闭，平台侧也未开放退款 action。
3. 蜂蜜与会员赠滴的有效期（当前无过期逻辑）。
4. 个人蜂蜜与主办方额度是否分账。
5. 会员自动续费（微信委托代扣）与首月价/续费价同时明示的排期——本轮未实现会员售卖；家庭档本轮不开放。
6. ~~平台运营中心收款/订单/退款/对账页面是否本轮启动~~ **平台运营中心 P0 只读（总览 + 订单 + 详情/账本一致性）已按 2026-10-27 授权实现；P1 退款与对账仍需退款规则与商户账单权限确认。**

---

## 十二、变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-10-27 | 建立本文；记录充值/回调/订单/退款实现、环境变量、集合与索引、验证结果与待确认项 | 代码本地完成，未提交、未部署 |
| 2026-10-27 | 产品确认旧五档/旧四档全部废止（只保留 1 元 = 10 滴），同步 `PRODUCT_RULES.md`、`MEMBERSHIP_HONEY_PRICING_2026-10-27.md`、`docs/ADR.md`；补支付选型（九A）与平台运营中心方案（九B）；`honey_orders` 集合已创建 | 文档已更新，代码未变 |
| 2026-10-27 | 产品确认上架档位 1/5/10/50/100 元；会员档位改为按月订阅制（家庭档本轮不开放）；按授权实现平台运营中心 P0 只读（`platformOwner` 3 个 action + `HoneyOrdersAdmin.vue`），新增 `tools/test-platform-honey-orders.cjs` 并通过 | 代码本地完成（平台侧），未提交、未部署 |
| 2026-10-27 | 修正两处会导致真实支付失败的问题：① v3 的 `notify_url` 不允许查询串 → 回调改为纯路径 `/honeyPayNotify`（`webLoginApi` 同时按路径识别）；② 下单 AppID 不再回退网站应用 `wx5a42aae0e5d0669c`，必须用服务号 AppID。新增第十三节开通操作步骤 | 代码本地完成，已通过自检，未部署 |
| 2026-10-27 | 按「在运营后台要可以手动加蜂蜜滴数」实现手动加滴（`honeyGrantAccount`/`honeyGrantDrops`/`honeyGrantList` + 页面区块 + 订单详情入口 + `tools/test-platform-honey-orders.cjs` 扩展），只加不减、原因必填、上限 50000 滴、`requestId` 幂等、`honey_manual_grants` 审计 | 平台侧代码完成，测试与构建通过 |
| 2026-10-27 | 部署前核查：回读线上 `webLoginApi` 包（22:38:59）与本地产物逐字节一致（119 个共有文件 SHA-256 全同），故**不再重传** `webLoginApi`（线上另有 2 个本分支没有、也未被引用的 `data-center/match-score.cjs`、`data-center/penalty-shootout.mjs`，保留原样）；`platformOwner` 线上仍是 2026-10-20 旧版（12 个 action）→ 用 `fn code update` 部署本地版（21 个 action，含蜂蜜 6 个 + AI 形象照 3 个），读回 `index.js` SHA-256 与本地一致，未带令牌调用被鉴权拒绝；`honey_manual_grants` 已创建 | 后端已上线并读回；代码未提交 |
| 2026-10-27 | 平台前端发布：提交 `078009d9`（`codex/platform-ops`）→ `npm run deploy` 到 `/var/www/pingtai/releases/20261027152237-078009d9`，脚本回读 27 个文件摘要一致；HTTP 抽查首页 200、`release.json` 提交一致、`TournamentCenterAdmin` chunk 200 且含「蜂蜜充值」「手动加滴」「honeyGrantDrops/Account/List」与「AI 形象照」 | 已上线；手动加滴需平台负责人登录后实际点测 |
| 2026-10-28 | 按用户选择的 A 方案实现平台「支付设置」页：`honeyRecharge.paymentConfigStatus()` + `webLoginApi` 的 `platformHoneyPaymentConfig`（仅平台负责人）+ `PaymentSettingsAdmin.vue` + `tools/test-platform-payment-settings.cjs` | 本地自检与构建通过，进入部署 |
| 2026-10-28 | 部署 `webLoginApi`：先跑 `check-referee-backend-package.cjs` 通过；因本地 `node_modules` 含 Windows 专用 `@resvg` 与 `.cmd` 垫片、缺线上 `@resvg/resvg-js-linux-x64-musl`，**没有整目录上传**，而是以刚下载的线上包为基线、只覆盖 `index.js` 与 `honeyRecharge.cjs` 后 `fn code update`（COS）。读回：`index.js` SHA-256 `D12A1665…B68E3`、`honeyRecharge.cjs` SHA-256 `5018F431…F1C0`，与上传包一致；线上独有的 `data-center/match-score.cjs`、`data-center/penalty-shootout.mjs` 与 `resvgjs.linux-x64-musl.node` 均保留；未带令牌探测返回 `PLATFORM_OWNER_REQUIRED` | 后端已上线并读回 |
| 2026-10-28 | 平台前端发布：提交 `6d2dce60` → release `20261027160840-6d2dce60`，脚本回读 27 个文件摘要一致；HTTP 读回 `release.json` 提交一致、`TournamentCenterAdmin-BlzGeCYi.js` 200（413,909 字节）SHA-256 与本地一致且含「支付设置」「platformHoneyPaymentConfig」「APIv3 密钥生成器」「honeyPayNotify」 | 已上线；真实配置体检需平台负责人登录后点测 |
| 2026-10-28 | 用户批准 B 方案（「按 B 实施，因为这个后台是平台管理方的！所以不会泄露」）：`honeyRecharge.cjs` 增加 `platform_payment_secrets` 加密存储（AES-256-GCM、`PAYMENT_SECRET_KEK`、60 秒缓存、库内优先/环境变量回退）、`savePaymentSecrets`/`clearPaymentSecrets` + `platform_payment_secret_audit` 审计（不记值）、7 处支付入口 `ensureSecrets`；`index.js` 注册 `platformHoneyPaymentSecretSave`/`platformHoneyPaymentSecretClear`（仅 `platform_owner`）；`servicePersonalAccount.cjs` 取充值态前刷新；页面加剧密写入表单、来源列、逐项清除、凭据存放卡与 KEK 提示；新增 `tools/test-platform-payment-secrets.cjs`、改造 `tools/test-platform-payment-settings.cjs` | 本地自检（`test-platform-payment-secrets` / `test-platform-payment-settings` / `test-honey-recharge`）与 `npm run build` 全部通过 |
| 2026-10-28 | 部署 B 方案：提交 `ddf7ca9e`。`webLoginApi` 仍按差量流程——下载线上包为基线，只覆盖 `index.js`（SHA-256 `716BE56F…319CD`）、`honeyRecharge.cjs`（`9A939A0F…E4920`）、`servicePersonalAccount.cjs`（`4E2DC738…CE98A`），`check-referee-backend-package.cjs` 通过后 `fn code update`（COS）；回读三文件摘要与上传包完全一致，`@resvg/resvg-js-linux-x64-musl` 与线上独有 `data-center/match-score.cjs`、`data-center/penalty-shootout.mjs` 全部保留。未带令牌 POST 两个新 action 均返回 `PLATFORM_OWNER_REQUIRED`。平台前端 `npm run deploy` → release `20261028053119-ddf7ca9e`，27 个文件摘要一致；HTTP 回读 `release.json` 提交一致、`TournamentCenterAdmin-UdpkQtqa.js` 421,592 字节且含 `platformHoneyPaymentSecretSave`/`platformHoneyPaymentSecretClear`/`PAYMENT_SECRET_KEK`/`AES-256-GCM`/「凭据存放」/「加密存储」/「清除全部库内配置」，`cloudbase/js-sdk` 计数 0 | 后端与平台前端均已上线并读回；真实保存需先配 `PAYMENT_SECRET_KEK` 并创建两个集合 |

---

## 十三、微信支付开通操作步骤（按顺序做）

> 商户号、AppID、密钥、证书私钥一律**不要发到聊天、文档或 Git**。本文只写变量名与取值位置；需要粘贴的值只在云开发控制台或本机 DPAPI 目录（`%LOCALAPPDATA%\SxfCloud\credentials\`）里出现。

### 第 0 步：先确认你手上有这 5 样

| 需要的值 | 从哪拿 | 对应环境变量 |
|---|---|---|
| 商户号（10 位数字） | 商户平台首页右上角 | `WXPAY_MCH_ID` |
| 商户 API 证书序列号（40 位十六进制） | 账户中心 → API 安全 → API 证书 | `WXPAY_SERIAL_NO` |
| 商户 API 私钥 `apiclient_key.pem` | 申请 API 证书时下载的压缩包内 | `WXPAY_PRIVATE_KEY` |
| APIv3 密钥（32 位，你自己设置） | 账户中心 → API 安全 → APIv3 密钥 | `WXPAY_APIV3_KEY` |
| 微信支付公钥 PEM + 公钥 ID | 账户中心 → API 安全 → 微信支付公钥（老商户是「平台证书」） | `WXPAY_PLATFORM_PUBLIC_KEY` / `WXPAY_PLATFORM_SERIAL` |
| **服务号** AppID | 公众平台 → 设置与开发 → 公众号设置 | `WXPAY_APP_ID`（或复用已有的 `SERVICE_ACCOUNT_APP_ID`） |

注意：`wx5a42aae0e5d0669c` 是**网站应用** AppID（PC 扫码用），不是服务号，不能用于 JSAPI 下单。

### 第 1 步：商户平台配置

1. 账户中心 → API 安全 → **API 证书**：申请并下载，得到 `apiclient_key.pem` 与证书序列号。
2. 账户中心 → API 安全 → **APIv3 密钥**：设置 32 位密钥（设置后不可再查看，必须当场记到本机保险位置）。
3. 账户中心 → API 安全 → **微信支付公钥**：申请并下载 `pub_key.pem`，同时记下 `PUB_KEY_ID_...`（老商户改为下载「平台证书」）。
4. 产品中心 → **AppID 账号管理**：确认服务号 AppID 已关联本商户号（未关联时下单会报 `APPID_MCHID_NOT_MATCH`）。
5. 产品中心 → 开发配置 → **JSAPI 支付**：支付授权目录填 `https://www.sxffootball.cn/`（末尾带 `/`；H5 页面就在这个目录下）。
6. 回调地址不需要在这里登记——APIv3 的 `notify_url` 是每笔下单时由服务端传入的。

### 第 2 步：云开发加回调路径

控制台 → 环境 `cloud1-7g8ckb3c7815a011` → **HTTP 访问服务** → 新增路径：

- 路径：`/honeyPayNotify`
- 绑定函数：`webLoginApi`

自检：浏览器打开 `https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify`，应返回 400/500 的 JSON（说明请求已进函数），不能是 404。这条路径就是最终回调地址，已内置为默认值，通常不需要另配 `WXPAY_NOTIFY_URL`。

### 第 3 步：云函数环境变量（webLoginApi）

在云开发控制台 → 云函数 → `webLoginApi` → 配置 → 环境变量，逐项添加第四节表格里的变量。几个格式要点：

- 私钥填**单行**，换行写成 `\n`：`-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n`（代码会自动把 `\n` 还原）。
- APIv3 密钥必须正好 32 位。
- `WXPAY_PLATFORM_SERIAL` 填 `PUB_KEY_ID_...`（用平台证书的老商户填 40 位序列号）。
- `HONEY_TOPUP_PACKS` 直接粘本文第四节给出的 5 档 JSON。

保存后无需改代码，函数读取环境变量即生效（必要时在控制台点一次「保存并重启」）。

### 第 3 步（B 方案，2026-10-28 起推荐）：在平台后台直接填写

1. 先在控制台给 `webLoginApi` 加**一个**环境变量：`PAYMENT_SECRET_KEK`（≥16 个字符，随机串，**只配这一次**，记到本机保险位置）。这是解密库内密文的主密钥；丢失或更换会导致已保存的密文全部读不出来，需要在页面重填。
2. 登录 `https://pingtai.sxffootball.cn/` → 营销活动 → **支付设置**，第 4 张卡「凭据存放」应显示「主密钥已就绪」，否则会出现绿色提示条说明缺 KEK。
3. 在「写入支付配置」区块填入 6 项凭据（商户号 / API 证书序列号 / APIv3 密钥 / 商户 API 私钥 / 微信支付公钥 / 平台公钥 ID）与档位，提交前会二次确认。私钥和公钥可以直接粘多行 PEM，不需要手工写 `\n`。
4. 保存成功后表单清空、体检表即时刷新：对应项「来源」变为**加密存储**，顶部「正常项」计数上升。
5. 档位可用「填入已确认 5 档」一键带入；APIv3 密钥可用本页生成器生成后「填入本页生成的密钥」，避免另开窗口。
6. 与第 3 步环境变量的关系：**库内值优先**，环境变量保留为回退。逐项迁移时可先保存一项、确认体检为「加密存储」，再删掉对应环境变量；要回退可在体检表该行点「清除」，即回落到环境变量。
7. 第 3 步的环境变量写法仍然有效，两处并存时以库内为准；两种方式选一种即可，不必重复填。

### 第 4 步：集合权限与索引

1. `honey_orders`：权限设「仅管理端可读写」，不要让客户端直读。
2. `honey_orders` 索引：`openId` 升序 + `createdAt` 降序。
3. `fan_points_ledger`：若没有 `serviceAccountOpenId` 索引，补一条（充值与扣费都按它汇总账本）。
4. `platform_payment_secrets`（B 方案）：新建集合，权限「仅管理端可读写」；代码会自动写入单文档 `_id='wxpay'`，不要手工改内容（改坏会导致解密失败）。
5. `platform_payment_secret_audit`（B 方案）：新建集合，权限「仅管理端可读写」；只记操作人/时间/字段名，不含任何值。未创建时保存仍成功，只是返回 `audited:false`。

### 第 5 步：部署代码（需授权）

1. `node tools/check-referee-backend-package.cjs cloudfunctions/webLoginApi` 通过后再上传 `webLoginApi`（共用后端，必须先做防回退检查）。
2. 上传 `platformOwner`。
3. 发布 `service-account-h5`（确认 `me.html` 引用 `service-personal.js?v=20261027-honey2`）。
4. 构建发布 `platform-admin-vue` 到 `pingtai.sxffootball.cn`。

### 第 6 步：1 元真实小额联调（验收口径）

1. 在微信里打开服务号 → 个人中心（`https://www.sxffootball.cn/me.html`），必须先完成服务号登录（要有 openid，否则服务端无法下单）。
2. 选 1 元档，支付 1 元。
3. 判定到账（三个条件同时满足才算成功）：
   - 订单 `status=paid`、`ledgerState=credited`；
   - `fan_points_ledger` 新增 1 条 `refId=honey-topup:<单号>`、`delta=10`；
   - `fan_profiles.honeyBalance` 同步 +10（等于账本合计）。
4. 平台运营中心 → 蜂蜜充值：能看到这笔单、金额 1 元、已入账，详情里「账本合计 = 镜像余额」为一致。
5. 再点一次同一笔支付或刷新页面，确认不重复加滴（幂等）。

### 第 7 步：常见报错对照

| 报错 | 原因 | 处理 |
|---|---|---|
| `APPID_MCHID_NOT_MATCH` | 服务号 AppID 未与商户号关联，或用了网站应用 AppID | 商户平台关联 AppID；`WXPAY_APP_ID` 改服务号 |
| `PARAM_ERROR` / 提示 notify_url 不合法 | 回调地址带了 `?action=...` | 用第 2 步的 `/honeyPayNotify` 纯路径 |
| `SIGN_ERROR` | 商户证书序列号与私钥不配套，或私钥换行被吞 | 重新粘贴单行 `\n` 格式私钥，核对序列号 |
| 回调一直不到账（订单停在 pending） | HTTP 路径没绑上，或回调验签失败 | 看 `webLoginApi` 日志里的 `[honeyRecharge]` 记录；核对公钥与 `WXPAY_PLATFORM_SERIAL` |
| 页面提示「微信支付待开通」 | 环境变量缺项 | 页面只回 `reason: PAYMENT_NOT_CONFIGURED`（不外泄变量清单）；管理员按第四节表格逐项比对 `webLoginApi` 环境变量 |
| `HONEY_RECONCILING`（订单 blocked） | 镜像余额与账本合计不一致 | 先人工核对 `fan_points_ledger`，不要按任一侧强行加滴 |

### 安全与合规

- 商户私钥、APIv3 密钥不得进仓库、日志、前端包或聊天记录。
- 支付未核验前保持「未开通」展示：任何一项必填变量缺失，前端不展示档位、不创建订单。
- iOS 端不售卖虚拟滴（代码与服务端双重拦截）。
- 自动续费属微信「委托代扣」，需单独申请，本轮未接。
