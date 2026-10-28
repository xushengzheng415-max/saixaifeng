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
| 支付回调能进云函数 | ✅ 已通（2026-10-28 21:27 加路由 + 开路径透传，空报文探测返回 401/400 而非 404） |
| `honey_orders` 集合权限与索引 | ✅ 完成（2026-10-28：权限 `READONLY` → `ADMINONLY`；索引 2 → 4 条，含 `openId_1_createdAt_-1` 与 `createdAt_-1`） |
| 服务号 H5 充值面板已发布到线上 | ✅ 完成（2026-10-28 深夜：`me.html` / `service-personal.js` / `service-personal-polish.css` 三个文件已发布，回读 SHA-256 与本地逐一一致） |
| 服务号 AppID 与商户号的 JSAPI 关联、JSAPI 支付授权目录 | ❓ **待人工在商户平台确认** |
| 真实 1 元下单 → 收银台 → 回调入账 → 退款联调 | ❌ 未做 |

**一句话**：钥匙配好了、锁也验证过能开，回调电话线接上了，数据库这扇门锁好了，H5 充值面板也发上去了；剩下只有「商户平台两处授权」这一件事，以及最后走一遍真实 1 元。

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
| `WXPAY_NOTIFY_URL` | **未配置**，用默认纯路径 `/honeyPayNotify` | 见第五节第 1 项 ✅（路由已映射，无需另配环境变量） |

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
7. **回调路径**：POST `https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify` → 当时为 **404 空响应**（路径未映射）；同日晚已加路由并开启路径透传，复测转为 400/401，详见第五节第 1 项。
8. **`honey_orders` 安全配置（2026-10-28 晚）**：改前 `DescribeSafeRule` = `AclTag:READONLY`、`listIndexes` 只有 `_id_` + `_openid_1`；改后回读 `AclTag:ADMINONLY`、索引 4 条（新增 `openId_1_createdAt_-1`、`createdAt_-1`），`numIndexesBefore 2 → numIndexesAfter 4`，详见第五节第 2 项。

---

## 五、还差的 3 件事（第 1、2 件已完成）

### 1）把 `/honeyPayNotify` 映射到 `webLoginApi` —— ✅ 已完成（2026-10-28 21:27）

实际做法（供以后复现/迁移）：

- **位置**：CloudBase 控制台 → 环境 `cloud1-7g8ckb3c7815a011` → 左侧 **HTTP 访问** → 「域名及路由」。
- **不能加在 `*`（通配域名）组**：控制台对该组禁用新增，提示「由于通配域名数量过大，当前仅可以在具体域名上添加路由」。
- 加在**具体域名** `cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com` 下，路径 `/honeyPayNotify`、资源类型云函数、资源对象 `webLoginApi`、启用开、**身份认证关**、安全域名关、**路径透传开**。
- CLI 等价命令（`-y` 用于跳过交互确认）：
  - 新增：`routes add --data '{"domain":"cloud1-…app.tcloudbase.com","routes":[{"path":"/honeyPayNotify","upstreamResourceType":"SCF","upstreamResourceName":"webLoginApi","enable":true,"enableAuth":false,"enableSafeDomain":false}]}'`
  - 改路径透传：`routes edit --data '{"domain":"cloud1-…app.tcloudbase.com","routes":[{"path":"/honeyPayNotify","enablePathTransmission":true}]}' -y`

**踩到的坑（很重要）**：只加路由还不够。**路径透传必须开启**，否则 HTTP 访问服务传给云函数的 `event.path` 不是 `/honeyPayNotify`，`index.js` 里基于路径的回调识别匹配不上，请求会掉进通用 action 路由并返回 `{"success":false,"error":"未知操作：undefined"}`（HTTP 200，很容易误判成"通了"）。

复测判据（本次实测）：

| 请求 | 结果 | 含义 |
|---|---|---|
| POST 空报文 `/honeyPayNotify` | `400` | 已进回调处理器（报「请求体为空」） |
| POST 带报文但无签名头 `/honeyPayNotify` | `401` | 已进回调处理器（验签失败） |
| POST 带报文 `/honeyPayNotify?action=honeyPayNotify` | `401` | 查询串兜底同样可用 |

> 注意：4xx 时网关不回传函数生成的 JSON 报文（响应体为空），只有 200 才回传；所以"看响应体"判断不了，**要看状态码**：401/400 才是通，200 + `未知操作` 才是没匹配上，404 才是没映射。


### 2）`honey_orders` 集合权限与索引 —— ✅ 已完成（2026-10-28 晚，用户授权执行）

