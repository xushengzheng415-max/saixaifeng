# 个人会员一期 A（30 天单次、不自动续费）发布记录

2026-10-29 用户先以「好的，开工 + 折扣接」授权开发，再以「好的，执行吧」授权执行剩余发布事项。本文记录实际发布到生产的内容、验证证据与仍未做的部分。

设计见 `docs/MEMBERSHIP_SUBSCRIPTION_DESIGN_2026-10-28.md`，价格口径见 `docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`。

## 一、本轮范围

| 项 | 状态 |
|---|---|
| 会员为一级入口、充值降为「买蜂蜜」补充 | ✅ 本轮 H5 已按此排列 |
| 一期只做 A：30 天单次、不自动续费 | ✅ 无自动续费字段与扣款逻辑 |
| 四档价格与赠滴按 2026-10-27 已确认表（39.9 档赠滴不上调） | ✅ `CONFIRMED_PLANS` |
| AI 定妆照会员折扣 | ✅ 已接入，只作用在活动实售价 100 滴 |
| 共享后端 `webLoginApi` 差量发布 | ✅ 已上线并回读 |
| 3 个集合 + 权限 + 索引 | ✅ 已建并回读 |
| 档位文档 `platform_membership_plans/_id=plans` | ⏸ 未写（页面已上线，待平台负责人点「保存档位」；当前走代码默认表） |
| H5 正式发布 + 测试端同步 | ✅ 均回读一致 |
| 会员中心 H5 版式改版（整屏订阅页） | ✅ 已发布正式与测试端（见第十、十一节） |
| 平台后台会员页 | ✅ 已发布 `20261029152038-08c696bb`（见第九、十一节） |
| 商户平台 JSAPI 授权目录、1 元真实购买 | ❌ 用户侧待办 |

## 二、代码改动清单（正式仓库）

### 云函数（共享后端 `webLoginApi`）

| 文件 | 变化 | 大小 | SHA-256（前 12 位） |
|---|---|---|---|
| `membership.cjs` | 新增：档位配置、订阅状态、下单、回调/查单发放、订单列表、定妆照折扣 | 38,615 B | `521557CF853C` |
| `honeyRecharge.cjs` | `createPrepay` 支持 `description/attach` 覆盖；`handleNotify` 按单号前缀把 `MT…` 交给会员发放，`HT…` 语义不变 | 63,812 B | `C293818C95AD` |
| `index.js` | 新增 4 个 `case`：`servicePrivateMembershipStatus/Subscribe/OrderStatus/Orders` | 408,141 B | `908FD79E4361` |
| `servicePrivate.cjs` | 会员 action 路由与白名单同步 4 项 | 15,918 B | `6582C08F940B` |
| `servicePersonalAccount.cjs` | `reason` 增 `membership-grant`；首页返回 `membership` 摘要 | 5,561 B | `6BF6529E25FD` |
| `serviceAiPortrait.cjs` | 按会员折扣定价（展示与扣费同源），`aiPortrait` 回传 `discount` | 15,157 B | `15B33B0F9641` |

关键口径：

- 单号前缀 `MT`（充值 `HT`），26 位 = `MT` + 北京时间 14 位 + 6 位随机 + 4 位摘要；回调按前缀分流，`notify_url` 仍为唯一入口 `/honeyPayNotify`。
- 账本铁律不变：事务内「写 `fan_points_ledger` + 同额改 `fan_profiles.honeyBalance` 镜像 + 订单置 `paid`」；写前校验 `镜像 === 流水合计`。
- 赠滴幂等键 `membership:<levelCode>:<outTradeNo>`（原设计按月份会让同月第二笔购买拿不到赠滴）。
- 首月价资格 `firstMonthUsed !== true`；续费 `base = max(now, expiresAt)` 再叠加 30 天 × 月数。
- 账本与镜像不一致时（**读取阶段与事务阶段都）订单置 `paid + ledgerState=blocked`**，避免「用户已付款但页面仍显示待支付」。
- 档位三级来源：`platform_membership_plans/_id=plans` → 环境变量 `MEMBERSHIP_PLANS` → 代码内 `CONFIRMED_PLANS`；库内存在但非法时**不回退**，整组拒绝。
- 定妆照折扣 95/90/80 只作用在活动实售价 100 滴，150 滴标价不参与；会员过期或读取失败回落 100 滴且不阻断主流程。

