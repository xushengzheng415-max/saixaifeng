# 赛事转会中心研发交接

版本：R2｜日期：2026-10-26｜当前赛事转会中心，含PC。

交接对象：Trae。交付内容：视觉取舍、当前赛事范围、PC页面、云函数与小程序接口、现有候选代码、数据边界和验收要求。本文件不是生产发布或数据库迁移授权。

## 一 本轮范围

用户最新明确要求：只做“本地赛事入口里面的转会中心”，包括PC端。

小程序路径为本地赛事入口→具体赛事→赛事转会中心。主办PC路径为赛事空间→具体赛事→转会中心。所有办理动作必须绑定当前tournamentId；事件上下文丢失或切换时重新校验，不能借用上一赛事缓存。

本轮交付涵盖转会市场、球员查询、资料、报价、接收意向、谈判、自由签约、租借、转会进度，以及PC窗口设置、审核和历史记录。后台需要记录一年合同并支持租借激活/到期，但不因此建设独立合同管理系统。

发现首页改版、全平台独立市场、平台运营后台、球队全局合同管理、球员服务号续约页面不列入本轮施工。原规划中的续约规则仍保留；相关候选接口保持兼容，作为后续衔接，不删除、不新增本轮入口。跨赛事审批链路也不在本轮建设范围；这不是对长期跨赛事政策作结论。

“本地赛事”是用户指定的业务入口，不表示只做localhost演示，也不表示新增球员户籍、GPS定位或城市归属限制。访问公开资料与有权办理转会分开；固定当前赛事不等于可以读取该赛事外机构的私有经营资料。

## 二 采用哪些设计

视觉结论：手机端以用户提供的九张最新图稿为主线，PC采用R1的四个赛事后台视图；继承R1可编辑源、共享图标、透明形象照、权限状态和异常处理。融合R2是关键页面适配补充，不把局部样稿说成全套已替换。

同日《发现赛事与转会市场图稿交接》已经登记榜单、最新转会卡、独立查询和指定按钮文案。保留这些模块；待细化的是算法、比较窗口和公开金额投影，而不是删除模块。更早的“市场首页直接堆查询结果”探索由最新“市场入口→独立查询页”替代。

| 页面 | 本轮依据 | 后台承接 |
| --- | --- | --- |
| 发现赛事入口 | 只接现有本地赛事，不重做发现首页 | 传真实tournamentId，复用现有赛事中心入口 |
| TM01赛事转会市场 | 最新参考稿及融合R2 | 当前赛事窗口、实力/上升模块状态、查询入口、已完成转会的公开投影 |
| TM11球员查询 | 最新独立查询稿及融合R2 | 球队、组别、位置、关键词与分页；不按姓名合并 |
| TM02球员详情 | 最新稿入口语义及R2完整形象 | 公开资料、统一统计/估值、当前关系及服务端操作能力 |
| TM06发起报价 | 最新报价草稿稿，R1表单为结构补充 | 正式转会/租借、人民币金额、期限、赛事、可选留言、请求幂等 |
| TM08转会收件箱 | 最新原队稿及融合R2 | 当前球队收到/发出意向、轮到谁回复、未读与业务状态分开 |
| TM03报价与还价 | 最新稿及融合R2 | 完整不可变条款、当前轮次/版本、接受/还价/拒绝 |
| TM04转会进度与租借 | 最新待审核稿和R1租借/状态图 | 双方同版确认→主办审核→交接结果；整季后续能力 |
| TM07自由签约 | R1，纳入当前赛事上下文 | 实时核验自由状态、防并发签约；Q02适用边界见待决表 |
| PC01转会中心 | R1 | 本赛事待审核/已审核/全部列表及分页 |
| PC02审核抽屉 | R1 | 只批准双方同意的精确版本；拒绝带原因 |
| PC03转会窗口 | R1 | 当前赛事赛季、起止、版本及配置权 |
| PC04转会记录 | R1 | 最终条款、审核决定、实际交接和审计，只读 |

本轮逻辑范围为12个页面/视图：4个PC和8个小程序。报价详情和还价表单可作为同页状态或弹层，不按截图数机械增加路由。TM05/TM09/TM10及PL01作为后续球队合同/服务号续约，不纳入本轮页面施工。转会详情可显示合同摘要，不跳出当前赛事去建设全局合同页。

球员详情使用用户指定文案“我想租借他”和“我想买断他”；办理协议中买断对应permanent正式转会，不增加线上购买或支付语义。自由球员走直接签约，不出现租借/买断的原队谈判。

## 三 已确认规则

