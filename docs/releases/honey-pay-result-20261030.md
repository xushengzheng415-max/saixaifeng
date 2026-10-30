# 蜂蜜充值/会员支付结果识别与查单原因回传发布记录（2026-10-30）

> 起因：用户现场反馈「我已经支付完成，但是页面支付请从新发起！啥意思？」与「重置后蜂蜜滴数也没加成功」。
> 授权：用户在 2026-10-30 明确回复「好的，授权发布吧」，授权范围为本记录中的 H5 与 `webLoginApi` 两处修复（正式端 + 测试端）。

## 一、问题结论（先核实线上事实，再改代码）

- 订单 `HT20261030105007EEVRSDF524`（10 滴 / 1 元）在 `2026-10-30 10:50:17` 收到真实回调，函数返回 `{"code":"SUCCESS","message":"成功"}`（耗时 1,136ms、14 次库操作）；`10:00–12:30` 窗口内 CLS 无「回调入账失败」「HONEY_RECONCILING」「回调验签失败」（11:01、11:09 的两条验签失败是排障时的空签名探针，非用户回调）。
- 即**入账侧未失败**，用户的观感来自前端：① `invokeWechatPay` 只认 `getBrandWCPayRequest:ok`（驼峰），微信官方文档与部分客户端回的是 `get_brand_wcpay_request:ok`，已扣款也被判成「支付未完成」；② 判失败后既不查单也不刷新余额，页面停在旧余额；③ 服务端 `orderStatus` 主动查单失败被 `catch` 静默吞掉，页面只看到「状态未变」。

## 二、代码改动

### 2.1 H5 `service-account-h5/service-personal.js` + `me.html`

- 新增 `invokeWechatPay` 的 `err_msg` 归一化：去掉非字母字符、转小写，按 `ok` / `cancel` 结尾判定，其余一律 `'unknown'`（`fail`、空结果、桥调用抛错都不再直接判失败）。
- 支付结果三分支：`ok` → 查单并 `loadHomeAccount(true)` 刷新余额；`cancel` → 只提示取消；`unknown` → 交给服务端查单，文案改为「支付结果待确认（如已扣款不会重复扣费），请到「充值订单」/「会员订单」刷新状态」，删除旧文案「支付未完成，请重新发起」（会让已扣款用户重复支付）。
- 新增 `function payQueryHint(kind)`：优先显示服务端回传的 `queryError.message`，没有时回落到「待确认」默认文案；`honeyQueryError` 进入 `state`。
- `pollHoneyOrder` / `pollMembershipOrder` / `checkHoneyOrder` / `checkMembershipOrder` 读取 `r.queryError`，服务端明确 `retryable===false` 时停止重试，避免永久性错误反复轮询。
- `honeyPay` / `membershipBuy` 发起前清空 `honeyQueryError` 并置 `honeyBusy`/`memberBusy`，未到账分支先重渲染再 `toast(payQueryHint(...))`。
- `PAGE_VERSION` 升至 `v2.8`；`me.html` 资源版本 `?v=20261030-payresult1` → `?v=20261030-payresult2`（两轮，避免旧脚本缓存）。

### 2.2 `cloudfunctions/webLoginApi/honeyRecharge.cjs` + `membership.cjs`

- 新增 `QUERY_ERROR_TEXTS`（17 条面向用户的错误码文案）与 `QUERY_ERROR_PERMANENT`（14 条不可重试错误码）。
- 新增并导出 `describePaymentQueryError(error)`：返回 `{ code, retryable, message }`；未知错误按可重试处理，永久性错误统一提示「请联系客服」。
- `honeyRecharge.orderStatus`：`pending` 单主动查单改为 `try/catch`，失败时 `console.warn` 记录错误码并 `payload.queryError = describePaymentQueryError(error)`，**订单与余额仍照常返回**（不因查单失败把整个请求打成失败）。
- `membership.orderStatus`：同样捕获查单失败并经 `recharge.describePaymentQueryError` 回传 `queryError`，订阅与余额照常返回。
- 只改这两个文件，`index.js` 与其他模块未动。

## 三、验证

| 检查 | 结果 |
|---|---|
| `node --check` `service-personal.js`、`honeyRecharge.cjs`、`membership.cjs`、`index.js` | 通过 |
| `node tools/test-h5-pay-result.cjs` | 9/9 通过（两种 `ok` 写法 / 两种 `cancel` / `fail` 与空结果归 `unknown` / 桥抛错 / 缺 `package` / 微信未就绪 / 旧文案消失 / 含 `payQueryHint` 与 `r.queryError`） |
| `node tools/test-honey-recharge.cjs` | 通过（新增「主动查单失败必须回传原因」：`PAYMENT_UNAVAILABLE` + `retryable=true` + 镜像余额不变；`HONEY_RECONCILING` 为不可重试；未知错误可重试） |
| `node tools/test-membership.cjs` | 32/32 通过（含 `PAGE_VERSION='v2.8'` 与 `?v=20261030-payresult` 断言） |
| `node tools/test-membership-h5-render.cjs` | 7/7 通过 |
| `node tools/check-referee-backend-package.cjs work/webLoginApi-publish-20261030` | PASS：`actual backend package retains scoped registration Word uploads and denies cross-event/invalid file type`；裁判表识别、分组保存及必要依赖检查通过 |

