# 会员订阅（一期 A 路线）设计方案（2026-10-28）

> 状态：**设计已定稿，代码未开工**。价格与权益口径来自
> `docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`（2026-10-27 用户确认）。
> 用户 2026-10-28 已确认三条：①会员为一级入口、充值降为「买蜂蜜」补充 ②一期只做 A（30 天单次、不自动扣款）
> ③四档价格与赠滴按已确认表执行，39.9 档赠滴本次不上调。
>
> 本文只覆盖**一期 A**。自动续费（委托代扣）为二期，另立设计，不动本文数据结构（已预留 `autoRenew`）。

---

## 一、为什么先做会员、后做自动续费

| 事实 | 说明 |
|---|---|
| 会员单位成本更低 | 基础会员首月 9.9 元送 200 滴 ≈ 0.0495 元/滴；充值固定 0.1 元/滴。先卖滴再卖会员，用户会觉得被坑 |
| 自动续费是独立支付产品 | 续费走微信「委托代扣」，需商户平台单独申请开通；未开通前代码写不出可用续费 |
| 退款/解约规则未确认 | 自动扣款一旦上线，退款规则未定会直接形成投诉风险 |

结论：一期做「30 天会员、到期手动续费」，**不自动扣款**；结构上预留自动续费字段，二期叠加时用户无感。

---

## 二、页面结构（信息架构）

### 2.1 「我的」页（`service-account-h5/me.html`）

```text
┌──────────────────────────────┐
│ 我的                [个人资料] │
│ 郑旭升  173****6663          │
│                              │
│ ┌── 会员卡（新增，置顶）────┐ │
│ │ 未开通：开通会员 首月9.9起 │ │
│ │ 已开通：专业会员 · 剩 23 天│ │
│ │        [续费] [查看权益]   │ │
│ └──────────────────────────┘ │
│                              │
│ 蜂蜜余额 904 滴    [买蜂蜜]   │  ← 充值降为入口按钮
└──────────────────────────────┘
```

- 未开通时会员卡为主视觉，充值入口缩小为「买蜂蜜」文字按钮。
- 已开通时展示档位 + 剩余天数；≤3 天显示「即将到期」并高亮续费。

### 2.2 会员中心（同页半屏，不新开页面，减少跳转）

| 区块 | 内容 |
|---|---|
| ① 当前状态 | 未开通 / 已开通（档位、开通日、到期日、剩余天数） |
| ② 四档卡片 | 首月价、续费价、每月赠滴、定妆照折扣；首月价仅对未订阅过账号显示，已订阅过显示续费价 |
| ③ 主按钮 | 「立即开通 / 续费 / 升级」；按钮上写明实际扣款金额 |
| ④ 权益清单 | 已上线项打勾；未上线项标注「即将开放」，**不虚卖** |
| ⑤ 说明 | 到期后赠滴不回收、不自动续费、如何续费；底部一行「买蜂蜜（1 元 = 10 滴）」 |

### 2.3 交互状态（全部要在 `.js` 里预计算，禁止模板内判断）

| 状态 | 表现 |
|---|---|
| 未开通 | 四档均可购买，首月价显示 |
| 已开通·可续费 | 同档位显示「续费」；更高档显示「升级」；更低档置灰「当前档位更高」 |
| 已开通·到期 | 等同未开通，但保留「续费」入口与到期提示 |
| 支付中 | 按钮置「支付处理中…」，禁止重复点击 |
| 支付成功 | 刷新状态卡 + 蜂蜜余额（赠滴已并入余额） |
| 失败 | 保留在会员中心，提示可重试；不写任何账本 |
| iOS | 购买区整体替换为「iOS 暂不支持购买会员」，服务端二次拦截 |

---

## 三、数据模型

### 3.1 `member_subscriptions`（一 OpenID 一条，当前态）