- 未参加任何赛事的球队暂不支持转会；本轮只接当前赛事内办理上下文，不建设跨赛事通道。市场公开可展示资料无需主动挂牌，关闭窗口仍可浏览，写操作由服务端校验。
- 最多三轮；三轮未谈成时，本买方球队24小时内不得再向同一球员申请，不限制其他球队。具体轮次计数和提前终止细则仍待定。
- 转会费是真实人民币，归原球队。平台只记录每轮报价和最终金额，线下自行交付；没有支付、托管、到账或收款确认门禁。估值不等于报价或成交价。
- 双方同意同一版条款后进入主办审核。转会不设置球员同意节点；薪资由球员和新队另谈。审核后按最终条款完成交接，未交接成功不能显示已完成。
- 自由球员没有原队，直接签约；在本轮页面必须关联当前赛事。是否受窗口和独立审核约束见Q02，不以候选代码默认值代替确认。
- 新进和正式转会先按一年线上象征合同记录，球员档案仍归本人，永久ID和编号不变。起算日期和存量补录见Q08。
- 租借最短一场，最长本赛季结束。保留原合同球队，只有一个当前效力球队。只有整赛季租借可在到期前谈续租或转永久；短租不显示这两个入口，谈判不自动延期。
- 转会、租借或签约不自动获得赛事参赛资格；不改已审核名单、历史比赛、阵容、事件、球队历史贡献和球员生涯，不复制球员档案或删除登录账号。
- 续约未来由球队小程序发起、球员服务号回应，拒绝后现合同到期再成为自由身；此处仅保留合同兼容语义，不在本轮新增相关端口页面。

## 四 当前代码事实与续接方式

仓库已有一套转会中心本地候选。先核对工作区差异与文件摘要，在候选上修正和补齐；不要新建第二套transferCenter云函数、第二套合同库或前端统计算法。以下状态取自当前源码和登记文件，本轮未查询云端，不据此宣称已部署。

| 位置 | 已存在内容 | 本轮要求 |
| --- | --- | --- |
| cloudfunctions/dataCenter/transfer/rules.cjs | 金额、状态、条款、轮次、冷却、期限及POLICY/PENDING_RULES | 统一规则位置；逐项审查待决默认值 |
| cloudfunctions/dataCenter/transfer/service.cjs | 查询、谈判、审核、事务交接、签约、合同及到期任务 | 补当前赛事范围、效力投影、版本与幂等闭环 |
| cloudfunctions/dataCenter/transfer/index.cjs | 23个transfer前缀action及子账号动作分组 | 作为现有路由清单，不另外发明同义入口 |
| cloudfunctions/dataCenter/index.js | 转会action分发和集合初始化登记；旧transfer动作保留 | 明确旧写入口的调用者及防绕过，不直接删除兼容接口 |
| cloudfunctions/dataCenter/identity.cjs与staffPolicy.cjs | 身份和赛事权限，目录已有event.transfer | 核对自然人、机构、球队管理及主办权限来源 |
| webLoginApi的relay与staffRelay模块 | dataCenter已列为需会话relay | 仍需贯通event.transfer及赛事范围，不等于已联调 |
| tools/test-transfer-center.cjs | 纯规则和内存数据库桩场景 | 扩展并运行；内存测试不能代替云端事务和真实会话 |
| docs/data-center/CONTRACT.md及INTEGRATION.md | 2026-10-26本地候选登记 | 文档与实现逐项核对，尤其待决默认值和实际投影 |

现有登记写明：未部署云函数、未创建生产集合、未接页面、未迁移旧合同。现场应再核对最新RELEASE与当前代码，不把这份交接里的历史状态当成永久事实。用户和其他会话已有未提交改动，不能reset、整目录覆盖或为续接而自动清理。

## 五 优先补齐的缺口

这些是静态核对中需要Trae验证和处理的事项，不是本轮已修复的代码，也不是完整安全审计结论。

