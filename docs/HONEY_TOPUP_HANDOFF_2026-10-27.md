# 蜂蜜积分与充值逻辑交接（2026-10-27）

> 用途：把「蜂蜜（滴）」的账本、扣费、消耗与充值现状完整导出，交给另一条开发线独立推进支付与充值，**避免与本线交叉改同一批文件**。
> 口径优先级：`AGENTS.md` 红线 > `docs/PRODUCT_RULES.md` 已确认规则 > 本文 > 代码现状。
> 本文只描述**当前真实状态**，标「未实现」的部分不要当成已有能力。

---

## 一、一句话现状

蜂蜜的**账本与扣费链路已经上线并在用**（注册赠滴、签到、应援、AI 定妆照扣费）；**充值（收款）完全没有实现**——H5 已有充值面板与档位，但支付按钮固定禁用，不会创建订单、不会扣款、不会入账。

---

## 二、名词与身份归属

| 项 | 口径 |
|---|---|
| 蜂蜜单位 | 滴（drop） |
| 账本归属键 | **服务号 OpenID**（`serviceAccountOpenId`），不是手机号、不是 `users._id`、不是机构 |
| 与机构额度关系 | **未定义、未分账**。个人蜂蜜与主办方/球队额度是否分账仍待确认，当前不要混用 |
| 主要消费端 | 球员端小程序「赛小蜂足球世界」及服务号 H5 的个人能力（定妆照等） |
| 余额展示 | 只能展示账本核对后的真实余额，禁止展示原型示意值 |

---

## 三、数据模型（唯一事实来源）

### 3.1 `fan_points_ledger`（唯一事实来源）

每笔收支一条流水，字段：

| 字段 | 说明 |
|---|---|
| `serviceAccountOpenId` | 归属 OpenID（必填） |
| `delta` | 增减滴数，整数；支出为负、收入/退回为正。**非安全整数即视为账本异常** |
| `reason` | 业务原因码，如 `fan-registration-bonus` / `fan-daily-check-in` / `fan-seven-day-check-in` / `fan-ranking-support` / `ai-portrait-generation` / `ai-portrait-failed` |
| `refId` | 业务幂等键（消费类必填，如 `ai-portrait:<requestId>`） |
| `attempt` | 同一 `refId` 下的第几轮（扣费=负、退回=正，成对出现） |
| `sessionId` | 关联业务会话（可空） |
| `dateKey` / `targetType` / `targetId` / `periodKey` | 签到、应援等业务维度（可空） |
| `createTime` | 服务端时间 |

### 3.2 `fan_profiles`（镜像余额）

- `honeyBalance`：与账本合计**必须一致**的镜像，用 `honeyWalletUpdatedAt` 记录更新时间。
- 一个 OpenID **只能有一条** `fan_profiles`；查到 2 条即阻断（`HONEY_ACCOUNT_CONFLICT`），不许挑第一条继续扣。

### 3.3 一致性铁律

1. 余额 = 该 OpenID 全部 `delta` 之和；为负数或非整数 → `HONEY_LEDGER_INVALID`，停止操作。
2. 镜像 `honeyBalance` 存在且不等于账本合计 → `HONEY_RECONCILING`，让用户稍后重试，**绝不按其中一侧继续扣钱**。
3. 任何余额变化都必须「写一条流水 + 改镜像」在同一事务里完成，禁止只改镜像或只写流水。

---

## 四、代码入口清单（谁读、谁写）

| 文件 | 作用 | 是否可改（见第八节） |
|---|---|---|
| `cloudfunctions/webLoginApi/honeyWallet.cjs` | **扣费/退回唯一入口**：`readHoney` / `spendHoney` / `refundHoney` | 只可加函数，语义不可改 |
| `cloudfunctions/webLoginApi/fanCenter.cjs` | 注册赠 100 滴（`fan-registration-bonus`）、每日签到 +5、连续 7 天额外奖励、榜单应援 -1 | 谨慎 |
| `cloudfunctions/webLoginApi/fanSupportPlayer.cjs` | 应援扣 1 滴，文档 id 固定 `support-<supportId>` 天然幂等 | 谨慎 |
| `cloudfunctions/webLoginApi/servicePersonalAccount.cjs` | 个人中心余额 + 收支明细；`rechargeAvailable` **固定 false** | 可改（充值态） |
| `cloudfunctions/webLoginApi/serviceAiPortrait.cjs` | AI 定妆照扣费（`cost` 实售 100 / `listCost` 标价 150），失败原路退回 | 价格口径已定，勿改 |
| `cloudfunctions/dataCenter/shared/support.cjs`（及 4 份部署副本） | 只读扣费流水做应援统计 | 勿单独改，须走 `tools/sync-data-center.mjs` |
| `service-account-h5/service-personal.js` | 「我的蜂蜜」面板、充值面板、充值订单面板 | **本线不碰，交给充值线** |