| 字段 | 说明 |
|---|---|
| `_id`（= `openId`） | 服务号 OpenID，与 `fan_points_ledger.serviceAccountOpenId` 一致 |
| `openId` / `userId` / `profileId` | 归属快照 |
| `levelCode` | `basic` / `plus` / `pro` / `family` |
| `status` | `active` / `expired` |
| `startedAt` / `expiresAt` | 首购时间、到期时间（到期 = 起 + 30 天 × 次数，按次叠加） |
| `firstMonthUsed` | 是否已用过首月价（**防反复薅**） |
| `grantedPeriods` | 已发赠滴的月份键数组，如 `["2026-10"]`，发赠滴幂等依据 |
| `autoRenew` | 固定 `false`（二期才可能为 `true`） |
| `lastOrderId` / `updatedAt` | 最近订单与更新时间 |

一个 OpenID 多条 → 视为异常（`MEMBERSHIP_ACCOUNT_CONFLICT`），阻断并人工核验，不挑第一条继续。

### 3.2 `membership_orders`（与充值的 `honey_orders` **分表**）

复用 `honeyRecharge.cjs` 的微信下单/验签/查单原语，但**订单落独立集合**，避免污染已上线的充值统计口径。

| 字段 | 说明 |
|---|---|
| `_id`（=`outTradeNo`） | `MT` + 北京时间 14 位 + 6 位随机 + 4 位摘要（`HT` 留给充值） |
| `openId` / `userId` / `profileId` | 归属快照 |
| `kind` | 固定 `membership` |
| `planCode` / `months` | 档位与月数（一期固定 1 个月；年付 12 个月单独为 `yearly` 档） |
| `priceCents` / `grantDrops` | 下单时价格与赠滴快照 |
| `priceTier` | `first`（首月价）/ `renew`（续费价）/ `yearly` |
| `status` | `pending` / `paid` / `closed` / `refunded` |
| `ledgerState` | `pending` / `granted` / `blocked` |
| `transactionId` / `prepayId` | 微信侧单号与预支付 |
| `createdAt` / `paidAt` / `closedAt` / `updatedAt` | 时间 |
| `notifyCount` / `lastNotifyAt` | 回调排查 |

### 3.3 赠滴流水（沿用铁律，不新增机制）

- 集合仍是 `fan_points_ledger`（唯一事实来源），镜像仍是 `fan_profiles.honeyBalance`。
- `reason` = `membership-grant`（首购/续费当月赠滴）。
- `refId` = `membership:<levelCode>:<yyyy-mm>` → **同账号同档位同月份只发一次**，天然幂等。
- `delta` = +200 / +500 / +1000 / +2000（按档位表）。
- 写流水与改镜像必须在**同一事务**，且写入前校验镜像 == 账本合计，否则 `HONEY_RECONCILING`。

### 3.4 档位配置（库内可改，环境变量回退）

| 项 | 值 |
|---|---|
| 集合 | `platform_membership_plans`（单文档 `_id='plans'`，AES-256-GCM 加密可选；档位价格非机密，一期**不加密**，仅审计） |
| 环境变量回退 | `MEMBERSHIP_PLANS`（JSON） |
| 字段 | `code` / `name` / `firstPriceCents` / `renewPriceCents` / `yearlyPriceCents` / `grantDrops` / `portraitDiscount`（如 0.95）/ `cardBackgrounds` / `order` |

配置校验（缺一即整组拒绝）：`firstPriceCents > 0`、`renewPriceCents ≥ firstPriceCents`、`yearlyPriceCents` 若存在须 ≈ `renewPriceCents×10`（10 个月价）、`grantDrops` 为正整数、`portraitDiscount ∈ [0.5,1]`、档位码不重复、四档必须齐全。

---

## 四、接口清单（零 SDK，全部经 `webLoginApi`）

| action | 鉴权 | 用途 | 返回要点 |
|---|---|---|---|
| `servicePrivateMembershipStatus` | 服务号个人会话 | 会员中心一次取全量 | `{plans, subscription, isFirstMonthAvailable, rights, balance, purchaseEnabled}` |
| `servicePrivateMembershipSubscribe` | 同上 | 下单并返回支付参数 | `{order, payParams, reused}`；`clientPlatform=ios` → `IOS_VIRTUAL_PAYMENT_RESTRICTED` |
| `servicePrivateMembershipOrderStatus` | 同上 | 轮询/查单兜底 | `{order, subscription, balance}`；`pending` 时服务端主动查单补记 |
| `servicePrivateMembershipOrders` | 同上 | 会员订单历史 | `{rows, subscription}` |
| 回调 | 无（验签） | 复用现有 `/honeyPayNotify` 入口 | 在 `handleNotify` 内按单号前缀 `MT…` 分流到会员处理，`HT…` 仍走充值 |