| 优先项 | 当前线索 | 完成标准 |
| --- | --- | --- |
| 当前赛事贯通 | 市场候选读取以keyword/team/position为主，独立查询的赛事/组别契约仍需核对 | 所有入口返回并核验同一tournamentId；无上下文不办理，不悄悄换赛事 |
| 公开读与自然人 | dataCenter共用认证要求会话/机构，relay整体需登录 | 合法公开查询与球队/主办写操作分离；无机构个人也可按授权读，不全局移除鉴权 |
| 跨机构交接 | initiationContext仍明确拒绝跨机构 | 若本赛事包含不同机构球队，先实现双方授权与最小资料交接；未完成明确返回错误，不改字段硬放行 |
| 子账号relay | dataCenter内有event.transfer；staffRelayRights仍按其他赛事模块放行 | 只持event.transfer的子账号也能合法审核本赛事，但不能代球队报价；外层/内层均验证 |
| 队权来源 | identity生成manageTeamIds使用现有机构/创建人等兼容字段 | 复用正式球队权属与成员关系，不能把创建人或同机构直接当成球队长期管理权 |
| 租借当前效力 | 候选写player_loans，不改players.teamId | 球员库、球队人数、名单/资格读取共同采用唯一有效效力投影；不是只有转会页看起来换队 |
| 报价与审核版本 | 写报价用expectedVersion；审核expectedOfferVersion有可省略分支 | 当前版本必须显式传入并由服务端强制核验，接受、还价、审核同版；并发交接只一次 |
| 生效时刻 | review候选在事务内交接；代码同时有pending_effect/scheduled | 明确立即交接与约定未来生效的关系，不能审核今天就提前结束未来仍有效的所属；与Q08核对 |
| 条款变更口径 | 候选normalize/校验会锁定type及loanKind，正式条款归一不接收前端示例生效日期 | 与方案“完整条款变化后重确认”核对；不在前端显示已保存而后端丢字段，不静默改变正式/租借类型 |
| 待决策略 | POLICY内已有同赛事、自由签约窗口/无需审核等保守默认值 | 默认值不等于用户规则；按待决范围显式拦截或限制为本轮范围，不写为永久政策 |
| 榜单与成交 | 页面位置已登记，算法/比较窗口/公开投影未完整确认 | 接统一统计/估值，未定返回状态；不伪造排名、涨幅或把完整金额交给前端遮挡 |
| 查询规模 | 候选存在全表读取后投影/分页的路径 | 改为受控范围、索引和稳定游标；预算超限明确报错，不静默截断 |

只依靠内存测试不能证明CloudBase事务范围读、并发条件或跨集合冲突锁定成立。特别核查事务外预读和事务内复查的同一版本/归属条件，以及失败回滚和可恢复任务。

## 六 权限矩阵

| 操作 | 主体 | 必须由服务端核验 |
| --- | --- | --- |
| 市场/查询/公开球员资料 | 获准公开浏览者 | 精确公开投影、青少年可见限制、当前赛事上下文；浏览不授权报价 |
| 发起、还价、接受、拒绝、撤回、自由签约 | 当前操作球队管理者 | 自然人身份、team.manage/真实权属、当前参赛关系、窗口、对象状态和版本 |
| 原队接收报价 | 原球队获授权管理者 | request.fromTeamId与可管理球队一致，不按姓名、手机号常量或页面角色决定 |
| 窗口配置/审核/记录 | 当前赛事机构负责人或明确event.transfer授权 | 当前赛事、机构及有效授权；赛事子账号仅审核类动作 |
| 到期维护 | 受控平台任务身份 | 不由客户端直接调用，时间、版本、幂等、审计和补偿 |
| 全局合同/服务号续约 | 后续端口 | 本轮不新增入口；旧接口兼容不得扩大本轮权限 |

公开读若需要新增HTTP适配，只能经过webLoginApi的严格只读action白名单并返回最小字段；不能开放通用dbQuery或去掉整个dataCenter的认证。具体命名由Trae核对现有入口后登记，以下API表没有把它冒充现成接口。

## 七 页面到action映射

所有以下transfer前缀名称均已在本地候选路由中找到；可用性、字段和部署状态仍需联调核验。PC网页通过web-admin-vue/src/utils/cloud.js零SDK链路；小程序按当前正式认证与relay规范接入，不另写合同或统计逻辑。