改前实测：`AclTag=READONLY`（**所有人可读**，而文档里有 `openId` / `userId` / `priceCents` / `drops`），索引只有 `_id_` 与 `_openid_1`。

实际做法（管理员 CLI，只动这一个集合）：

```powershell
# 1) 权限：READONLY → ADMINONLY（仅管理端可读写）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run api tcb ModifySafeRule --body '{"EnvId":"cloud1-7g8ckb3c7815a011","CollectionName":"honey_orders","AclTag":"ADMINONLY"}'
# 2) 索引用 Mongo 原生 createIndexes（CloudBase 控制台「索引管理」可视化加也可）
... db nosql execute --command '[{"TableName":"honey_orders","CommandType":"COMMAND","Command":"{\"createIndexes\":\"honey_orders\",\"indexes\":[{\"key\":{\"openId\":1,\"createdAt\":-1},\"name\":\"openId_1_createdAt_-1\"},{\"key\":{\"createdAt\":-1},\"name\":\"createdAt_-1\"}]}"}]'
```

改后回读：`AclTag=ADMINONLY`；索引 4 条 = `_id_`、`_openid_1`、`openId_1_createdAt_-1`、`createdAt_-1`（`numIndexesBefore 2 → numIndexesAfter 4`）。

为什么是这两条索引（对应现有代码，不是拍脑袋）：

- `openId_1_createdAt_-1`：`honeyRecharge.cjs#listOrders` / `#findReusableOrder` 都是「按 `openId` 过滤 + 按 `createdAt` 倒序」。
- `createdAt_-1`：`platformOwner.cjs#readHoneyOrders` 是全局 `orderBy('createdAt','desc').limit(3000)`（平台总览/订单列表/筛选都在内存里做），没有这条会退化成全表扫描。

**改权限后不影响功能的原因**（已核对代码）：`honey_orders` 只由云函数（管理端）读写；H5 订单面板走 `servicePrivateHoneyOrders`、平台页走 `platformOwner`，**没有任何客户端 SDK 直连**。因此 `ADMINONLY` 符合「网页端零 SDK」红线，也不会让任何页面读不到数据。

**未做（按需再定，不属本次授权范围）**：`fan_points_ledger` 目前没有 `serviceAccountOpenId` 索引，充值/扣费都按该字段算合计，数据量上来后建议补一条（本次未动该集合）。

**控制台对应关系（重要，容易误点）**：控制台「数据库 → 某集合 → 数据权限」这五个选项一一对应 `AclTag`，**点选即生效、没有「保存」按钮**：

| 控制台选项 | `AclTag` | 说明 |
|---|---|---|
| 所有用户可读，仅创建者可读写 | `READONLY` | 原状态（不安全） |
| 仅创建者可读写 | `PRIVATE` | `fan_points_ledger` 用的是这个 |
| 所有用户可读 | `ADMINWRITE` | 客户端可读 |
| **所有用户不可读写（适用场景：后台流水数据等）** | **`ADMINONLY`** | **`honey_orders` 应选这个** |
| 自定义安全规则 | `CUSTOM` | — |

踩坑：浏览器里**打开过但没刷新的控制台页面显示的是旧值**（仍高亮第一项），此时在该页任何点选都会把旧值写回线上。2026-10-28 晚就发生过一次权限被写回 `READONLY`，已重新设为 `ADMINONLY` 并间隔 45 秒两次回读确认。改完务必 `Ctrl+F5` 刷新再核对；同一页的「索引管理」应显示 4 条索引。

### 3）商户平台侧两项人工确认（代码查不到，由用户线上操作）

| 项 | 位置 | 正确状态 |
|---|---|---|
| 服务号 AppID 关联 | pay.weixin.qq.com → 产品中心 → **AppID 账号管理** → 关联 AppID | 列表里有 `wx00918291b0bd8b9e`，且该行的「服务号」能力是**已授权/已绑定** |
| JSAPI 支付授权目录 | pay.weixin.qq.com → 产品中心 → **开发配置** → JSAPI 支付 → 支付授权目录 | 至少一条 `https://www.sxffootball.cn/`（**协议 https、末尾带 `/`**） |

操作顺序建议：先确认 AppID 关联（缺了必然 `APPID_MCHID_NOT_MATCH`），再核授权目录（缺了能下单但拉起收银台报「当前页面的 URL 未注册」）。

