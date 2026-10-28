# 微信支付凭据验收与上线交接（2026-10-28）

> 交接对象：接手「蜂蜜充值 + 微信支付」的研发 / 运营。
> 配套文档：`docs/HONEY_TOPUP_HANDOFF_2026-10-27.md`（数据模型与错误码）、`docs/HONEY_TOPUP_IMPLEMENTATION_2026-10-27.md`（实现与建集合步骤）、`docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`（价格口径）。
> 本文只讲一件事：**凭据已经全部填好并验收通过，但还不能真实收款，差 3 个动作。**

---

## 一、结论速览

| 结论 | 状态 |
|---|---|
| 7 项微信支付凭据已由平台负责人在「支付设置」页填写并加密入库 | ✅ 完成 |
| 7 项密文全部可解密、格式全部合法、档位符合「1 元 = 10 滴」 | ✅ 完成（本地用线上 KEK 逐项验证） |
| 商户号 + 证书序列号 + 商户私钥在微信侧匹配（证书已生效） | ✅ 完成（微信只读查单返回 `ORDER_NOT_EXIST` 而非签名错误） |
| 支付回调能进云函数 | ❌ **未通**：`/honeyPayNotify` 返回 404 |
| `honey_orders` 集合权限与索引 | ❌ **未配**：权限 `READONLY`（所有人可读），缺 `openId + createdAt` 索引 |
| 服务号 AppID 与商户号的 JSAPI 关联、JSAPI 支付授权目录 | ❓ **待人工在商户平台确认** |
| 真实 1 元下单 → 收银台 → 回调入账 → 退款联调 | ❌ 未做 |

**一句话**：钥匙配好了、锁也验证过能开，但「微信的电话（回调）打不进我们的电话线（HTTP 路径）」，所以现在对外开放收款会出现「用户付了钱、余额不动」。

---

## 二、凭据存放与链路

```
平台运营后台「支付设置」页（PaymentSettingsAdmin.vue）
        │  platformHoneyPaymentSecretSave / ...Clear（仅 platform_owner）
        ▼
webLoginApi 云函数  ── AES-256-GCM(+AAD) ──►  platform_payment_secrets（单文档 _id=wxpay）
        ▲                                              │
        │  PAYMENT_SECRET_KEK（云函数环境变量，只在云上）│ ensureSecrets() 60s 缓存
        └──────────────────────────────────────────────┘
                                                       ▼
                                      paymentConfig() / rechargeState() / paymentConfigStatus()
                                                       ▼
                        H5「我的」充值面板 / 平台体检页（库内优先，环境变量回退）
```

- **主密钥只在云函数环境变量里**：`PAYMENT_SECRET_KEK`（40 位）。指纹 **`f93e5c7c`**，算法 `sha256('kek:' + hex(sha256(KEK))).slice(0, 8)`，必须与库内 `platform_payment_secrets.kekFingerprint` 相同。
- 本机另有一份用 Windows DPAPI 加密的副本：`%LOCALAPPDATA%\SxfCloud\payment-kek\webLoginApi-payment-kek.dpapi.txt`（只能本机当前用户解开，禁止读取/打印/提交）。
- 审计：`platform_payment_secret_audit`，只记 action / 字段名 / 操作人 / 时间 / IP，**不记任何值**。

**下单入账链路**：H5 → `servicePrivateHoneyRecharge` → `honeyRecharge.createOrder`（微信 v3 JSAPI 下单，返回 `payParams`）→ 前端 `WeixinJSBridge.getBrandWCPayRequest` → 微信回调 `/honeyPayNotify` → 验签 + 解密 → **主动查单复核金额** → 事务内写 `fan_points_ledger` 正数流水 + `fan_profiles.honeyBalance` 同额 + 订单置 `paid`。

`fan_points_ledger` 是唯一事实来源，镜像只做校验；入账前若两侧不等即 `HONEY_RECONCILING`，绝不按任意一侧强改。

---

## 三、凭据现状（不含任何值，仅结构与校验结果）