| 页面或任务 | 候选action | 关键输入和返回 |
| --- | --- | --- |
| 市场及查询 | transferMarket | keyword、teamId、position、state、分页；补当前tournamentId/组别与游标契约 |
| 球员详情 | transferPlayerDetail | playerId、当前赛事与操作球队；资料、统计、估值状态、合同/租借摘要、操作能力 |
| 收到/发出列表 | transferMyRequests | teamId、direction/状态、分页；返回真实等待方和轮次/金额可见投影 |
| 转会详情与记录 | transferRequestDetail | requestId、当前赛事；当前条款、双方确认、审核和交接、历史报价/事件 |
| 发起意向 | transferInitiate | requestKey、teamId、playerId、tournamentId、type、terms、note |
| 买方后续报价 | transferSubmitOffer | requestId、teamId、expectedVersion、完整terms |
| 卖方还价 | transferCounterOffer | 同一单号、原队ID、expectedVersion、完整terms和note |
| 接受/拒绝 | transferAcceptOffer / transferRejectOffer | requestId、teamId、expectedVersion；接受精确版本，拒绝原因与冷却边界分开 |
| 撤回 | transferWithdraw | 当前版本与操作者；Q04未定分支不能自行定冷却 |
| 自由签约 | transferSignFreeAgent | requestKey、teamId、playerId、当前tournamentId；防并发和幂等 |
| PC窗口 | transferWindowGet / transferWindowSave | tournamentId、seasonKey、openFrom/openTo、expectedVersion；只读者不能配置 |
| PC列表/历史 | transferAdminRequests / transferAdminRecord | tournamentId、状态/游标或requestId；只读当前授权赛事 |
| PC审核 | transferReview | requestId、tournamentId、decision=approve/reject、expectedOfferVersion、reason |
| 受控到期任务 | transferExpireDue | 服务端时间和受控批次/游标；不能由浏览器直接触发 |

transferContracts、transferTeamRenewals、transferPlayerRenewals、transferCreateRenewal、transferRespondRenewal属于后续合同/续约端口；本轮不接相应独立页面。transferConfirmContractTerm仅是现有受限候选工具，不代表用户要求新增平台核定业务环节；是否使用及期限确认方式仍按Q08确认。

## 八 数据合同与状态机

### 核心字段

固定使用稳定playerId/teamId/tournamentId，fromTeamId/toTeamId表示原队和申请队，操作人来自服务端认证；金额以安全整数amountFen存储、界面以人民币元显示。报价是完整terms的不可变版本，不能只更新金额而保留旧的双方确认。

当前候选normalizeTerms已使用type=permanent/loan/loan_permanent/loan_renewal；租借kind=season_full/single_match，expire模式date/match_end。字段最终以核验后的统一契约为准，不能把图中的中文“买断”和“正式转会”保存成两套互斥流程。

| 数据实体 | 关键作用 | 约束 |
| --- | --- | --- |
| transfer_windows | 当前赛事赛季与窗口版本 | 每赛事一窗口是候选实现，不是多窗口长期规则已确认 |
| transfer_requests | 当前状态、轮次、等待方、最终同意版本、审核与交接 | 同球员并发交接要序列化；不同球队冷却不互相污染 |
| transfer_offers | 不可变版本、报价方、完整terms及留言 | 一份接受只对应同一版本 |
| transfer_events | 状态流与审计 | 确定性编号/序列，重试不重复留事件 |
| transfer_cooldowns | teamId+playerId的解除时间 | 服务端计算24小时；客户端倒计时仅展示 |
| player_contracts | 一年合同及期限确认状态 | 不从建档时间倒推旧合同，不无证据自动到期 |
| player_loans | 原合同队、借入队、赛季/比赛、起止和实际状态 | 一名球员一个当前有效效力关系；到期不重写历史 |
| transfer_free_signings | 自由签约请求与幂等结果 | 原子重查自由状态，先成功者胜出，重复同请求返回原结果 |
| player_team_memberships及player_team_history | 有效期关系和只增流转 | 与当前所属、合同/租借和双方人数投影一致 |

旧player_transfers与新transfer_requests不是同一个集合；先审计旧入口调用者及迁移/兼容策略，不做无授权全库重建。后续contract_renewals保留兼容，不作为本轮新增页面数据域。

新业务集合采用服务端私有读写权限，客户端不能直接写转会、报价、合同或审计表；公开内容通过授权投影接口返回。建议索引覆盖tournamentId/status/updateTime、fromTeamId或toTeamId/status/updateTime、playerId/status、到期状态/时间等稳定组合，具体CloudBase索引先列计划并核对实际查询，不在此任务自动创建生产索引。

本模块产生的合同/租借需能追溯当前赛事、来源请求及模块版本。到期任务只处理有明确来源、期限已核定且属于本模块的记录，不借本次赛事功能扫全平台旧合同或无证据解除其他球队关系。原机构课程、财务、学员合同与私有附件不随转会打包转交；变更当前所属不能粗暴覆盖个人档案或历史经营归属。

### 状态转换

发起意向→negotiating。轮到本队时才能提交/回应当前版本。对方修改金额、方式、期限或场次后，之前的接受失效。双方对同一完整条款一致→pending_review。

主办拒绝→rejected并保留原因，不改球队关系，也不自动按三轮破裂加冷却。主办通过后按已确认生效策略执行交接；若未来生效则保留pending_effect/scheduled，受控任务到期后再完成。实际交接成功→completed；失败不能先把状态写成成功。

