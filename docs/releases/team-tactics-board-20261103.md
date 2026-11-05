# 球队首页战术板 · 发布记录（2026-11-03）

状态：**共享后端 `getMiniWorkspace` 已三次差量发布并完成真实读写验证（最终版为横版全屏 + 自由拖拽口径，见第九节；第一至八节为历史过程，其中“预设点位/竖版/我方球门在下方”等描述已被第九节替代）；小程序 1.2.39 开发版已上传（体验版设置与正式发布未做），未提交推送、未合并 main/preview。**

> 结论以第九节为准。第一至七节的预设点位与竖版几何、第八节的“未上传”状态均为历史记录，仅用于追溯。

需求：用户指令「在球队首页加上战术板功能」；口径校正「这个战术板其实就是球员与对方球员的攻防演练，会在场下做战术安排，不是只传阵容，战术板里只需衣服号码即可」，并在「拖动自由摆位」与「点选预设点位」中选择 A（预设点位）；该选择已被 2026-11-04 的“横版全屏 + 自由拖拽”替代（见第九节）。

## 一、范围与边界

- 入口在球队首页菜单，位于「球队球员库」之后、「参赛管理」之前。
- 页面 `pages/team/tactics/tactics`，只读取当前球队球员库，不跨队取人。
- 支持 5 / 7 / 8 / 9 / 11 人制与已有 `sharedFormation.cjs` 阵型数据。
- 棋盘是**双方攻防演练**画板：我方位置点选本队球员并用其球衣号码显示；对方位置只手填号码（1—99），不关联对手球队或对手名单；位置为阵型预设点位，不自由拖拽。
- 支持「攻防方向」切换（我方进攻 / 我方防守：进攻方压上、防守方收缩；我方球门固定下方）、替补席添加/移除、战术名称与要点、保存与删除。
- 战术板是训练/赛前推演工具，**不替代赛事报名与正式阵容**，不写报名、正式名单、单场阵容、比赛事件、球员卡、历史快照或竞技统计。
- 不根据手机号、角色名称或球队占位自动推断权限。

## 二、改动文件

| 文件 | 变更 |
| --- | --- |
| `cloudfunctions/getMiniWorkspace/index.js` | 仅新增 `teamTactics.cjs` require 和 `teamTactics` / `saveTeamTactic` / `deleteTeamTactic` 三个 action 分支；未改其他 action |
| `cloudfunctions/getMiniWorkspace/teamTactics.cjs`（新增） | 战术板读取、保存、删除与统一校验；集合 `team_tactics` |
| `cloudfunctions/getMiniWorkspace/teamDeletion.cjs` | 球队删除关联检查新增 `team_tactics`，防止留下孤立战术 |
| `miniprogram/app.json` | 球队分包新增 `tactics/tactics` |
| `miniprogram/pages/team/team.js` | 球队首页菜单与路由新增「战术板」，视觉验收夹具同步 |
| `miniprogram/pages/team/tactics/tactics.{js,json,wxml,wxss}`（新增） | 战术列表、全屏排阵、球员选择、替补席、保存/删除 |
| `miniprogram/utils/team-tactics.js`（新增） | 阵型、槽位保留、换人、前端预校验；与 `lineup-layout.js`、`formation-rules.js` 共用现有阵型数据 |
| `tools/test-team-tactics-board.cjs`（新增） | 服务端权限、租户、球员归属、满编、重复、乐观锁、删除测试 |
| `tools/test-mini-team-tactics.cjs`（新增） | 页面新建/打开/排阵/替补/保存链路测试 |
| `docs/PRODUCT_RULES.md`、`docs/ADR.md` | 确认球队战术板为长期球队内部资产，补充球队详情第六个入口，并注明原五项职责不变 |
| `docs/CURRENT_STATUS.md`、`docs/data-center/INTEGRATION.md`、本篇 | 状态与数据入口登记 |

未改动：`webLoginApi`、`uploadFile`、PC 后台、平台后台、`service-account-h5`、赛事报名/正式名单/单场阵容代码、数据库既有业务数据。