## 四、发布（2026-10-30）

### 4.1 正式后端 `webLoginApi`（差量发布）

- 基线：刚下载的线上包 `work/online-webLoginApi-20261030`（6,613 文件，`honeyRecharge.cjs` 63,812 B / `C293818C…` 与本地同哈希），复制到 `work/webLoginApi-publish-20261030` 后只覆盖 2 个文件。
- 上传：`fn code update webLoginApi --dir work/webLoginApi-publish-20261030 --deployMode cos` 成功。
- 回下载 `work/verify-webLoginApi-20261030`（6,613 文件）逐文件比对：

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `honeyRecharge.cjs` | 66,587 B | `B05CAFA868457B109925DB98E425FA6D5F43BE8D59A8779F260B904226F3D760` |
| `membership.cjs` | 38,800 B | `A613857063BC94A9D168A5005212F6BA35CA08EEAD70BD14BB8B7DEF917453EB` |
| `index.js`（未改动） | 408,181 B | `39D2F358523AA07713C523EB2FE4A2DE5300219B40E46C185ADC16C37E24B6DD` |

> 本地 `index.js` 为 411,291 B / `CFA1F0AC…`（含其他会话未发布改动），本次**未**上传，线上仍为该基线版本。

- `fn detail webLoginApi --json` 回读：`Status=Active`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=120`、`InstallDependency=TRUE`、`DeployMode=code`、`ModTime=2026-10-30 11:58:35`；环境变量 26 个，与 `cloudbaserc.json` 中 26 个**键名完全一致**，发布未造成配置漂移（未打印任何值）。
- 线上探针（无身份）：`servicePrivateHoneyOrderStatus` 返回 `{"success":false,"code":"SERVICE_PRIVATE_AUTH_REQUIRED"}`（鉴权在前、路由在线）；CLS `2026-10-30 12:00:26` 出现 `Duration: 3ms Memory: 512MB`，证明新包已加载且运行配置未变。

### 4.2 H5 正式 + 测试端（两轮）

暂存目录 `work/h5-publish-20261030`（payresult1）与 `work/h5-publish-20261030b`（payresult2），用 `hosting deploy` 单文件上传，未携带目录内其他文件。

| 轮次 | 文件 | 大小 | SHA-256 |
|---|---|---|---|
| payresult1 | `me.html` | 1,109 B | `F176D882700500D5ABD211F6488ACFFF7681789D0676001F5623F82DD4E6EBB8` |
| payresult1 | `service-personal.js` | 60,617 B | `BD509D1AF96FDE45596099B41DA3C565C94492541DD32BA2FD30766D4C523AB4` |
| payresult2 | `me.html` | 1,109 B | `EA1252633129E27CE6EF5DBD1BCCEBA081EC69A84A441D0E48320579E8CA8421` |
| payresult2 | `service-personal.js` | 61,466 B | `F5F5F80463B8E4707B0E2D6C14AA04C40A5D4C82446D4864959715F46799F4A4` |

回读（`Cache-Control: no-cache` + `?v=20261030-payresult2`，以字节 SHA-256 与本地一致为判据）：

| 地址 | 结果 |
|---|---|
| `https://www.sxffootball.cn/service-account-h5/me.html` | 200 / 1,109 B / `EA125263…` MATCH |
| `https://www.sxffootball.cn/service-account-h5/service-personal.js` | 200 / 61,466 B / `F5F5F804…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/me.html` | 200 / 1,109 B / `EA125263…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/service-personal.js` | 200 / 61,466 B / `F5F5F804…` MATCH |

发布前与线上旧版逐行比对：`service-personal.js` 只有支付结果识别与三分支 + 查单提示相关行（24 增 17 删、再 8 增 2 删），`me.html` 只有 2 行版本号差异，无其他会话改动夹带。

## 五、遗留与待办

1. 用户需用**付款同一微信**重新打开 `me.html` 核对余额（该笔 10 滴应已入账，余额应为 814）；若仍不符，按其 `outTradeNo` 在平台「营销 → 蜂蜜充值」查看 `ledgerState`。
2. `platform_membership_plans/_id=plans` 仍未写入（属 ADMINONLY、当前数据库凭据无写权限），需平台负责人登录「营销 → 会员管理 → 保存档位」写入并回读；未写入前两端继续走代码内 2026-10-27 已确认表。
3. 商户平台 JSAPI 支付授权目录 `https://www.sxffootball.cn/service-account-h5/` 与 AppID 关联仍需在商户后台确认（平台「支付设置」页已显示默认回调地址正确）。
4. 会员徽章落点、到期提醒、会员二期权益、小程序端会员入口未做。
5. 小程序本轮未改动，按规则未重传开发包。