三轮未达成→broken并写本买方+本球员24小时冷却。提前拒绝、撤回或超时属于Q04分支，不按图里一个“拒绝”按钮就自动套上24小时。

整季有效租借的续租/转永久必须关联sourceLoanId并核对原合同队和当前借入队；短租拒绝此操作。转永久成功后结束原合同与原租借、建立新队一年合同。租借到期按明确规则返回或进入待核对；原合同也到期、比赛取消/延期/赛果撤销等组合分支见Q06。

### 前端响应契约建议

在现有返回上统一提供schemaVersion、当前tournamentId、dataVersion、serverNow、nextCursor/hasMore、coverage及issues；这些是待实现适配建议，不冒充现有字段。业务对象至少返回status/statusText、currentOfferVersion、currentRound/maxRounds、turn、cooldownUntil、windowState，以及服务端判定的canInitiate/canAccept/canCounter/canReview/canSignFree/canConvert/canRenewLoan和禁用原因。

公开成交投影建议返回feeDisplay和visibility状态，不能返回完整amountFen再让前端用星号覆盖。无权时不返回完整金额；排名口径未定、数据不完整和真实0分开。公开卡不应默认公开手机号、证件、保险、人脸、私有合同原文或内部留言。

## 九 未决事项与本轮处理

| 编号 | 未决内容 | 本轮边界 |
| --- | --- | --- |
| Q01 | 两队同赛事要求、跨赛事审批归属 | 本轮不建设跨赛事通道；当前赛事上下文核验，不写成长期全平台政策 |
| Q02 | 自由签约的窗口和独立审核 | 页面保留直接签约路径，服务端对未定生效条件明确反馈，不用POLICY默认冒充确认 |
| Q03 | 赛季定义、多窗口、关闭后待谈/待审 | 用明确配置的赛季和窗口；不自动延期、重开或放行过期写单 |
| Q04 | 轮次计数、早拒/撤回/超时冷却 | 三轮上限和24小时已定；触发细节集中规则层，不能两端各算 |
| Q05 | 整季认定、续租目标赛季和重审 | 保留整季类型及sourceLoanId；不以“到赛季末”自动认定整季 |
| Q06 | 单场取消/延期/撤销、原合同同时到期 | 明确待核对/人工处理原因，不能静默结束或永久延长 |
| Q07 | 续约提醒、未回复、期限与代管 | 独立续约页面已移出本轮；不作为当前转会中心全量开发前置 |
| Q08 | 新合同生效日和存量合同补录 | 一年已定；不从创建时间补日期，不执行旧数据迁移；生效策略需确认 |
| Q09 | 零元、成交金额角色可见范围与精确遮挡 | 已登记部分遮挡展示需求；位数和授权策略待细化，服务端裁剪 |
| M01 | 实力指标、排序、上升比较窗口/年龄组及缺失策略 | 模块位置保留；统一数据中心口径确认前返回待核定状态，不造分/榜 |

未决只阻塞对应政策或正式生效分支，不能把全部公开查询、PC结构、权限、审计或已确认流程都停下。完成实现时逐项说明哪些可运行、哪些明确返回待决状态；不能将“全都PENDING”当作功能验收通过。

## 十 Trae实施顺序

1. 保留当前工作区，读取AGENTS第三/四/五章与本文件、V1.1方案、最新图稿交接、数据中心README/CONTRACT/INTEGRATION/RELEASE。记录相关源码差异和摘要，不切换全局CloudBase登录，不读凭据文件。
2. 列出候选action与页面需求差异，先完成当前赛事作用域、公开读取投影、真实球队管理权、event.transfer在relay和内层的贯通。不要先画一套空后台再各端自行拼数据。
3. 在现有dataCenter/transfer统一完成报价不可变版本、幂等、当前等待方、审核版本、实际交接、租借有效期投影和受控到期；同期接PC01—PC04，页面只消费服务端能力和状态。
4. 提供当前赛事小程序所需市场、独立查询、详情、发起、收件、进度及签约接口。榜单/上升与公开成交投影依统一数据中心；未定字段保留明确状态，不写新评分算法。
5. 使用隔离测试球队/球员/赛事运行读写链路与故障分支。测试来源同时在比赛、球队、球员层排除正式统计、积分和真实榜单。不得把示意数据或图稿数字导入生产。
6. 完成代码/构建/治理和适当隔离验收后更新数据合同、入口登记及实际状态。Git推送、云函数部署、数据库初始化/迁移、PC发布、小程序上传分别记录。未获本任务明确授权，不做生产变更。