| 字段 | 来源 | 校验结果 |
|---|---|---|
| `WXPAY_MCH_ID` | 库内密文 | 10 位纯数字 ✅ |
| `WXPAY_SERIAL_NO` | 库内密文（由 `apiclient_cert.pem` 自动读出） | 40 位十六进制 ✅ |
| `WXPAY_APIV3_KEY` | 库内密文 | 32 位 ✅ |
| `WXPAY_PRIVATE_KEY` | 库内密文（`apiclient_key.pem` 全文） | RSA 2048，实际签名成功 ✅ |
| `WXPAY_PLATFORM_PUBLIC_KEY` | 库内密文（`pub_key.pem`） | RSA 2048，`PUBLIC KEY` 格式 ✅ |
| `WXPAY_PLATFORM_SERIAL` | 库内密文 | `PUB_KEY_ID_…`（微信支付公钥 ID）✅ |
| `HONEY_TOPUP_PACKS` | 库内密文 | 5 档：1/5/10/50/100 元 → 10/50/100/500/1000 滴，`priceCents = drops × 10`、无赠滴 ✅ |
| `WXPAY_APP_ID` | **未入库**，回退环境变量 `SERVICE_ACCOUNT_APP_ID` | `wx00918291b0bd8b9e`（服务号）✅ |
| `WXPAY_NOTIFY_URL` | **未配置**，用默认纯路径 `/honeyPayNotify` | 见第五节第 1 项 ⚠️ |

> 服务号 AppID 是 `wx00918291b0bd8b9e`。`wx5a42aae0e5d0669c` 是**网站应用**（PC 扫码登录用），`wx57164cca8676f411` / `wxa0ac7d45bcabd140` 是两支小程序——这三个都不能填进支付配置。`docs/HONEY_TOPUP_HANDOFF_2026-10-27.md` 第 128 行把服务号写成了 `wx5a42aae0e5d0669c`，属于笔误，以本文与 `CURRENT_STATUS.md` 为准。

---

## 四、验收证据（2026-10-28 实跑，全部只读）

1. **库内文档**：`platform_payment_secrets` / `_id='wxpay'` 存在，`algorithm='aes-256-gcm'`、`version=1`、`kekFingerprint=f93e5c7c`、`updatedBy=platform-owner`，`keys` 恰好 7 项。
2. **集合权限**：`platform_payment_secrets`、`platform_payment_secret_audit` 均为 `PRIVATE`（客户端读不到）。
3. **审计**：1 条 `action=save` 记录，字段名 7 个，带操作人与 IP。
4. **解密**：把线上 KEK 注入子进程后本地解密，**7/7 可解密、7/7 通过 `normalizeSecretValue`**，`parsePacks` 得 5 档且校验通过（只输出长度与布尔值，未打印明文）。
5. **云函数视角**：用库内密文 + 线上环境变量本地复现 `paymentConfigStatus()` → `ready=true`、`rechargeAvailable=true`、`missing=[]`、`mode=public_key`、`savedCount=7`、`decryptableCount=7`。
6. **商户侧真实性（决定性）**：用库内商户号 + 序列号 + 私钥调微信支付**只读查单**（查一个不存在的商户单号）→ `HTTP 404 / code=ORDER_NOT_EXIST`。
   - 签名被接受 ⇒ 三者匹配、证书已在商户平台生效；
   - 若序列号/私钥不配套会返回 `401 SIGN_ERROR`。这是目前唯一不产生任何业务数据、又能证明凭据真实有效的验证方式。
7. **回调路径**：POST `https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify` → **404 空响应**（路径未映射）。

---

## 五、还差 3 件事

### 1）把 `/honeyPayNotify` 映射到 `webLoginApi`（最高优先级，属线上配置变更，需授权）

- 位置：腾讯云 CloudBase 控制台 → 环境 `cloud1-7g8ckb3c7815a011` → **HTTP 访问服务** → 新增路径 `/honeyPayNotify` → 指向云函数 `webLoginApi`。
- 为什么必须：微信支付 v3 的 `notify_url` 不允许带查询串，所以回调只能走「HTTP 访问服务」里单独加的路径；函数同时按**路径**与 `?action=honeyPayNotify` 识别回调。路径不通就等于付了钱不入账。
- 通过判据：POST 该路径（空报文、无签名头）应返回 **400/401 的 JSON**（验签失败），不再是 404 空响应。
- 替代方案：把 `WXPAY_NOTIFY_URL` 指向一个已能访问的 https 地址（同样不能带查询串）。注意该变量不在「支付设置」页的 7 项里，需要走环境变量/`cloudbaserc.json` 推送。

### 2）`honey_orders` 集合权限与索引（写库结构变更，需授权）