### 服务号 H5

| 文件 | 变化 |
|---|---|
| `service-personal.js` | `PAGE_VERSION='v2.5'`；会员卡置顶、会员中心半屏、四档卡（家庭档不售）、会员订单、iOS 只读说明、`?mock=1` 本地预览数据 |
| `service-personal-polish.css` | 新增 `.me-member-*`、`.me-home-member` 等会员样式 |
| `me.html` | 资源版本升 `?v=20261029-member1`（css 与 js 同步） |

## 三、自检

| 脚本 | 结果 |
|---|---|
| `node tools/test-membership.cjs` | 32 项通过（档位解析/非法整组拒绝/库内优先、首月与续费、到期叠加、MT 单号、折扣、支付复核、赠滴幂等、镜像不一致阻断、iOS/家庭档/年付/支付未配置早退、90 分钟复用、回调查单、状态与折扣、入口注册、H5 口径） |
| `node tools/test-membership-h5-render.cjs` | 7 项通过（首月价 9.90/19.90/39.90、续费 49.90、家庭档不出现、已开通当前档高亮 + 低档置灰、降档提示、iOS 无购买入口、支付未就绪只给原因、订单 `MT` 前缀） |
| `node --check` | 6 个云函数文件 + H5 `service-personal.js` 全部通过 |

## 四、`webLoginApi` 差量发布

1. `fn code download webLoginApi` 取线上基线（6,612 文件），逐文件对比确认差异仅为本轮 6 个文件，无其他会话未发布内容混入。
2. 构造 stage 包（6,613 文件 / 82,651,496 B），6 个文件 `node --check` 全通过。
3. `node tools/check-referee-backend-package.cjs <stage>`：`PASS: actual backend package retains scoped registration Word uploads and denies cross-event/invalid file type` + `裁判表识别、分组保存及必要依赖检查通过`。
4. `fn code update webLoginApi --dir <stage> --deployMode cos` 成功。
5. 回下载（6,613 文件）比对，6 个文件 SHA-256 全部一致（见上表）。
6. `fn list --json` 回读：`webLoginApi Status=Active`、`ModTime=2026-10-29 19:20:23`、`Runtime=Nodejs18.15`、`DeployMode=code`。未改运行配置（环境变量、内存、超时保持原状；未使用 `fn detail`，其输出含环境变量明文）。

## 五、线上路由探针（无身份）

| action | 返回 |
|---|---|
| `servicePrivateMembershipStatus` | `{"success":false,"code":"SERVICE_PRIVATE_AUTH_REQUIRED","error":"请重新连接微信"}` |
| `servicePrivateMembershipOrders` | 同上 |
| `servicePrivateNoSuchAction`（对照） | `{"success":false,"error":"未知操作：servicePrivateNoSuchAction"}` |

若路由未注册会落到「未知操作」，因此这两条返回鉴权错误即证明新 action 已在线。

## 六、集合、权限与索引

| 集合 | `AclTag` 回读 | 索引 |
|---|---|---|
| `member_subscriptions` | `ADMINONLY` | `_id_`、`expiresAt_-1`、`levelCode_1_status_1`（共 3） |
| `membership_orders` | `ADMINONLY` | `_id_`、`openId_1_createdAt_-1`、`createdAt_-1`、`status_1_createdAt_-1`（共 4） |
| `platform_membership_plans` | `ADMINONLY` | `_id_`（共 1） |