PC主办后台源码是web-admin-vue，不是platform-admin-vue；后者为平台运营后台，本轮不改。主办PC按PREVIEW_RELEASE_WORKFLOW先preview到/preview/admin/，负责人验收后才可按另行明确授权正式发布。preview可能共用正式后端，不能因此写真实数据或擅自发布后端。正式发布后还需同步对应测试端，逐端记录构建、HTTP和资源摘要。

## 十一 验收与返回材料

| 场景 | 必须证明的结果 |
| --- | --- |
| 当前赛事/跨赛事链接 | 请求与对象均为当前授权赛事；错ID明确拒绝，不静默切换 |
| 公开市场与无机构账号 | 可见资料按公开范围返回；不能读内部报价/证件等；写操作仍鉴权 |
| 两队及子账号 | 本队可报价；对方只能处理关联意向；仅event.transfer可审核，不可代球队写单 |
| 三轮与冷却 | 统一计数；仅目标买方+球员受限；早拒/撤回按明确规则或待决返回 |
| 版本与并发 | 两人同时接受/还价/审核、旧版本、重复点击和超时重试均不会多交接、多合同或失去记录 |
| 租借 | 单场绑定具体matchId；整季才有后续；效力投影、人数和历史归属一致 |
| 自由签约 | 两队并发只一方成功；相同requestKey重试回同结果，不复制身份 |
| 到期与故障 | 任务重复/中断可恢复；取消/延期等不猜到期；失败不写completed |
| 金额与榜单 | 公开响应不含无权金额；估值/报价/成交分开；缺失不作0，不产生未确认排名 |
| PC页面 | 当前赛事菜单、完整 loading/empty/error/conflict/disabled，筛选与数量一致，审核不含付款/球员同意节点 |

建议本地检查命令：

```text
node --check cloudfunctions/dataCenter/transfer/index.cjs
node --check cloudfunctions/dataCenter/transfer/rules.cjs
node --check cloudfunctions/dataCenter/transfer/service.cjs
node --check cloudfunctions/dataCenter/index.js
node tools/test-transfer-center.cjs
node tools/sync-data-center.mjs --check
node tools/test-data-center.mjs
node tools/check-data-governance.mjs
```

PC有改动时在web-admin-vue运行npm run build，检查零SDK及/admin/或/preview/admin/资源路径。若改webLoginApi，授权发布前必须对实际上传目录运行tools/check-referee-backend-package.cjs，保留已上线裁判表入口和云端运行配置；不能用旧包覆盖。

本轮只交付设计、源码静态核对和文档；没有执行上述转会业务测试，没有部署或创建集合。Trae返回：变更文件/提交、action与数据契约、隔离链路及反例、测试输出、未决项、实际发布/迁移状态和回读证据。未完成项明确列出，不用“接口都写了”替代闭环。

## 十二 文件索引与可转交指令

正式仓库：E:/Documents/sxf-football。主规范docs/TRANSFER_CENTER_PLAN_2026-10-26.md；最新手机图稿需求docs/DISCOVERY_TRANSFER_IMAGE_HANDOFF_20261026.md；本次完整图稿ZIP仍保留原路径outputs/发现全链路原型20261025/图稿20261026/发现转会双端最新图稿.zip。

原型目录：产品设计/转会中心原型图。PC与完整状态在R1；关键融合页在融合评估R2/融合样稿；统一查看融合评估R2/赛事转会预览.html。交接Word位于产品设计/赛事转会中心Trae研发交接.docx。本地预览URL只供查看，不能当生产接口。

可直接交给Trae：

“请按docs/handoffs/TRANSFER_CENTER_TRAE_HANDOFF_2026-10-26.md续接赛小蜂足球的当前赛事转会中心，范围包含共享后台和主办PC，给对应小程序提供接口。先核对并保留现有未提交修改，复用cloudfunctions/dataCenter/transfer候选，补齐权限、版本、事务交接、租借效力和到期闭环。页面以最新九张手机图稿、融合R2关键页和R1四个PC视图为依据。只做本地赛事入口内的当前赛事，不扩发现首页、平台后台或全局合同/服务号。先完成已确认分支及隔离验收，未决政策明确标识，不自行定规则。没有明确授权不要部署生产或迁移真实数据。最终返回代码差异、验收证据及实际状态。”

## 十三 2026-10-26 追加：入口定在赛事详情，小程序首批两页已落地（本地候选）

