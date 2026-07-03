# 赛小蜂足球青少年定位改造影响分析

> Issue: <https://github.com/xushengzheng415-max/saixaifeng/issues/3>
> 日期：2026-07-03

## 一、产品决策

从 2026-07-03 起，赛小蜂平台更名为 **赛小蜂足球**。

新定位：

- 只做足球，不做多体育平台。
- 只做青少年足球赛事和青少年球员服务。
- 不再面向业余球队、职业球队、城市联赛、地协赛等非青少年赛事类型。
- 赛事类型 `category` 原则上只保留 `youth`。

这不是简单文案修改，而是产品口径、数据口径、入口筛选、Mock 数据、创建流程和后续 2.0 青训方向的统一收口。

## 二、总体结论

当前代码里“多赛事类型”主要集中在以下区域：

- Web 管理后台赛事创建：允许选择 `youth/amateur/local/city/professional`。
- Web 赛事中心后台：赛事类型筛选、分类管理、分类映射仍保留 5 类。
- Portal 用户端：首页、赛事列表、球队页、快速入口、热点赛事、排行、赛程仍展示业余/地协/城市/职业内容。
- 小程序赛事创建：仍保留 5 类赛事 picker。
- 小程序比赛创建：仍有“校园足球 / 业余足球”双模式。
- 云函数：部分返回字段注释仍以 `youth/amateur/local` 为赛事分类口径，但目前没有强制过滤非 youth。
- 文档：`AGENTS.md`、`miniprogram/persona.md`、赛事中心 PRD/架构文档仍保留多类型、多体育或社会球队方向。

建议按三批推进：

1. **P0：业务入口收口**，把新增/展示/筛选统一为青少年足球。
2. **P1：青少年球员模型强化**，补年龄段、监护人、学校年级、未成年人保护口径。
3. **P2：历史数据与文档治理**，处理旧分类数据、迁移策略、PRD/ADR 更新。

## 三、P0 必改项

### 1. 品牌命名：赛小蜂 -> 赛小蜂足球

涉及：

- `index.html`
- `web-admin-vue/src/views/portal/layout/TopNavBar.vue`
- `web-admin-vue/src/views/portal/profile/ProfilePage.vue`
- `web-admin-vue/src/views/portal/components/LoginDialog.vue`
- `web-admin-vue/src/views/login/SelectRoleView.vue`
- `web-admin-vue/src/views/tournament/TournamentWebsite.vue`
- `web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`
- `web-admin-vue/src/views/tournament-center/TournamentCenterLogin.vue`
- `cloudfunctions/webLoginApi/index.js`
- `cloudfunctions/sendEmail/index.js`
- `miniprogram/pages/login/login.*`
- `miniprogram/pages/profile/profile.wxml`

建议：

- 对外品牌统一写“赛小蜂足球”。
- 邮件发件名、验证码标题、登录页、官网页脚、Portal 导航统一替换。
- 短信签名仍保持“河南麦步体育”，因为这是已审核短信签名，不要随品牌文案一起改。

### 2. 赛事类型只保留 youth

涉及：

- `web-admin-vue/src/views/tournament/TournamentCreate.vue`
  - `categoryOptions` 当前包含 `youth/amateur/local/city/professional`。
  - `form.category` 注释仍写 5 类。
- `web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`
  - 筛选下拉仍包含 5 类。
  - `categoryLabelMap` 仍包含 5 类。
  - `categories` 默认数据仍包含 5 类。
- `web-admin-vue/src/views/portal/tournament/components/CategoryFilter.vue`
  - 用户端筛选 tab 仍包含“全部/青少年/业余/地协/城市/职业”。
- `miniprogram/pages/tournament/create/create.js`
  - `CATEGORY_LABELS` / `CATEGORY_VALUES` / `CATEGORY_DESCS` 仍包含 5 类。
- `miniprogram/pages/tournament/create/create.wxml`
  - 仍展示“赛事类型” picker。

建议：