## 三、接口与数据

### 3.1 Actions

| action | 权限 | 说明 |
| --- | --- | --- |
| `teamTactics` | `team.view` 或 `team.manage` | 返回球队、`canManage`、当前球队战术列表、每队上限 |
| `saveTeamTactic` | `team.manage` | 新建或按 `tacticId + version` 更新 |
| `deleteTeamTactic` | `team.manage` | 删除当前球队的单套战术；可选校验 `version` |

工作空间和球队归属继续使用 `findWorkspaceForAction` + `loadTeams`，不接受前端传入的 `orgId` 或球队越权。

### 3.2 `team_tactics` 字段

```text
_id, orgId, teamId, name, matchSize, formation,
direction: 'attack' | 'defend',
positions: [{ role, playerId }],
opponentPositions: [{ role, number }],
substituteIds: [playerId],
notes, status: 'active', version,
createdBy, updatedBy, createTime, updateTime
```

- 每队最多 20 套。
- 我方位置必须满编并使用所选阵型的全部角色；角色唯一、球员唯一。
- 对方位置按同一阵型角色记录号码：1—99 的整数，去掉前导 0；同侧号码不得重复；未填允许留空；不写对手球队或对手球员档案。
- 球员必须是该球队当前未归档/未删除的球员；替补最多 15 人。
- 更新使用 `version` 乐观锁，冲突返回「战术方案已更新，请刷新后重试」。
- 列表读取失败不冒充空列表；仅对「集合尚不存在」返回空。
- 旧战术缺少 `direction` / `opponentPositions` 时按「我方进攻 + 无对方」回读，不报错、不丢数据。
- 球队删除检查已加入 `team_tactics`，有战术时需先删除战术再删球队。

## 四、页面行为

- 新建战术不默认选择 8 人制或其他赛制；先由用户选择人数，再展示对应阵型。
- 切换阵型按角色保留可复用的我方球员与对方号码，未匹配位置留空。
- 我方位置点选本队球员后显示球衣号码；长按移出；同一球员不能同时出现在两个位置或场上与替补席。
- 对方位置点按后打开号码面板：数字键面（1—15 快选）+ 手填 1—99；重复号码即时提示且不写入，现已填号码可一键清空。
- 「攻防方向」在我方进攻/我方防守间切换，切换后按角色保留双方号码，我方门将始终贴下方门线。
- 保存前在前端提前校验，服务端再统一校验；两处均通过才写入。
- 已保存战术打开时，若球员已不在当前球队，位置留空并提示重新确认，不自动换人、不按姓名合并。
- 非 `team.manage` 身份可查看战术，但不能新建、修改、删除。

## 五、验证

```powershell
node --check cloudfunctions/getMiniWorkspace/teamTactics.cjs
node --check cloudfunctions/getMiniWorkspace/index.js
node --check cloudfunctions/getMiniWorkspace/teamDeletion.cjs
node --check miniprogram/pages/team/tactics/tactics.js
node --check miniprogram/utils/team-tactics.js
node tools/test-team-tactics-board.cjs
node tools/test-mini-team-tactics.cjs
node tools/test-mini-empty-team-deletion.cjs
```

本地结果：上述语法检查通过；`test-team-tactics-board.cjs` 覆盖空集合读取、创建、列表、版本更新、冲突、未满编、重复替补、跨队球员、只读身份、球队越权、无查看权限、删除，以及小程序辅助函数；`test-mini-team-tactics.cjs` 覆盖视觉夹具打开已保存战术、新建、选人数、逐个排满 5 个首发、添加替补、保存载荷、切换阵型保留首发、只读身份阻止新建；`test-mini-empty-team-deletion.cjs` 通过（战术集合已纳入关联检查）。