用户明确：“球队管理！直接转会中心吧！在赛事详情里开转会中心就行了！”因此不再新建“本地赛事”二级页，链路固定为球队管理 → 具体赛事（赛事详情）→ 转会中心。赛事详情页 `miniprogram/pages/tournament/detail/detail` 的球队视角动作区新增“转会中心”入口（图标 `miniprogram/images/icons/transfer.svg`，manifest 语义 `transfer`），跳转时只带本赛事 `tournamentId`、本队 `teamId`、赛事名与组别，切换赛事必须重新读取，不沿用上一赛事缓存。

本轮已落地的小程序页面（本地源码，未上传体验版、未部署云函数）：

| 页面 | 路径 | 数据来源 | 已实现 | 未实现 |
| --- | --- | --- | --- | --- |
| TM01 转会市场 | `miniprogram/pages/tournament/transfer/market/` | `dataCenter.transferMarket`、`dataCenter.transferWindowGet` | 赛事与窗口状态、关键词搜索、全部/在队/自由球员筛选、分页、球员卡（资料、自由球员徽标、租借中、合同冲突提示、身价状态）、空/错误/加载态 | “我的转会”入口、球队与位置筛选、已完成转会公开投影 |
| TM02 球员资料 | `miniprogram/pages/tournament/transfer/player/` | `dataCenter.transferPlayerDetail` | 公开资料、当前球队与效力状态、合同状态与期限提示、身价（青少年不公开／待评估）、进行中谈判与冷却提示、说明文案 | 发起意向（TM06）、自由签约（TM07）、报价与还价（TM03）、进度（TM04）、收件箱（TM08） |

页面调用方式：小程序直接调用 `dataCenter` 云函数，使用既有 OPENID 认证（`dataCenter/identity.cjs`），统一走 `transfer` 前缀 action，不新增第二套转会服务、不在页面重算合同或身价。展示口径抽到页面同目录 `market-model.js` / `player-model.js`，与发现页身价共用“青少年不公开、未测算待评估、不用 0 冒充”的规则。

本轮验证：`node --check`（四个新页面 js、两个模型、detail.js）、`node tools/test-mini-transfer-center-pages.cjs`、回归 `tools/test-transfer-center.cjs`、`tools/test-data-center.mjs`、`tools/test-mini-event-valuations.cjs`、`tools/test-mini-account-participation.cjs`、`sync-data-center --check`、`check-data-governance.mjs` 全部通过。本轮未部署云函数、未上传小程序包、未推送 Git；部署后需按真实返回核对窗口状态、分页与权限错误文案。

### 十四 2026-10-26 追加：集合与部署状态只读核对（未做任何云端写入）

用 `sxf-cloud.ps1 football run db nosql execute`（Mongo `listCollections` / `count`）只读核对生产环境 `cloud1-7g8ckb3c7815a011`：

- 12 个转会相关集合**均已存在**，不需要新建：`transfer_windows`、`transfer_requests`、`transfer_offers`、`transfer_events`、`transfer_cooldowns`、`player_contracts`、`player_loans`、`contract_renewals`、`transfer_free_signings`（以上当前均为 0 条）、`player_team_memberships`（4 条）、`player_team_history`（4 条）、`player_valuations`（1 条）。因此此前“未建生产集合”的口径已过期，CONTRACT 与方案已同步更正。
- 真正的阻塞不是集合，而是部署：`dataCenter` 线上原为 2026-10-25 15:17:36 的包，`tcb fn code download dataCenter` 回下载包内无 `transfer/` 目录，说明 `transfer*` action 尚未在线。
- 索引：集合目前为空或极小，本轮未创建生产索引；上线并产生真实单据后，按 `tournamentId/status/updateTime`、`fromTeamId|toTeamId/status/updateTime`、`playerId/status` 与实际查询核对后再列索引计划（不在本轮自动建）。
- 权限：转会、报价、合同与审计集合应保持“仅服务端可读写”，客户端只走云函数投影；本轮未改任何集合权限。

### 十五 2026-10-26 追加：`dataCenter` 差量部署已上线（用户“执行吧”授权）