> 数据中心副本：`cloudfunctions/{dataCenter,friendlyMatchCenter,getMiniWorkspace,resultCenter,webLoginApi}/data-center` 同名文件必须一致，改动只能从 `cloudfunctions/dataCenter/shared` 出发再同步。

---

## 五、扣费与退回语义（已在线上使用，改动必须保持）

### 5.1 扣费 `spendHoney(db, openId, {cost, reason, refId, sessionId})`

```text
1. cost 必须是正整数（否则 HONEY_COST_INVALID）；refId 必填
2. 读 fan_profiles（必须唯一）+ 账本合计
3. attempt 统计：同一 refId 下「已扣未退」→ 直接返回 {deduped:true}，不重复扣
4. 余额 < cost → HONEY_INSUFFICIENT（此时不写任何流水）
5. 事务内：镜像余额必须仍等于第 2 步读到的账本合计（防并发）→ 否则 HONEY_RECONCILING
6. 同一事务：镜像 -cost，账本写一条 delta=-cost、attempt=新一轮
```

### 5.2 退回 `refundHoney(db, openId, {reason, refId, sessionId})`

- 只退「最近一笔尚未退回的扣费」，写一条**正数冲销流水**，**不删除、不改写**原扣费记录（保留审计）。
- 已全部退完再调用 → 幂等返回 `{deduped:true, amount:0}`，不会多退。
- 退完后同一 `refId` 再次扣费 → `attempt` 递增、重新扣一次，保证「最终拿到结果的人才付一次」。

### 5.3 错误码表

| 错误码 | 触发 | 前端应有文案方向 |
|---|---|---|
| `HONEY_ACCOUNT_NOT_OPEN` | 该 OpenID 无 `fan_profiles` | 先去服务号「我的」注册 |
| `HONEY_ACCOUNT_CONFLICT` | 同一 OpenID 多条 profile | 联系平台核对 |
| `HONEY_RECONCILING` | 镜像 ≠ 账本合计 / 并发扣费 | 稍后重试，不显示 0 |
| `HONEY_LEDGER_INVALID` | 存在非整数/异常流水、余额为负 | 联系平台处理 |
| `HONEY_INSUFFICIENT` | 余额不足 | 提示需要多少滴、当前多少滴 |
| `HONEY_COST_INVALID` / `HONEY_REF_REQUIRED` | 服务端价格或请求编号缺失 | 服务端缺陷，别让用户重试到爆 |

---

## 六、定价口径（三套并存，**必须先拍板再开发**）

| 来源 | 档位/汇率 | 状态 |
|---|---|---|
| 前端 `service-personal.js` `HONEY_PACKS` | 6 元/60 滴、30 元/300 滴、68 元/700 滴+送 20、128 元/1350 滴+送 70 | **代码现状**，仅为展示，支付禁用 |
| `docs/PRODUCT_RULES.md`（2026-10-18 已确认） | 1/5/10/50/100 元 → 10/60/150/1000/3000 滴 | 已确认但已被质疑 |
| `docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`（2026-10-27 用户确认成人版） | **1 元 = 10 滴**单一汇率；会员四档首月 9.9/19.9/39.9/59.9、续费 19.9/29.9/49.9/69.9、年付 199/299/499/699、每月赠滴 200/500/1000/2000 | 最新口径 |

规则：

- **不许三套同时在线上生效**。支付未开通前全部只是展示，但展示文案必须统一到一套，推荐以 2026-10-27 的「1 元 = 10 滴」+ 会员赠滴为准。
- 旧五档是否正式废止**仍待用户单独确认**；确认前不要新增使用、不要两套并行。
- 定妆照：标价 150 滴、活动实售 100 滴，服务端唯一来源 `AI_PORTRAIT_HONEY_LIST_COST` / `AI_PORTRAIT_HONEY_COST`。会员折扣只能作用在**实售价**上。
- 「100 分换照片/背景」（球员卡既有规则）与「100 滴定妆照」是否合并**未确认**，不要自行合并或叠加。

---

## 七、支付现状与缺口（全部未实现）

现有：`servicePersonalAccount.cjs` 返回 `rechargeAvailable:false`；`service-personal.js` 充值弹窗按钮 `disabled`、文案「微信支付待开通」；充值订单面板写死「微信支付尚未开通，暂无充值订单」。

缺失清单（按实现顺序）：