微信开发者工具：`pages/team/tactics/tactics.wxml` 与 `tactics.wxss` 编译通过（WXML codeLength 32,400；WXSS files 2）；在 355×769 模拟器打开视觉夹具页，核对战术列表、已保存 5 人制详情、球员选择面板、新建未选人数状态、11 人制空阵型，以及球队首页新增菜单行；打开编辑器后 console 缓冲无 tactics 相关 error/warn（仅既有 `wx.getSystemInfoSync` 废弃提示）。视觉夹具仅在 devtools + `visualQa=1` 生效。

未完成验证：小程序上传与体验版、真实手机尺寸验收（主包超限被阻，见第七节）。

## 六、发布前置条件

1. 用户明确授权发布 `getMiniWorkspace` 共享后端；按线上最新包差量上传，发布前 `node --check`，发布后回下载比对、`Active/Available` 读回，并用测试球队完成一次真实读写。
2. 首次保存会自动创建 `team_tactics` 集合；也可在 CloudBase 控制台预建，确认查询不依赖额外索引。
3. 小程序按正式发布流程上传/设置体验版；需在真实手机尺寸检查 5/11 人制槽位、球员选择滚动、替补席、长按移除和保存失败反馈。
4. 发布后按规则同步对应测试端（如适用），并记录源码提交、云函数读回、包体与页面结果。

## 七、后端发布结果（2026-11-03，用户授权「执行发布」）

### 7.1 差量上传

- 基线：从线上回下载 `getMiniWorkspace` 到 `E:\Documents\_sxf-online\gmw-20261103-baseline`，不以本地旧包为准。
- 发布包 `E:\Documents\_sxf-online\gmw-20261103` 与基线逐文件 SHA-256 比对：**仅 3 个文件不同**——新增 `teamTactics.cjs`、`index.js`（+4 行：1 个 require + 3 个 action 分支）、`teamDeletion.cjs`（关联检查新增 `team_tactics` 一行，并把「集合不存在」判定统一为兼容 `-502005` 与常见缺集合文案，避免新集合尚未创建时阻断所有球队删除检查）。仓库里同期其他未发布改动（`friendlyMatchCenter`、`webLoginApi` 等）**没有**混入本次上传。
- `node --check` 对上述 3 个文件通过；未改动 `package.json` 与 `node_modules` 业务依赖。

### 7.2 配置读回