两项都只影响「能否下单/拉起收银台」，**不影响已完成的凭据、路由、集合配置**；改完不需要重填「支付设置」页的任何一项，也不需要重新部署云函数（配置每 60 秒自动重读）。

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

1. 第五节 1、2 两项已完成；先按第六节 C 确认档位能下发（此时 `rechargeAvailable=true`），再做商户平台两项确认。
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
9. **「点充值只弹『充值暂未开放』」＝ H5 没发布，不是支付没配好**（2026-10-28 实际踩到）：旧版 `service-personal.js` 里是纯静态弹窗 `modal('蜂蜜充值','<p>充值暂未开放</p><p>当前不会创建订单或扣款。</p>')`，**一次网络请求都不发**。判定方法：下载线上 `https://www.sxffootball.cn/service-account-h5/service-personal.js`，看是否含 `servicePrivateHoneyRecharge`，并比对 `me.html` 引用的版本号（正确应为 `service-personal.js?v=20261027-honey2`、`service-personal-polish.css?v=20261025-honey1`）。修复＝用 `hosting deploy` 上传 `me.html` + `service-personal.js` + `service-personal-polish.css` 三个文件，再回读 SHA-256 比对。
10. **H5 静态发布走 CloudBase 静态托管**：`sxf-cloud.ps1 football run hosting deploy service-account-h5/<文件名> service-account-h5/<文件名>`；传完 CDN 有几秒到几分钟延迟，回读时加 `Cache-Control: no-cache` 与查询串，并以「线上字节 SHA-256 与本地一致」为验收判据。

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

- [x] CloudBase HTTP 访问服务新增 `/honeyPayNotify` → `webLoginApi`（2026-10-28 21:27，含路径透传，已复测 400/401）
- [x] `honey_orders` 权限改「仅管理端可读写」+ 补 `openId + createdAt` 索引（2026-10-28 晚，已回读 `ADMINONLY` 与 4 条索引；另补 `createdAt_-1` 供平台全局倒序）
- [x] 服务号 H5 充值面板发布到线上（2026-10-28 深夜，`me.html` / `service-personal.js` / `service-personal-polish.css`，回读 SHA-256 三个文件全部一致；`me.html` 已引用 `?v=20261027-honey2` / `?v=20261025-honey1`）
- [ ] 商户平台确认服务号 AppID 已关联、JSAPI 授权目录含 `https://www.sxffootball.cn/`（用户线上操作）
- [ ] 真实 1 元下单 → 回调入账 → 重复回调幂等 → 退款冲销 四段联调
- [ ] 联调通过后，再决定是否放开 iOS 之外的对外口径与运营公告


---

## 十一、变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-28 | 新建。凭据 7 项加密入库并通过本地解密 + 微信只读查单双重验收；记录主密钥指纹更正（`8A9F8C34` → `f93e5c7c`）与仍缺的回调路径、集合权限/索引、商户平台关联三项 |
| 2026-10-28 21:27 | 回调路径已打通：默认域名下新增 `/honeyPayNotify` → `webLoginApi` 路由，并开启**路径透传**（不开则 `event.path` 不匹配，表现为 200「未知操作：undefined」）；复测空报文 400、带报文无签名 401。同步写入 `docs/HONEY_TOPUP_IMPLEMENTATION_2026-10-27.md` 与 `CURRENT_STATUS.md` |
| 2026-10-28 晚 | `honey_orders` 安全配置完成：`AclTag` `READONLY` → `ADMINONLY`，索引 2 → 4 条（新增 `openId_1_createdAt_-1`、`createdAt_-1`），均已回读确认；第五节第 2 项改为已完成，剩下只有商户平台两项人工确认与真实 1 元联调 |
| 2026-10-28 深夜 | 发现权限被控制台旧页面写回 `READONLY`（控制台「数据权限」点选即生效、无保存按钮，未刷新的页面带旧值），已重新设为 `ADMINONLY` 并间隔 45 秒两次回读确认；索引 4 条未受影响。第五节第 2 项补入「控制台选项 ↔ `AclTag` 对照表」与刷新核对提醒 |
| 2026-10-28 深夜（二） | 定位「点充值提示充值未开放」＝线上 `service-personal.js` 仍是 `?v=20261020-fb1` 旧版（`modal('…充值暂未开放…')` 纯静态弹窗，不发请求）。已完成线上/本地逐行比对（本地独有行全部为蜂蜜充值，线上独有 3 行均为被替换的旧代码，无功能回退风险），用 `hosting deploy` 发布三个文件并回读 SHA-256 全部一致。第八节新增第 9、10 条坑位 |