- 新建赛事时不再让用户选择赛事类型，默认 `category: 'youth'`。
- 前端仍可保留 `category` 字段用于兼容历史数据，但 UI 不展示多类型选择。
- 所有新增赛事写入 `category='youth'` 和 `categoryLabel='青少年赛事'`。
- Portal 用户端筛选不再显示非 youth 分类。可以保留状态筛选：报名中 / 进行中 / 已结束。

### 3. Portal 首页和列表移除非青少年内容

涉及：

- `web-admin-vue/src/views/portal/home/HomePage.vue`
  - banner/分类树包含业余、地协、城市、职业。
- `web-admin-vue/src/views/portal/home/components/QuickEntryGrid.vue`
  - 快捷入口包含 5 类赛事。
- `web-admin-vue/src/views/portal/home/components/HotMatches.vue`
  - Mock 热门比赛含“业余足球联赛”“地协挑战赛”。
- `web-admin-vue/src/views/portal/home/components/LiveSchedule.vue`
  - Mock 直播赛程含“业余联赛”“地协赛”。
- `web-admin-vue/src/views/portal/home/components/MiniRanking.vue`
  - Mock 排行含“业余赛事”“地协赛”。
- `web-admin-vue/src/views/portal/tournament/TournamentListPage.vue`
  - Mock 赛事列表含业余/地协。
- `web-admin-vue/src/views/portal/tournament/components/TournamentCard.vue`
  - 颜色映射仍包含 `amateur/local`。

建议：

- 首页主视觉改为“青少年足球赛事管理与成长平台”。
- 所有 Mock 赛事替换为 U 系列、校园、青训杯、区县青少年联赛。
- 快捷入口从“赛事类型”改为“年龄组/赛事阶段/服务入口”，例如：
  - U8-U10
  - U11-U12
  - U13-U15
  - U16-U18
  - 报名中
  - 赛程/成绩

### 4. Portal 球队页从社会球队改为青少年球队

涉及：

- `web-admin-vue/src/views/portal/chat/ChatPage.vue`

当前问题：

- 页面名是 `ChatPage`，但实际展示球队列表。
- 分类选项包含业余、地协、城市、职业。
- Mock 球队大量是成人/社会/业余球队。

建议：

- 短期：过滤/替换为青少年球队内容。
- 中期：重命名或拆分页面职责，避免 `chat` 路由承载球队列表。
- 球队维度改为“学校/青训机构/俱乐部梯队/年龄组”，而不是业余/地协。

### 5. 小程序比赛创建移除业余足球模式

涉及：

- `miniprogram/pages/match/create.js`
- `miniprogram/pages/match/create.wxml`
- `miniprogram/pages/match/create.wxss`

当前问题：

- `type: 'campus' // campus=校园足球, amateur=业余足球`
- WXML 展示“业余足球”卡片。
- 创建数据写入 `typeName: 校园足球/业余足球`。
- 业余模式下支持球员自主报名和官员角色配置。

建议：

- 改为青少年足球单模式。
- 如果仍需区分，可改成“校园赛事 / 青训俱乐部赛事”，不要再使用“业余足球”。
- 官员角色可保留为青少年赛事工作人员配置，但文案改为“赛事工作人员/队伍工作人员”。

### 6. 云函数列表和详情默认过滤 youth

涉及：

- `cloudfunctions/getTournamentList/index.js`
- `cloudfunctions/getTournamentDetail/index.js`
- `cloudfunctions/getTournaments/index.js`
- `cloudfunctions/webLoginApi/index.js` 中相关 `dbQuery` 或 relay 请求

建议：

- 对用户端赛事列表默认只返回 `category === 'youth'` 或历史缺省兼容策略。
- 管理后台如果需要查看历史旧数据，可加“历史非青少年数据”内部开关，不对普通用户展示。
- `type` 字段和 `category` 字段存在混用风险，建议统一读写 `category`，老 `type` 只做兼容。

## 四、P1 青少年球员模型改造

现在系统已有 `birthDate`、`idCard`、年龄计算、球衣名、球员编号等基础能力，但青少年定位需要补充业务约束。

建议新增或强化字段：