平台侧（`platformOwner`，仅 `platform_owner`）：

| action | 用途 |
|---|---|
| `platformMembershipOverview` | 会员数、各档分布、月收入、待处理异常 |
| `platformMembershipPlansGet` / `platformMembershipPlansSave` | 档位读取 / 保存（写审计：操作人、IP、字段名，不记全量值） |
| `platformMembershipOrders` | 订单筛选分页 + 详情（含账本一致性） |
| `platformMembershipGrant` | 人工补发赠滴（幂等，走 `membership-grant`，记录操作人） |

**命名隔离**：会员错误码统一前缀 `MEMBERSHIP_`，避免与 `HONEY_*` 混淆。

---

## 五、状态机与幂等

### 5.1 下单

```text
1. 读 subscription（不存在视为未开通，不报错）
2. planCode 必须存在；未订阅过 → priceTier=first，否则 renew（年付单独 yearly）
3. 同账号存在 90 分钟内 pending 订单且档位/价格一致 → 直接复用 prepayId（reused:true）
4. 否则：生成 MT 单号 → 写 membership_orders(pending) → 调微信 JSAPI 下单 → 回写 prepayId
5. 微信下单失败 → 订单置 closed（与充值一致，不留僵尸单），返回 PAYMENT_REQUEST_FAILED
```

### 5.2 回调 / 查单入账（唯一入账点）

```text
1. 验签、解密（沿用 honeyRecharge 的 verify/sign 原语）
2. 查单复核：金额 == priceCents && outTradeNo 一致 && trade_state=SUCCESS
3. 事务内：
   a. 订单 status=paid、ledgerState=granted、写 transactionId
   b. 订阅：无 → 新建（startedAt=now，expiresAt=now+30d×months，firstMonthUsed=true）
           有 → expiresAt += 30d×months（续费叠加，不从今天重算，避免丢天数）
   c. 写赠滴流水 delta=+grantDrops、refId=membership:<code>:<yyyy-mm>；若该键已存在则跳过（幂等）
   d. 校验镜像 == 账本合计后，镜像 += 实际发放滴数
4. 重复回调：按 transactionId / 订单已 paid 直接返回成功，不重复入账、不重复延期
5. 校验失败（金额不符/单号不符）→ 订单置 paid+blocked，**不延期、不发滴**，进平台「异常待处理」
```

### 5.3 到期

- 一期**不做定时任务**：到期判定由读取时按 `expiresAt` 与当前时间比较（`status` 惰性更新为 `expired`）。
- 到期后：赠滴不回收、已发权益保留至到期日、页面提示续费；无自动扣款。

---

## 六、权益一期范围（重要：不虚卖）

| 权益 | 一期是否上线 | 说明 |
|---|---|---|
| 每月赠滴 | ✅ 上线 | 走账本，`membership-grant` |
| 会员徽章 / 会员标识 | ✅ 上线 | 前端按 `levelCode` 渲染，纯展示 |
| 定妆照折扣（95/9/8 折） | ❌ **待确认** | 需改 `serviceAiPortrait.cjs` 的扣费价口径，属「价格口径已定勿改」范围，必须单独确认后才能接 |
| 卡面背景库 / 多套卡面 / 导出 / 赛季报告 / 多孩 / 周边折扣 | ❌ 待建 | 页面标「即将开放」 |

> 一期如果只上「赠滴 + 徽章」，文案就必须如实写「会员权益持续开放中」，不得暗示折扣已生效。

---

## 七、iOS 与合规红线

- iOS 端（`clientPlatform === 'ios'`）不展示购买入口，服务端下单二次拦截 `IOS_VIRTUAL_PAYMENT_RESTRICTED`。
- 一期不自动扣款，因此不涉及「扣款前提醒」「解约入口」等委托代扣义务。
- 页面必须明示：**不会自动续费**；到期需手动续费。
- 未成年人相关价格与权益未定，一期不单独设儿童档。

---