踩坑：新建集合 `ModifySafeRule` 后立即 `DescribeSafeRule` 仍可能显示 `READONLY`（ACL 传播延迟/控制台回写），重设并等待约 50 秒后回读才稳定为 `ADMINONLY`。与 2026-10-28 `honey_orders` 记录的同类问题一致。

`platform_membership_plans/_id=plans` **本轮未写入**：写错配置会让整组档位不可售，先依赖代码内已确认表；待平台后台会员页落地后由官方界面写入并回读。

## 七、H5 发布

正式目录与已登记测试目录同时发布本次 3 个文件（测试目录同步前为 `?v=20261025-honey1` 旧版本，无预览独有改动）。

| 路径 | 大小 | SHA-256 |
|---|---|---|
| `service-account-h5/me.html` | 1,101 B | `170D8A1E104C8DBD7FBD085CC77FD8FDFEB86B8EA472A8F77F5A45E9DEAA949D` |
| `service-account-h5/service-personal.js` | 56,180 B | `E2BD48C9A5BDC4EC004E9B28AEB5BDC2B711133EF1A24B767579AE8579CD2DA7` |
| `service-account-h5/service-personal-polish.css` | 12,627 B | `1FC59039CD15E2D131D330462769411F1A36290092163E80F0EB49B75D64ACCD` |

回读（`Cache-Control: no-cache` + 查询串）：`https://www.sxffootball.cn/service-account-h5/<文件>?v=20261029-member1` 与 `https://www.sxffootball.cn/preview/service-account-h5/<文件>` 均 HTTP 200，SHA-256 与本地逐一一致。

## 八、仍未做（需另行确认/授权）

1. ~~平台运营后台会员页尚未发布~~ **2026-10-29 23:20 已发布**（`platformOwner` 差量 + 前端 release `20261029152038-08c696bb`，见第九、十一节）；剩余只有 `platform_membership_plans/_id=plans` 需平台负责人点「保存档位」写入。
2. 商户平台侧：JSAPI 支付授权目录 `https://www.sxffootball.cn/service-account-h5/`、服务号 AppID 关联（用户线上操作）。
3. 1 元真实购买端到端：下单 → 收银台 → 回调发放 → 赠滴/余额/订阅核对 → 重复回调幂等；本轮未创建任何真实订单。
4. 云函数为共享正式后端，无独立测试副本；未改动小程序与 PC 后台。
5. Git：平台前端只提交 `08c696b`（`TournamentCenterAdmin.vue` + `views/membership/MembershipAdmin.vue`）；`cloudfunctions/platformOwner/{index.js,membershipPlans.cjs}`、`service-account-h5/*`、`tools/*`、`docs/*` 仍留在工作区（工作区压着其他会话大量未提交改动），本次按文件差量发布并报告。
6. `node tools/sync-data-center.mjs --check` 仍报 12 个共享模块未同步，属其他会话未发布的数据中心副本；本轮未改数据中心、未擅自同步覆盖。

## 九、平台后台会员页（2026-10-29 已发布）

按用户指令「对你需要把平台后台的会员页做出来」实现。工程为 `platform-admin-vue/`（长期分支 `codex/platform-ops`、禁止引用 `web-admin-vue`、网页端零 SDK 走 `webLoginApi` relay）。

### 页面

`platform-admin-vue/src/views/membership/MembershipAdmin.vue`（新建，约 600 行），接入 `views/tournament-center/TournamentCenterAdmin.vue`：`activeTab==='membership'` 分支、`marketingNavigation` 营销组首位「会员管理」、`refreshSection()` 顶栏刷新，`defineExpose({ refresh })`。