1. **凭据/配置**：微信支付商户号 `mchid`、APIv3 密钥、商户证书序列号 + `apiclient_key.pem`、绑定 AppID（服务号 `wx00918291b0bd8b9e`；球员端小程序 `wxa0ac7d45bcabd140`）、支付授权目录、回调域名白名单。**凭据只走仓库外 DPAPI 目录 `%LOCALAPPDATA%\SxfCloud\credentials\`，不得进仓库/日志**。（更正 2026-10-28：此处原先误写为网站应用 AppID `wx5a42aae0e5d0669c`，那是 PC 扫码登录用的网站应用；支付必须用服务号 AppID。）
2. **订单集合**（建议 `honey_orders`）：`outTradeNo`（业务生成，唯一）、`openId`、`price`（分）、`drops`、`bonusDrops`、`status`（pending/paid/closed/refunded）、`transactionId`、`prepayId`、`priceSnapshot`、`createdAt`/`paidAt`/`closedAt`。
3. **统一下单**：服务端按**当前档位快照**生成订单，前端只用 `prepay_id` 拉起收银台；**前端「支付成功」不作为入账依据**。
4. **回调（唯一入账点）**：验签 → 查单复核金额与档位 → 事务内「写一条 `delta=+drops(+bonus)` 流水 + 镜像 `honeyBalance` 加同额 + 订单置 paid」，以 `outTradeNo`/`transactionId` 做幂等，重复回调只记一条。
5. **主动查单兜底**：回调丢失时按 `outTradeNo` 查单补记，同样走 4 的幂等。
6. **退款**：只做流水冲销（负数流水）+ 订单状态变更，不删原流水；退款规则本身**未确认**。
7. **对账**：按日核对「支付平台流水 ↔ `honey_orders` ↔ `fan_points_ledger`」，不一致只报告不自动改。
8. **合规**：iOS 端不得售卖虚拟滴/会员；自动续费须走微信委托代扣并同时明示首月价与续费价；抽卡类必须公示概率；未成年人相关限制未定。

---

## 八、文件所有权（防交叉，按此分工）

### 8.1 本线（AI 定妆照 / 价格锚）保留

- `cloudfunctions/webLoginApi/serviceAiPortrait.cjs`（扣费口径、`cost`/`listCost`）
- `cloudfunctions/aiPortraitDemo/**`
- `service-account-h5/service-entry.js`（登记页 AI 区块）
- `cloudfunctions/webLoginApi/honeyWallet.cjs` 的**对外语义**（如需新增能力，只加函数，不改 `spendHoney`/`refundHoney` 的语义与错误码）

### 8.2 充值线可以动

- `service-account-h5/service-personal.js`：充值面板、档位、支付按钮、充值订单面板
- 新增：`cloudfunctions/webLoginApi/honeyRecharge.cjs`（下单/回调/查单/退款）或独立云函数 `honeyPay*`
- 新增集合：`honey_orders`（及对账用视图/定时任务）
- `cloudfunctions/webLoginApi/servicePersonalAccount.cjs` 的 `rechargeAvailable` 与订单列表

### 8.3 双方都不要动

- `fan_points_ledger` 的字段口径、`reason` 命名习惯、`refId`/`attempt` 幂等模型
- `cloudfunctions/dataCenter/shared/**`（必须走 `tools/sync-data-center.mjs`）
- `docs/PRODUCT_RULES.md` 的价格结论（改了要同步 ADR，且需用户确认）

### 8.4 合并与发布注意

- 当前工作区在 `codex/platform-ops` 分支；蜂蜜/定妆照改动属 `main` 侧。**合并前先确认分支归属**，不要整分支互相覆盖。
- `webLoginApi` 发布前必须跑 `node tools/check-referee-backend-package.cjs <实际拟上传目录>`，防止覆盖已上线的裁判表接口。
- 部署需当前任务明确授权，并在部署后回读生产状态。

---

## 九、验证清单（充值线提交前）

- [ ] 未支付时：不下单、不扣款、不加余额；前端任何"支付成功"提示都不改变余额
- [ ] 同一 `outTradeNo` 回调重放 3 次 → 账本只多一条、余额只加一次
- [ ] 回调金额与订单快照不符 → 拒绝入账并告警，不改余额
- [ ] 并发两笔扣费 → 一笔成功、一笔 `HONEY_RECONCILING`
- [ ] 余额不足 / 账户缺失 / 重复 profile → 三种错误码分别可复现
- [ ] 充值成功后余额 = 账本合计 = 镜像；`servicePersonalAccount` 收支明细能看到这条流水
- [ ] iOS 端不出现可点击的购买入口
- [ ] 凭据未进入仓库、日志、前端包

---

## 十、待用户确认（确认前不写死）

1. 旧五档（1/5/10/50/100 元）是否正式废止，只保留「1 元 = 10 滴」。
2. 前端 `HONEY_PACKS` 现有 4 档（6/30/68/128 元）是否作废，或改成 1 元倍数档位。
3. 蜂蜜与赠滴**有效期**（当前无过期逻辑）。
4. 退款规则（是否支持退、退多少、是否回收赠滴）。
5. 个人蜂蜜与主办方额度是否分账。
6. 会员权益与赠滴的发放时点（订阅日发放、不滚存已写入方案，需实现确认）。
7. 儿童/家长档价格、39.9 档赠滴是否上调。
8. 「100 分换照片/背景」与「100 滴定妆照」是否合并。

---

## 十一、变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-10-27 | 本文建立；记录账本/扣费现状、三套价格口径冲突、支付缺口与文件所有权 | 仅文档，无代码改动 |