`fn detail` 发布前后比对：`Status=Active`、`AvailableStatus=Available`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=150`、`InstallDependency=TRUE`、`DeployMode=code`、无触发器、环境变量结构逐字相同（不打印值）。CLI 上传时提示「未找到函数配置，使用默认配置」，已验证未影响上述配置。

`fn invoke` 空载调用 6 ms 成功返回鉴权错误，证明模块加载与入口正常。

### 7.3 回下载核对

回下载到 `E:\Documents\_sxf-online\gmw-20261103-live`：4820 个文件；业务文件 `index.js`、`teamTactics.cjs`、`teamDeletion.cjs` 与拟发包 SHA-256 **完全一致**。差异仅 `node_modules/semver`、`node_modules/web-streams-polyfill`（`InstallDependency=TRUE` 在线安装刷新间接依赖），非本次业务代码。

### 7.4 真实读写验证（微信开发者工具，真实账号 + 真实球队）

工作空间 `team:26e7c5456ae31e25004201ff7f605f38`，球队「郑州郑漂足球俱乐部」：

| 步骤 | 结果 |
| --- | --- |
| `teamPlayers` | `canManage: true`，11 名球员 |
| `teamTactics` | 返回键 `success/team/canManage/tactics/maxSaved`，`canManage: true`，`maxSaved: 20` |
| `saveTeamTactic`（新建 5 人制 2-2） | 成功，`tacticId=44fa72886ae9ea15000310034e9bdb48`，自动创建 `team_tactics` 集合 |
| `teamTactics` 列表 | 1 套，5 名首发、1 名替补，`version=1` |
| `saveTeamTactic`（`tacticId+version=1` 改阵型） | 成功，`version=2` |
| `saveTeamTactic`（重复提交 `version=1`） | 被拒：「战术方案已更新，请刷新后重试」 |
| `deleteTeamTactic` | 成功，列表回到 0 套（验证数据已清理，未留生产脏数据） |
| `teamDeletionInfo` | 正常返回「球队内有球员，不能删除」，未出现 `TEAM_DELETE_CHECK_FAILED` |

页面侧：开发者工具打开 `pages/team/tactics/tactics?teamId=26e7c5456ae31e25004201ff7f605f38`，`canManage=true`、`canCreate=true`、`errorText` 为空、11 名球员，「新建战术」按钮正常显示，不再出现「当前身份只可查看」。

### 7.5 小程序上传阻塞

`cli upload`（1.2.39）被微信拒绝：`code 10, 代码包大小超过限制, main package source size 2130KB exceed max limit 2048KB`。**本次未产生任何开发版**。

- 主包按源文件核算 2,199,731 B ≈ 2148 KB，与 CLI 的 2130 KB 同量级；上限 2,097,152 B，需至少腾出约 100 KB（保留余量）。
- 相对 1.2.30 上传基线，主包增长约 133.6 KB，来源是**同期其他任务**：`pages/discover/invite-manage/*` 45.8 KB、`pages/discover/invite-qr.js` 14.3 KB、`images/brand/share-home-v1.jpg` 34.6 KB、`pages/notify-entry/*` 1.6 KB，以及 19 个文件共 32.6 KB 的改动增量。
- 本功能在主包内只占 `utils/team-tactics.js` 3,972 B 与 `team.js` 菜单几行；战术页 4 个文件位于 `pages/team` 分包，不占主包。
- 已核对主包图片：除 `images/icons/`、`images/runtime/guest-experience-v1/`、`images/flags/` 三个动态拼接目录外，**不存在零引用图片**，无法按 1.2.25 的做法加入 `packOptions.ignore`。
- 待决策（不改他人任务、不影响视觉为前提，需用户选定后执行）：①把 `pages/discover/invite-manage`、`invite-qr`、`notify-entry` 移入 `packageDiscover` 等分包并改路由（约 62 KB，仍不足）；②重编码主包最大的 6 张底图（合计约 355 KB，按 1.2.17 先例压到约 240 KB，可省 ~110 KB）；③先只发后端，等主包瘦身任务完成后再上传小程序。

## 八、口径校正后的改造与第二轮发布（2026-11-03）

### 8.1 口径与实现

用户校正「战术板其实是球员与对方球员的攻防演练，战术里只需衣服号码」，并选择方案 A（预设点位，不做自由拖拽）。据此重构：

| 层次 | 改动 |
| --- | --- |
| 棋盘 | 双方棋子：我方为绿色实心圆 + 球衣号码；对方为虚线圆角方框 + 手填号码；同屏显示，共用所选阵型的预设点位 |
| 攻防方向 | 新增 `attack` / `defend`；我方球门固定下方、对方球门固定上方；进攻方深度按 0.55 压上、防守方按 0.35 收缩在本方半场（不再整盘镜像，避免我方球门跑到上方、两队在中场重叠） |
| 对方输入 | 点对方位置打开号码面板：1—15 快选 + 手填（只留数字、最多 2 位）；重复提示「对方已有 X 号，请换一个号码」且不写入；可清空 |
| 兼容 | 旧战术缺 `direction` / `opponentPositions` 时按「我方进攻 + 无对方」打开并保存，不报错 |
| 边界 | 仍不写报名、正式名单、单场阵容、比赛事件、球员卡与竞技统计；替补席只作轮换提示 |

改动文件：`miniprogram/utils/team-tactics.js`（双双棋盘点位、方向压缩、号码归一化与校验）、`miniprogram/pages/team/tactics/tactics.{js,wxml,wxss}`（方向 chips、双方 token、号码面板、图例、方向标签避让球门区）、`miniprogram/pages/team/team.js`（菜单副标题「我方与对方号码攻防演练」）、`miniprogram/config/release.js`（1.2.39 版本日志改新口径）、`cloudfunctions/getMiniWorkspace/teamTactics.cjs`（新增 `direction` 与 `opponentPositions` 归一化、校验、`publicTactic` 兼容回读）、`tools/test-team-tactics-board.cjs` 与 `tools/test-mini-team-tactics.cjs`（新增对方号码、重复拦截、方向切换与几何断言）。

### 8.2 本地验证

- `node --check`：`team-tactics.js`、`tactics.js`、`teamTactics.cjs` 通过。
- `node tools/test-team-tactics-board.cjs` → `team tactics board checks passed`（含 `direction`/`opponentPositions` 落库、`1/09/100` 与非法 role 拒绝、旧战术兼容、删除）。
- `node tools/test-mini-team-tactics.cjs` → `mini team tactics page checks passed`（含对方号码面板、重复拦截、方向切换后号码按角色保留、两种方向下我方门将均在下半场）。
- 开发者工具（355×769，`visualQa=1`）：列表页显示「双方攻防演练 / 只用球衣号码」与「我方 5/5 · 对方 5」；编辑器我方号码 `1/4/5/6/9`、对方号码 `1/7/9/10/11`；`attack` 时我方区块 54%–84%、对方 14%–33%；`defend` 时我方收缩到 67%–86%、对方压到 16%–46%，无重叠、无「我方球门跑到上方」。

### 8.3 第二轮差量发布

- 基线：`fn code download getMiniWorkspace E:\Documents\_sxf-online\gmw-20261103-r2`（取线上当前包，163 个业务文件）。
- 只覆盖 `teamTactics.cjs` 一个文件（本地仓库版本），与上一轮回下载包逐文件 SHA-256 比对：**仅 `teamTactics.cjs` 不同**（`index.js`、`teamDeletion.cjs` 保持线上原样），仓库里其他在途改动（`friendlyMatchCenter`、`webLoginApi`、`generateSchedule` 等）未混入。
- `node --check` 三个文件通过 → `fn code update getMiniWorkspace --dir … --deployMode cos` 成功。
- 配置读回：`Active` / `Available`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=150`、`InstallDependency=TRUE`、`DeployMode=code`、无触发器、环境变量未增删；`fn invoke` 空载 3 ms 返回 `WORKSPACE_LOAD_FAILED`（模块加载正常，未写库）。
- 回下载 `E:\Documents\_sxf-online\gmw-20261103-r2-live`：163 个业务文件与拟发包 **0 处差异**；`teamTactics.cjs` SHA-256 `8328618411CE08E1E7DEC9A7015FD9F3A93E4BAAF323BECE32262CEBCA963454`（与本地仓库一致）。

### 8.4 真实读写验证（真实账号，球队「郑州郑漂足球俱乐部」）

| 步骤 | 结果 |
| --- | --- |
| `teamPlayers` | `canManage: true`，返回本队球员 |
| `saveTeamTactic`（5 人制 2-2，`direction: 'defend'`，对方 5 个号码 `1/7/9/10/11`，1 名替补） | 成功，`tacticId=3ee56dc96ae9f5600002d6ad4831e125` |
| `teamTactics` 列表 | 回读 `direction: 'defend'`、`opponentPositions` 5 条（号码有序）、`substituteIds` 1 人、`updatedAtText 11-03 22:53` |
| `saveTeamTactic`（对方 `GK 7` + `CB1 7`） | 被拒「对方号码不能重复，请改成不同号码」，未写库 |
| `deleteTeamTactic` | 成功；列表回到原有 1 套（他人数据 `332`，未动） |

### 8.5 仍未完成

- 小程序包未上传：`cli upload` 仍受主包 2130 KB > 2048 KB 限制，需用户先选定瘦身方式（第七节 7.5 三个选项）。
- 未提交推送、未合并 `main` / `preview`，线上正式小程序仍为旧版本、无战术板入口。

## 九、第三轮：横版全屏 + 自由拖拽（2026-11-04）

### 9.1 用户反馈与口径

用户截图显示设备端仍是旧版（竖版、显示球员姓名、仅我方、首发 8/8、战术「332」），并给出四点要求：

1. 「怎么还是这样呢？你是没上线吗？」——旧构建仍在设备端，根因是上一轮 `cli upload` 因主包超限被拒（旧包从未上传，不是代码未写）。
2. 「自由拖拽会比较好一点，战术版自由度应该高一点。」
3. 「让它的版面铺满整个手机屏幕，这样的话把工具做到上面就行了。」
4. 「尽量横版，不要竖版，要横版体现。」

据此确定：**横版全屏 + 顶部单行工具条 + 双方自由拖拽 + 坐标落库**，替代方案 A 的预设点位与攻防压缩几何（见 `docs/ADR.md` 2026-11-04 条目）。

### 9.2 实现

| 层次 | 改动 |
| --- | --- |
| 页面拆分 | 新增 `miniprogram/pages/team/tactics/board/board.{json,js,wxml,wxss}`（横版全屏编辑页）；`tactics` 列表页改为纯列表并 `navigateTo` 进入编辑页 |
| 横版全屏 | `board.json`：`navigationStyle: custom`、`pageOrientation: landscape`、`disableScroll: true`；`bs-page` 固定全屏，`.bs-bar` 顶部 52px 单行工具条，`.bs-pitch` 从 52px 铺到屏幕底部 |
| 自由拖拽 | `bindtouchstart/move/end` + `createSelectorQuery('#bsPitch')` 换算屏幕百分比；双方棋子均可拖动，`x` clamp `[4,96]`、`y` clamp `[10,90]`；拖拽后 160ms 内抑制点击，避免误触打开选人面板 |
| 棋盘几何 | 我方球门在左、对方球门在右；默认点位按阵型深度/横向推导（`8+depth*0.84`、对方镜像 `92-depth*0.84`），阵型只决定默认值与位置数量 |
| 工具条 | 返回、战术名称、`人数 · 阵型`、攻防方向、`我方 x/x · 对方 y`、要点、保存；选人/号码/阵型人数/要点面板改为底部抽屉 |
| 兼容与边界 | 旧数据缺 `x/y` 时服务端按阵型回退默认点位；越界坐标服务端夹边界；仍不写报名、正式名单、单场阵容、比赛事件、球员卡与竞技统计 |

改动文件：`miniprogram/utils/team-tactics.js`（横版百分比坐标模型：`defaultPoint`/`slotStyle`/`clampX`/`clampY`/`slotsFor`/`rivalSlotsFor`/`preserveSlots`/`preserveRivalSlots`/`validateDraft` 带 `x/y`）、`miniprogram/pages/team/tactics/board/*`（新增）、`miniprogram/pages/team/tactics/tactics.{js,wxml,wxss}`（改纯列表）、`miniprogram/app.json`（注册 `tactics/board/board`；`scope.userLocation.desc` 压到 30 字以内以通过上传校验）、`cloudfunctions/getMiniWorkspace/teamTactics.cjs`（`pointFor`/`defaultPoint`/`normalizePositions`/`normalizeOpponentPositions` 保存与回读 `x/y`）、`miniprogram/config/release.js`（1.2.39 版本日志改横版自由拖拽口径）、`tools/test-team-tactics-board.cjs`、`tools/test-mini-team-tactics.cjs`（改列表页）、`tools/test-mini-team-tactics-board-page.cjs`（新增）。

### 9.3 本地验证

- `node --check`：`board.js`、`tactics.js`、`team-tactics.js`、`teamTactics.cjs` 与三个测试脚本全部通过。
- WXML 表达式扫描（`pages/team/tactics` 下全部 `*.wxml`）：无比较、三元、方法调用、数组索引命中。
- `node tools/test-team-tactics-board.cjs` → `team tactics board checks passed`（新增横版几何、`clampX/clampY`、`slotStyle`、拖拽坐标落库/回读/夹边界断言）。
- `node tools/test-mini-team-tactics.cjs` → `mini team tactics list page checks passed`（列表摘要、只读拦截、跳转 URL、旧包阻断、缺球队参数）。
- `node tools/test-mini-team-tactics-board-page.cjs` → `mini team tactics board page checks passed`（夹具双方号码、拖拽与抑制点击、对方号码重复拦截、换人、换阵型/人数保留点位、方向切换不改点位、保存载荷含 `x/y`、只读拦截、删除确认、保存失败恢复）。
- 开发者工具（`visualQa=1&tacticId=qa-board-1`）：`windowWidth=844 / windowHeight=390`、`deviceOrientation=landscape`；`.bs-bar` `top 0 / height 53`、`.bs-pitch` `top 52 / bottom 390 / width 844`（铺满剩余整屏）；我方 5/5、对方 5，我方 `1/4/5/6/9`（绿圆）与对方 `1/7/9/10/11`（黄框）分居左右半场；截图核对顶部工具条单行、无裁切。
- 横版页使用 px 而非 rpx：横屏下 `1rpx≈1.08px` 且可用高度仅约 346rpx，rpx 会放大并挤压布局。

### 9.4 第三次差量发布（`getMiniWorkspace`）

- 基线：`fn code download getMiniWorkspace E:\Documents\_sxf-online\gmw-20261103-r3`（线上包 163 个业务文件）。
- 只覆盖 `teamTactics.cjs`；与线上包逐文件 SHA-256 比对：**仅该文件不同**，`index.js` / `teamDeletion.cjs` 及其余在途改动未混入。
- `node --check` 通过 → `fn code update getMiniWorkspace --dir … --deployMode cos`。
- 配置读回：`Active` / `Available`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=150`、`InstallDependency=TRUE`、`DeployMode=code`、无触发器、环境变量未增删。
- 回下载 `E:\Documents\_sxf-online\gmw-20261103-r3-live`：163 个业务文件与拟发包 **0 处差异**；`teamTactics.cjs` SHA-256 `418C…`（与本地仓库一致）。

### 9.5 真实读写验证（真实球队「郑州郑漂足球俱乐部」）

| 步骤 | 结果 |
| --- | --- |
| `saveTeamTactic`（5 人制 `3-1`，我方 5 人带自由坐标，对方 `1/7/9/10/11` 带自由坐标） | 成功，坐标原样回读：`GK@12.5,48.6` … `FW@61.8,37.4`；对方 `GK#1@86.5,50.4` … `FW#11@45.6,31.5` |
| `teamTactics` 列表 | 新战术 `withXY=5`、对方 5 条；旧战术「332」（8 人制、无坐标）回读 `withXY=8`，`GK` 默认落到 `14.7,50`（左侧球门），旧数据未被破坏 |
| `saveTeamTactic`（对方 `GK 7` + `CB1 07`） | 被拒「对方号码不能重复，请改成不同号码」 |
| `saveTeamTactic`（坐标 `x=300,y=-20`） | 成功并夹到 `x=96,y=10` |
| `deleteTeamTactic` ×2 | 成功；列表回到原有 1 套「332」 |

### 9.6 小程序上传（解决「没上线」）

- 分包迁移落地后主包为 `1,922,481 B`（1.8 MB < 2048 KB），`cli upload` 通过：`TOTAL 4.9 MB / main 1.8 MB / pages/team 775.1 KB / packageCard 1.4 MB`。
- 版本 `1.2.39`，描述「球队战术板：横版全屏自由拖拽」，AppID `wx57164cca8676f411`。
- 上传前修掉阻塞项：`app.json` 的 `scope.userLocation.desc` 原为 32 字，微信上限 30 字，上传报 `80058`；已压为「用于同城赛事排序与约球选择比赛场地」。
- 上传成功仅代表开发版可用；体验版仍需在微信公众平台设置，未提交审核、未正式发布。
- 云函数 `getMiniWorkspace` 为正式共享后端，球队端小程序直接调用该函数，开发版与正式环境共用；本轮为代码发布，未改配置。