| 区块 | 内容 |
|---|---|
| 工具条 | 统计窗口（近 1/7/30/90 天）+ 刷新 + 数据源说明（库内配置 / 代码默认表） |
| 统计卡 | 期间会员收入（元）、期间赠滴、生效会员数、7 天内到期数 |
| 会员档位 | 8 列可编辑表格（档位 / 名称 / 首月价 / 续费价 / 年付价 / 赠滴 / 定妆照折扣 / 排序）+ 用户端可购买开关；保存档位 / 填入默认表 / 放弃修改；保存提示与最近保存记录 |
| 收入趋势 | 按日柱状、按档位拆分的 chips、按档位生效分布 |
| 会员订单 | 状态（待支付 / 已支付 / 已关闭）、发放状态（待发放 / 已发放 / 已阻断）、档位、关键词筛选 + 分页 + 详情弹窗（账本一致性、本单 `refId` 流水、该账户订阅） |
| 会员列表 | 生效 / 已过期、档位、关键词筛选 + 分页；只读，不提供退款 |

页面不写第三份价格表：「填入默认表」使用后端 `membershipPlanGet` 返回的 `defaults`；保存后回填后端 `warnings`。

### 后端（`cloudfunctions/platformOwner`）

| 文件 | 变化 |
|---|---|
| `membershipPlans.cjs` | 新增：`CONFIRMED_PLANS`/`parsePlans`/`planView` 与 `webLoginApi/membership.cjs` 同源；`planDoc`/`readPlanState`（`source='db'\|'default'`）、`buildWarnings`、`historyEntry`；**有意不读** `process.env.MEMBERSHIP_PLANS`（那是 `webLoginApi` 自己的环境配置） |
| `index.js` | 新增 6 个 action：`membershipPlanGet`（含 `defaults` 与 `history`）、`membershipPlanSave`（事务 compare-and-set，版本不一致返回 `MEMBERSHIP_PLAN_CONFLICT`）、`membershipOverview`、`membershipOrderList`、`membershipOrderDetail`、`membershipSubscriptionList`；订单与订阅只读，集合缺失返回 `available:false` 而非报错 |

口径：

- 档位来源两级：库内 `platform_membership_plans/_id=plans` → 代码已确认四档；库内存在但非法时整组拒绝（`MEMBERSHIP_PLAN_INVALID`），不回退默认表。
- 订阅 `active` 需 `status==='active'` 且 `expiresAt` 未过期；`autoRenew` 恒为 `false`（一期 A 不自动续费）。
- 订单 `status='paid' && ledgerState='blocked'` 显示「已支付·待发放」，与充值页 `credited` 语义不混用。

### 自检

| 脚本 | 结果 |
|---|---|
| `node --check` 两文件 | 通过 |
| `tools/test-membership-plan-parity.cjs` | 41/41（两处 `parsePlans`/`planView`/`CONFIRMED_PLANS` 逐字段一致、平台侧不读环境变量、库内非法不回退、保存提示文案） |
| `tools/test-membership.cjs` | 32/32 |
| `npm run build` | 平台边界检查 57 文件 + `✓ built` |
| `tools/test-platform-tablet-ui.cjs` | 64/64（16 tab × 4 设备），`drawerParity: true` |

截图复核修掉两处样式冲突：表格内小字类名 `block` 被区块卡片样式命中（改 `sub`）；全局 `.stat-card{display:flex}` 把统计卡文字挤成多行（scoped 覆盖为 `display:block`）。

### 发布（2026-10-29 23:18–23:21，用户授权「授权执行未完成的工作」）