## 八、文件清单（预计改动）

| 文件 | 类型 | 说明 |
|---|---|---|
| `cloudfunctions/webLoginApi/membership.cjs` | 新增 | 状态、下单、回调分支、查单、赠滴发放、订单列表 |
| `cloudfunctions/webLoginApi/honeyRecharge.cjs` | 小改 | 抽出可复用的「微信下单 + 验签 + 查单」函数供会员调用；**不改充值语义** |
| `cloudfunctions/webLoginApi/index.js` | 改 | 注册 4 个会员 action；`/honeyPayNotify` 内按 `MT`/`HT` 分流 |
| `cloudfunctions/webLoginApi/servicePersonalAccount.cjs` | 改 | 返回会员卡摘要（档位/到期/是否可购买） |
| `service-account-h5/service-personal.js` | 改 | 会员卡置顶、会员中心半屏、四档卡、按钮态、iOS 拦截；充值缩为「买蜂蜜」入口 |
| `service-account-h5/service-personal-polish.css` | 改 | 会员卡与档位样式 |
| `service-account-h5/me.html` | 改 | 版本号递增 |
| `cloudfunctions/platformOwner/index.js` | 改 | 4 个平台只读/配置/补发 action |
| `platform-admin-vue/src/views/membership/MembershipAdmin.vue` | 新增 | 平台「会员」页：概览、档位配置、订单、补发 |
| `tools/test-membership.cjs` | 新增 | 离线自检：价格校验、首月资格、到期叠加、赠滴幂等、金额不符拒绝、iOS 拦截 |

---

## 九、实施顺序

1. 后端：`membership.cjs`（状态 + 下单 + 回调分支 + 查单 + 赠滴）→ `node --check` → 离线自检
2. 后端发布：`webLoginApi` 差量发布（先跑 `node tools/check-referee-backend-package.cjs <实际包目录>`）
3. 集合：新建 `member_subscriptions`、`membership_orders`、`platform_membership_plans`（权限 `ADMINONLY` + 必要索引）
4. H5：会员卡 + 会员中心 + 版本号 → 发布 → 回读 SHA-256
5. 平台后台：会员页 → 构建 → 按平台发布流程上线
6. 端到端：1 元真实购买 → 校验订阅、赠滴、余额、幂等

---

## 十、验收清单

- [ ] 未开通账号：显示四档 + 首月价；开通后同账号再买显示续费价（首月价不重复可用）
- [ ] 支付成功：订阅新建/延期正确（续费在 `expiresAt` 上叠加，不是从当天重算）
- [ ] 赠滴：账本新增 1 条 `membership-grant`，镜像与账本合计一致；同月重复回调不重复发滴
- [ ] 金额不符 / 单号不符：订单 `paid+blocked`，不延期、不发滴，进平台异常列表
- [ ] 重复回调 3 次：订阅只延 1 次、账本只多 1 条
- [ ] iOS：不出现可点击购买入口；服务端返回 `IOS_VIRTUAL_PAYMENT_RESTRICTED`
- [ ] 到期：读取时置 `expired`，赠滴不回收，页面提示手动续费
- [ ] 凭据、密钥未进入仓库/日志/前端包

---

## 十一、仍未确认（一期按此执行，改动需另行确认）

1. **定妆照会员折扣是否接入**（需改扣费口径）：一期不接，页面不承诺。
2. **首月价资格边界**：按「账号维度各档一次」处理；同一账号升级到更高档是否再用首月价 → 一期按「只用过一次即失格」。
3. **年付**：一期先只上「月付 30 天」，年付待确认后再加（结构已预留 `yearlyPriceCents`）。
4. **退款**：规则未定，一期不做系统内退款，仅支持商户平台人工退款后人工核对。
5. **到期提醒**：一期仅在页面提示，不做服务号模板消息（模板 ID 未确认为会员场景）。
6. **赠滴有效期**：仍无过期逻辑，与充值一致。

---

## 十二、变更记录

| 日期 | 变更 | 状态 |
|---|---|---|
| 2026-10-28 | 建立本文：用户确认「会员为一级入口 + 一期 A 路线 + 价格按已确认表」后输出设计 | 仅设计，未写代码 |