- 发布包 = 线上回下载基线整包 + 8 个文件（新增 `transfer/index.cjs`、`transfer/rules.cjs`、`transfer/service.cjs`、`shared/roster.cjs`、`shared/valuation-view.cjs`；修改 `index.js`、`identity.cjs`、`staffPolicy.cjs` 的 `event.transfer`）。本地其他任务未提交改动（`durationVerification.cjs`、`shared/membership.cjs`、`shared/statistics.mjs`、`shared/write-policy.cjs`、`shared/tournament-boards.*`）**未上传**。
- 发布前 `node --check` 8 文件通过，`test-transfer-center`／`test-mini-transfer-center-pages` PASS；`fn code update --deployMode cos` 返回 `Code updated`。
- 读回：回下载与发布包逐文件 SHA-256 一致（缺失 0／差异 0）；`fn detail` 显示 `Active`、`Nodejs18.15`、512MB、150s、`InstallDependency=TRUE`、`ModTime=2026-10-26 22:48:45`；`transferWindowGet` 无身份探针返回 `AUTH_REQUIRED`，路由可达。
- 未做：未建索引、未写业务数据、未配置真实转会窗口、未上传小程序包、未推 Git。小程序需另行上传开发／体验版并真机验收。详见 `docs/releases/transfer-center-backend-20261026.md`。

### 十六 2026-10-27 追加：主办方 PC 转会中心 PC01—PC04 本地落地（未提交、未部署）

用户要求“先补主办方PC”。按方案 V1.1 第 5.1—5.4 在正式仓库 `web-admin-vue` 落地四个视图，不新增后端、不改已上线契约：

| 视图 | 实现位置 | 已实现 | 未实现 |
| --- | --- | --- | --- |
| PC01 转会中心 | `src/views/tournament/TournamentTransferCenter.vue` 主体 | 赛事抬头与窗口四态（未配置／未开始／开放中／已关闭）、待审核／已审核／全部标签与计数、球员编号精确／球队／方式／提交日期区间筛选、服务端分页、自由签约“无转会费”、集合未建立提示、空态／错误重试 | 已完成转会公开投影、导出 |
| PC02 审核抽屉 | 同文件 `el-drawer`（720px） | 状态条、球员与双方球队、最终条款、双方确认版本、参考身价与签约规则、审核决定（确认转会／拒绝带 2—200 字理由）、生效与交接、报价历史、操作日志；版本不一致或缺共同确认版本时禁用并说明原因 | 主办方代球队改条款 |
| PC03 窗口配置 | 同文件 `el-dialog` | 赛季标识、开始／结束（本地日期→ISO 瞬时）、当前状态与版本、服务端 `notes`；保存带 `expectedVersion`，`TRANSFER_WINDOW_STALE` 重读 | 赛季主数据选择（Q03）、自动到期任务 |
| PC04 只读记录 | 复用 PC02 抽屉，`canReview=false` | 已处理单据的最终条款、审核决定、实际交接与审计只读；自由签约记录同样只读且不进入审核 | 机构合同库 |

- **接线**：路由 `/tournaments/:id/transfer`（`TournamentTransferCenter`，`embeddedPageHeader`）、`LayoutView` 赛事侧栏“转会中心”、`src/utils/tournamentStaffRights.js` 新增 `event.transfer`（`suffix: '/transfer'`）；展示投影与请求组装集中在 `src/utils/transferCenterView.js`。
- **接口**：零 SDK，`callFunction('dataCenter', { action })` 经 `webLoginApi` relay，只用已上线 `transferWindowGet／transferWindowSave／transferAdminRequests／transferAdminRecord／transferReview`；球队筛选走既有 `dbQuery` 只读名称选项，自带精确匹配，不做姓名模糊或新增后端。
- **金额与状态口径**：金额按服务端分存储换算显示（`amountFen / 100`）；自由签约显示“无转会费／不涉及金额交付”，不出现 `¥ 0.00`；参考身价四态，不用 0 冒充；等待方文案与状态文案相同时不重复渲染。
- **验证**：`node tools/test-admin-transfer-center.cjs`（投影＋静态接线＋零 SDK）、回归 `test-transfer-center`、`test-mini-transfer-center-pages`、`check-data-governance.mjs` 通过；`npm run build` 通过且 dist 无 `@cloudbase/js-sdk`、资源为 `/admin/` 前缀；本地 `vite preview` ＋ Playwright 网络桩视觉验收（1440／1280／1024 三档无横向溢出，列表／抽屉／审批入参 `expectedOfferVersion`／窗口保存入参 `expectedVersion`／已审核标签无 `¥ 0.00`）通过，验收脚本与截图在已忽略的 `work/`，不提交。
- **未做**：未 Git 提交／推送，未合并 `preview`、未部署 `/preview/admin/` 或正式 `/admin/`（个人功能分支禁止直接部署，见 `docs/PREVIEW_RELEASE_WORKFLOW.md`），未上传小程序、未建索引、未写真实数据；`transfer_windows` 仍为 0 条，需主办方在本页保存一次窗口。