- 权限：实测 `READONLY`（所有人可读），里面含 `openId` / `userId` / `priceCents` / `drops`。应改为「仅管理端可读写」（`PRIVATE`/`ADMINONLY`）。
- 索引：现有只有 `_id_` 与 `_openid_1`，缺 `openId`（升序）+ `createdAt`（降序）——订单列表与「待支付复用」都按这两列查。
- 另建议：`fan_points_ledger` 若没有 `serviceAccountOpenId` 索引，补一条（充值/扣费都按它算合计）。

### 3）商户平台侧两项人工确认（代码查不到）

| 项 | 位置 | 正确状态 |
|---|---|---|
| 服务号 AppID 关联 | 产品中心 → **AppID 账号管理** | 列表里有 `wx00918291b0bd8b9e`，已关联且开通 JSAPI 支付 |
| JSAPI 支付授权目录 | 产品中心 → **开发配置** → JSAPI 支付 | 含 `https://www.sxffootball.cn/`（末尾带 `/`） |

未关联时下单会直接报 `APPID_MCHID_NOT_MATCH`，可以先跑一次真实下单来证伪。

顺带澄清：**v3 的支付回调地址不需要在商户平台登记**，它是下单时 `notify_url` 传的。在商户平台找不到「回调地址」不是漏配。

---

## 六、以后怎么自检（可复制的只读手段）

### A. 商户凭据是否还有效（10 秒版）

用库里 3 个字段对微信发只读查单，看返回码：

- `404 ORDER_NOT_EXIST` ⇒ 凭据有效；
- `401 SIGN_ERROR` ⇒ 序列号与私钥不配套，或证书已作废；
- `403`/`401` 其他码 ⇒ 商户号与证书主体不匹配。

签名串：`GET\n/v3/pay/transactions/out-trade-no/{单号}?mchid={商户号}\n{时间戳}\n{随机串}\n\n`（body 为空也要保留末尾换行），头部 `WECHATPAY2-SHA256-RSA2048 mchid=…,nonce_str=…,signature=…,timestamp=…,serial_no=…`。

### B. 平台侧配置体检

带着平台负责人的网页会话调 `platformHoneyPaymentConfig`，返回每项的「已配置 / 未配置 / 格式异常 + 脱敏指纹」，不会回密钥正文。未带令牌只会得到 `PLATFORM_OWNER_REQUIRED`（HTTP 200）。

### C. 用户端能不能看到档位

H5「我的」的档位与「是否可充」全部来自 `servicePrivateAccountData` 的 `wallet.packs` / `wallet.rechargeAvailable` / `wallet.rechargeReason`；页面不写死价格。`rechargeAvailable=false` 时前端必须只显示原因、不展示档位、不创建订单。

---

## 七、真实小额联调（1 元）建议顺序

1. 先做第五节 1、2 两项，再用 C 确认档位能下发（此时 `rechargeAvailable=true`）。
2. 微信内打开 `https://www.sxffootball.cn/service-account-h5/me.html`，点 1 元档 → 拉起收银台 → 支付。
3. 观察三处：`honey_orders` 是否出现 1 条 `paid + credited`；`fan_points_ledger` 是否新增 1 条 `+10`；`fan_profiles.honeyBalance` 是否 +10。
4. 故意刷新页面重复回调 → 订单仍 1 条、流水不重复（`deduped`），余额不再增加。
5. 退款：把 `HONEY_TOPUP_REFUND_ENABLED=true` 后内部调 `refundOrder`，应写 `-10` 冲销流水、镜像 -10、订单 `refunded`，原充值流水不动。
6. iOS：Safari/微信 iOS 下充值入口应为不可点，服务端 `clientPlatform='ios'` 二次拦截 `IOS_VIRTUAL_PAYMENT_RESTRICTED`。

失败对照：

| 现象 | 含义 |
|---|---|
| 下单报 `APPID_MCHID_NOT_MATCH` | 服务号 AppID 未与商户号关联 |
| 拉起收银台报「签名错误 / 当前页面的 URL 未注册」 | JSAPI 支付授权目录没包含 `https://www.sxffootball.cn/` |
| 付完余额不动、`honey_orders` 一直 `pending` | `/honeyPayNotify` 未映射，或 `WXPAY_NOTIFY_URL` 指错 |
| 订单 `paid + blocked` + `ledgerError` | 账本合计与镜像不等（先核对再入账，不会乱加滴） |
| 后台保存报 `PAYMENT_SECRET_KEK_MISSING` | 云函数没加载到 `PAYMENT_SECRET_KEK` |