- `birthDate`：必须，用于年龄组判断。
- `ageGroup`：U8-U18，例如 `U12`。
- `school`：学校。
- `grade`：年级。
- `guardianName`：监护人姓名。
- `guardianPhone`：监护人手机号。
- `guardianRelation`：与球员关系。
- `emergencyContact`：紧急联系人。
- `healthNote`：健康备注。
- `consentStatus`：监护人授权状态。

涉及模块：

- `web-admin-vue/src/views/player/PlayerList.vue`
- `web-admin-vue/src/views/player/PlayerDetail.vue`
- `web-admin-vue/src/views/team/TeamDetail.vue`
- `miniprogram/pages/team/player-add/**`
- `miniprogram/pages/team/player-detail/**`
- `cloudfunctions/createPlayer/index.js`
- `cloudfunctions/updatePlayer/index.js`
- `cloudfunctions/getPlayers/index.js`

注意：

- `miniprogram/persona.md` 之前写过 2.0 的 `guardianRelation/school/grade/healthNote` 不写入 1.0 的 `players`。现在定位变化后，这条需要重新决策：如果 1.0 也只服务青少年，监护人和学校字段应进入当前球员资料或建立关联集合。

## 五、P2 文档和历史数据治理

### 1. 文档必须更新

涉及：

- `AGENTS.md`
- `miniprogram/persona.md`
- `docs/tournament-center-prd.md`
- `docs/tournament-center-architecture.md`
- `CODEBUDDY.md`

需要更新的旧口径：

- “赛小蜂”平台名。
- “多体育平台预留”。
- “业余赛事/职业赛事/城市联赛/地协赛”。
- “综合门户/球迷/自媒体/竞猜/弹幕游戏”等偏泛足球社区定位。
- “赛事分类体系 5 类/7 类”。

### 2. 历史数据处理

数据库中可能已有：

- `category: amateur/local/city/professional`
- `type: amateur/local`
- 非青少年 Mock 或测试赛事
- 社会球队/成人球员数据

建议迁移策略：

1. 不直接删除历史数据。
2. 新增内部字段：`isLegacyCategory: true` 或 `legacyCategory`。
3. 用户端默认隐藏非 `youth`。
4. 管理后台提供历史数据筛查和批量处理入口。
5. 明确是否允许把部分旧赛事转为青少年赛事。

## 六、建议执行批次

### 第一批：口径收口，风险低

- 品牌文案统一为“赛小蜂足球”。
- 新增赛事默认 `category='youth'`。
- 移除 Web/小程序创建页的非青少年赛事类型选项。
- Portal 首页和列表 Mock 数据全部替换为青少年。
- 更新 `AGENTS.md` 和 `miniprogram/persona.md` 的产品定位。

### 第二批：数据过滤，风险中

- 用户端赛事列表默认只展示 youth。
- 赛事中心后台分类管理移除公开的非 youth 分类。
- 云函数统一 `category/type` 兼容读取策略。
- 增加历史非 youth 数据隐藏/标记逻辑。

### 第三批：青少年资料和合规，风险高

- 球员资料补监护人、学校、年级、年龄组。
- 赛事报名增加年龄组校验。
- 参赛名单审核增加青少年字段完整性检查。
- 增加监护人授权/隐私保护策略。

## 七、验收标准

- 用户新增赛事时看不到“业余赛事/地协赛/城市联赛/职业联赛”。
- 用户端 Portal 不展示非青少年分类入口和非青少年 Mock 内容。
- 新增赛事写入 `category='youth'`。
- 对外文案统一为“赛小蜂足球”。
- 小程序创建比赛不再出现“业余足球模式”。
- 文档明确：赛小蜂足球只做青少年足球赛事。
- 历史非 youth 数据不会在用户端默认曝光。

## 八、风险提醒

- `local` 字符串大量来自 `localStorage` 和样式属性，批量替换时必须避免误伤。
- `city` 既是赛事类型，也是球队城市字段，不能简单全局替换。
- `type` 同时被用作赛事分类、赛制、比赛创建类型，必须逐文件确认。
- WXML 改动必须遵守表达式限制，复杂逻辑放 JS 预计算。
- `cloud.js` 或 `webLoginApi` 改动后需要按部署流程构建/部署。