- 后端：以刚下载的线上 `platformOwner` 包为基线（`index.js` 55,924 B，`package.json` 与本地逐字节相同），只覆盖 `index.js` 并新增 `membershipPlans.cjs`；本地与线上差异为 **506 行纯新增、0 行删除**，新增内容全部为会员相关（`membershipPlans` 引入、`memberLevelName`/`safeMemberOrder`/`safeMemberSubscription`/`readMemberOrders`/`readMemberSubscriptions`、6 个 action 与 6 条路由），不存在其他会话未验收代码夹带。
- 两文件 `node --check` 通过后 `fn code update platformOwner --deployMode cos`（COS）→ 回下载核对：`index.js` 79,721 B / `3A76C1D1EB6CA3FD714D0EDD98175D915989BBC196A2E4ACD29D0D929A785AC0`、`membershipPlans.cjs` 9,243 B / `996537677145272D976285C68F6176284C5861E3A54787EE951EF02AB0DCA802`，与上传包完全一致；`fn detail` 回读 状态=部署完成、内存 256 MB、Nodejs18.15、超时 20 s、自动安装依赖 TRUE（与发布前一致，未改运行配置），修改时间 `2026-10-29 23:18:58`。
- 前端：提交 `08c696b`（`codex/platform-ops`，只含 `TournamentCenterAdmin.vue` 与 `views/membership/MembershipAdmin.vue`）→ `npm run deploy` 发布 release **`20261029152038-08c696bb`**，脚本回读 45 个文件摘要一致。
- 线上回读：`https://pingtai.sxffootball.cn/release.json` 为 `commit 08c696bb…`、`branch codex/platform-ops`；`/assets/TournamentCenterAdmin-CW_yj-4F.js` HTTP 200、461,398 B、SHA-256 `C41145B36F870F09CE32734398B86B191ED28F1C3E9007CD0CB6EFA958904D8B` 与本地 `dist` 逐字节一致，含 6 个 membership action 与「会员管理 / 会员档位 / 保存档位 / 会员订单 / 会员订阅」文案，`cloudbase/js-sdk` 计数 0。
- 鉴权探针：经 `webLoginApi` 的 `callFunction` relay 无会话调用 `membershipPlanGet/membershipOverview/membershipOrderList/membershipSubscriptionList`，均返回 `AUTH_REQUIRED`（未被「不允许调用云函数」拦截），说明 relay 白名单与路由在线、鉴权在前。
- `platform_membership_plans/_id=plans` 仍未写入：该集合为 `ADMINONLY`，本次使用的数据库管理凭据无该集合写权限（`No permission to operate`）。发布后再用 upsert 写入 2026-10-27 已确认四档表复测两次，均被拒绝（`[UpdateItem] No permission to operate`，RequestId `258164a1-39a6-44a4-8767-e0b47b3e4d9f`），确认为凭据权限限制而非文档形状问题，未采用绕过手段。页面已上线，需平台负责人在「会员管理 → 保存档位」点击写入并回读；未写入前平台页与用户端继续走代码内 2026-10-27 已确认表。

## 十、会员中心 H5 版式改版（2026-10-29，已发布）

用户反馈「订阅充值界面不好看」，并提出是否能用 GitHub 现成版式。结论与做法：

| 项 | 结论 |
|---|---|
| 开源定价版式是否存在 | 存在。`markmead/hyperui`、`MarsX-dev/floatui`、`saadeghi/daisyui` 为 MIT 可商用；`shadcn-ui/ui` 组件 MIT 但 Blocks 付费；Flowbite 核心 MIT、部分 Blocks 付费；Tailwind Plus / Cruip 部分模板付费 |
| 是否引入 | ❌ 不引入。本项目 H5 是原生 ES5 + 手写 CSS，无 Tailwind 构建链，引入任一组件库都要新增构建依赖，违反「云函数/网页端尽量减依赖」与既有页面风格一致性 |
| 实际做法 | 只借鉴公开定价页的**结构**（品牌头部 → 权益清单 → 档位对比 → 吸附 CTA），样式、DOM 与文案全部自写；未复制任何模板源码 |

### 改动清单