---

## 八、接手必须知道的坑

1. **KEK 丢了等于密文作废**：换 KEK 后库里 7 项全部无法解密，必须在「支付设置」页重填 7 项。只在云函数环境变量和本机 DPAPI 各存一份，别把明文写进任何文档、日志、聊天记录。
2. **`cloudbaserc.json` 里的 `memorySize` 必须是 512**：线上下发是 512，文件曾被写成 256，直接 `config update` 会静默降配。
3. **`tcb config update fn webLoginApi` 会弹交互菜单**（覆盖/合并），无命令行开关；`-y` 走的是 `overwrite`。只有在确认文件里的环境变量值已与线上逐项一致时才能用 `-y`，否则会把线上变量覆盖掉。
4. **`webLoginApi` 发布必须差量**：本地 `node_modules` 含 win32 `@resvg` 二进制且缺 linux-musl，整包上传会坏。流程是「下载线上包为基线 → 只覆盖改动文件」，且上传前跑 `node tools/check-referee-backend-package.cjs <实际包目录>`。
5. **`WXPAY_PLATFORM_PUBLIC_KEY` 填公钥，不能填平台证书**；`WXPAY_PLATFORM_SERIAL` 填 `PUB_KEY_ID_…`。配错会在回调验签时才暴露，下单阶段看不出来。
6. **`WXPAY_APP_ID` 只认服务号**，代码不会回退到网站应用 AppID。
7. **网页端零 SDK**：平台后台与 H5 都走 `webLoginApi`（`fetch`），不得引入 `@cloudbase/js-sdk`。
8. **凭据文件禁止读取/打印/提交**：`%LOCALAPPDATA%\SxfCloud\credentials\`（CloudBase API Key）与 `payment-kek\`（KEK）都只在本机 DPAPI 内。

---

## 九、接口与文件索引

| 类型 | 名称 | 说明 |
|---|---|---|
| action | `platformHoneyPaymentConfig` | 配置体检（需 `platform_owner`），只回状态/来源/脱敏指纹 |
| action | `platformHoneyPaymentSecretSave` | 加密写入（仅 `platform_owner`，带操作人 IP） |
| action | `platformHoneyPaymentSecretClear` | 逐项或全量清除 |
| action | `servicePrivateHoneyRecharge` | 下单，入参 `packId` + `clientPlatform`，返回 `payParams` |
| action | `servicePrivateHoneyOrders` | 本人订单列表 |
| action | `servicePrivateHoneyOrderStatus` | 主动查单确认到账（前端只认这个） |
| 回调 | `POST /honeyPayNotify` | 微信 v3 回调，成功必须 `HTTP 200 + {"code":"SUCCESS"}` |
| 云函数 | `cloudfunctions/webLoginApi/honeyRecharge.cjs` | 加密存储、下单、回调、查单、退款、状态汇总 |
| 云函数 | `cloudfunctions/webLoginApi/index.js` | action 注册与回调前置拦截 |
| 平台前端 | `platform-admin-vue/src/views/payment-settings/PaymentSettingsAdmin.vue` | 支付设置页（支持选本机证书文件自动读序列号，不上传文件） |
| H5 | `service-account-h5/service-personal.js` | 充值面板、拉起支付、轮询确认、iOS 拦截 |
| 自检 | `tools/test-platform-payment-secrets.cjs` / `tools/test-honey-recharge.cjs` / `tools/test-platform-payment-settings.cjs` | 离线自检，不联网、不读真实凭据 |

---

## 十、待办勾选

- [ ] CloudBase HTTP 访问服务新增 `/honeyPayNotify` → `webLoginApi`（需授权）
- [ ] `honey_orders` 权限改「仅管理端可读写」+ 补 `openId + createdAt` 索引（需授权）
- [ ] 商户平台确认服务号 AppID 已关联、JSAPI 授权目录含 `https://www.sxffootball.cn/`
- [ ] 真实 1 元下单 → 回调入账 → 重复回调幂等 → 退款冲销 四段联调
- [ ] 联调通过后，再决定是否放开 iOS 之外的对外口径与运营公告

---

## 十一、变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-28 | 新建。凭据 7 项加密入库并通过本地解密 + 微信只读查单双重验收；记录主密钥指纹更正（`8A9F8C34` → `f93e5c7c`）与仍缺的回调路径、集合权限/索引、商户平台关联三项 |