| 文件 | 变化 |
|---|---|
| `service-account-h5/service-personal.js` | 会员中心从半屏 `modal()` 改为整屏 `#memberPage`（`.mp-mask` + `.mp-sheet`）：`.mp-nav` 返回栏 / `.mp-hero` 品牌头部 / `.mp-panel` 上浮权益卡（2 列宫格，4 项未开放标 `pending`）/ 档位对比卡（Grid 三行两列，选中态深绿渐变 + 金色角标）/ `.mp-bar` 吸底下单条；点档位只切换选中，点底部按钮才下单；已开通态当前档「正在使用」默认选中、低档置灰单行说明；iOS 与未就绪给出说明卡。`membershipBuy` 改用 `paintMemberPage()`/`closeMemberPage()`；点击委托拆为 `memberPlan`（选中）/`memberBuy`（下单）/`memberClose`（关闭）；`PAGE_VERSION='v2.6'` |
| `service-account-h5/service-personal.js`（`MOCK`） | 修缺陷：原 `var MOCK=false` 使注释承诺的 `?mock=1` 从未生效，本地预览直接跳 oauth 空白。改为仅在 `file://`/localhost 生效，线上被加参数也不会展示假会员与假余额 |
| `service-account-h5/service-personal-polish.css` | 删除 5 条随旧结构失效的 `.me-member-*` 规则（`.me-member-status/title/plans/rights/note`），新增整块 `.mp-*` 版式；保留首页 `.me-home-member` 与 `.me-honey-*`。文件 24 → 76 行，花括号 172/172 平衡 |
| `service-account-h5/me.html` | `service-personal-polish.css?v=20261029-member2`、`service-personal.js?v=20261029-member2` |
| `service-account-h5/assets/icons/{gift,crown,camera,gallery}.svg` | 新增 4 个共享 SVG（`viewBox 0 0 24 24`、`fill=none`、`stroke #087A48`、`stroke-width 1.8`、圆角端点），与既有 `shield.svg` 同风格；不得用生成 PNG 代替 |

口径不变：价格、首月/续费资格、赠滴数、折扣全部取服务端字段（`data-price-cents` / `data-price-tier` 只用于自检断言），页面不新增价格表，也不自行判定档位资格。

### 自检

| 脚本 | 结果 |
|---|---|
| `node --check service-account-h5/service-personal.js` | 通过 |
| `tools/test-membership-h5-render.cjs` | 会员 H5 渲染自检 7 项通过（三档首月价、无首月时续费价、当前档 selected、低档 disabled、pending 权益 4 项、iOS 无档位、不自动续费说明） |
| `tools/test-membership.cjs` | 32/32 |
| `tools/test-service-private.cjs` | 18 personal service tests passed |
| `tools/shot-member-h5.cjs` | 390 / 414 / 320 三宽度截图，无 `pageerror`、无横向溢出 |

截图证据：`output/member-design-20261029/{home,member-open,member-open-basic,member-active,honey,member-320,member-414}.png`。目视确认：未开通态推荐档为进阶、底部「¥19.90 立即开通」；点基础档后选中态与底部金额同步为 ¥9.90；已开通态显示「进阶会员 · 剩余 20 天」、当前档默认选中、低档置灰单行不重叠、底部「续费 ¥29.90 立即续费」；320px 无挤压。

复现方式：本地起静态服务后访问 `me.html?mock=1`（已开通态加 `&member=active`），`MOCK` 只在 `file://`/localhost 生效。

### 发布（2026-10-29 23:16，用户授权）

- 7 个文件先落到独立暂存目录 `work/h5-publish-20261029/{me.html,service-personal.js,service-personal-polish.css,assets/icons/{gift,crown,camera,gallery}.svg}`，用 `hosting deploy` 分别上传正式 `service-account-h5` 与测试端 `preview/service-account-h5`（各 7 个文件全部成功），未把目录内其他文件（含其他会话未提交改动）带上线。
- 发布前逐行比对线上旧版：本地相对线上只有 2 行版本号、67 增 21 删（会员中心整段替换）与 57 增 5 删（`.mp-*` 版式），删掉的行全部是被替换的旧会员中心代码，无功能回退风险。

| 路径 | 大小 | SHA-256 |
|---|---|---|
| `service-account-h5/me.html` | 1,103 B | `89FB7540210BED2EB6C6201DE75157EFB16F046BF61F5A4F754E41170AEE9563` |
| `service-account-h5/service-personal.js` | 59,962 B | `45BF2791D0205992607FA7BE74C9876189BA6843891F42790CFC152B2A39AB10` |
| `service-account-h5/service-personal-polish.css` | 16,708 B | `6990C0D58B595114262045DD9946BF85F141BA054EF740848F193FFB7419F114` |
| `service-account-h5/assets/icons/gift.svg` | 335 B | `002927AEA3E9B643F96635B673802B1151FCA85A835039066F63590540B32BD4` |
| `service-account-h5/assets/icons/crown.svg` | 237 B | `BACD3BA34B84726619471F6F25F84C71C8B8F0215DC7E2D8C4888A37BB7AC223` |
| `service-account-h5/assets/icons/camera.svg` | 280 B | `35BDAFD599A0B7E500B977A0BB061D6851ED475DCBADB83D6999202EB6196C8E` |
| `service-account-h5/assets/icons/gallery.svg` | 284 B | `C98DB18C4EB792FAAFA2767DFC5A67C4E87C6A027EDBC4330AF397AF3A1A27F4` |

- 回读：`https://www.sxffootball.cn/service-account-h5/<文件>` 与 `https://www.sxffootball.cn/preview/service-account-h5/<文件>` 14 个地址全部 HTTP 200，带 `Cache-Control: no-cache` 取到的字节 SHA-256 与本地逐一一致；再加 `?v=20261029-member2` 查询串复核三文件，两端同样 200 且摘要一致。
- 上传期间短时出现过 404（CDN 缓存/回源切换的瞬间），几分钟后自愈；回读以「字节 SHA-256 与本地一致」为唯一判据，不以单次状态码下结论。

## 十一、本轮发布汇总（2026-10-29 23:16–23:21）

| 目标 | 入口 | 版本标记 | 回读证据 |
|---|---|---|---|
| 平台后端 `platformOwner` | 云函数（共享正式环境，无测试副本） | 代码 `2026-10-29 23:18:58` | 回下载 `index.js` `3A76C1D1…`、`membershipPlans.cjs` `99653767…` 与上传包一致；配置 256 MB / Nodejs18.15 / 20 s / 自动安装依赖 TRUE 未变 |
| 平台前端 | `https://pingtai.sxffootball.cn/` | release `20261029152038-08c696bb`（提交 `08c696b`） | `release.json` 提交一致；45 文件摘要一致；`TournamentCenterAdmin-CW_yj-4F.js` 200 且与本地 `dist` 逐字节一致 |
| 服务号 H5 正式 | `https://www.sxffootball.cn/service-account-h5/` | `?v=20261029-member2`、`PAGE_VERSION=v2.6` | 7 文件 200 + SHA-256 一致 |
| 服务号 H5 测试 | `https://www.sxffootball.cn/preview/service-account-h5/` | 同上 | 7 文件 200 + SHA-256 一致 |

其他端口未改动：小程序、`web-admin-vue`、`webLoginApi` 及其他云函数本轮均无变更与重发。

**唯一未完成的写入**：`platform_membership_plans/_id=plans`（集合为 `ADMINONLY`，本次管理凭据无写权限）。页面已上线，平台负责人登录 `https://pingtai.sxffootball.cn/` → 运营控制台 → 营销 → 会员管理 → 核对四档 → 「保存档位」即写入；保存后平台页与用户端会把档位来源显示为「库内已保存配置」，可在页面「最近保存记录」与订单/订阅读取中回读确认。

用户侧仍待办：商户平台 JSAPI 支付授权目录 `https://www.sxffootball.cn/service-account-h5/`、服务号 AppID 关联、1 元真实购买端到端（下单 → 收银台 → 回调 → 赠滴/余额/订阅 → 重复回调幂等）。

