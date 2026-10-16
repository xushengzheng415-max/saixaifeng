# 制卡工作流

2026-10-15 用户确认：基础及赛事金银铜是升级套系；球队荣誉、个人表现与特殊卡可按名单单独或批量制作发放。已发布样式库展示类型与样式，个人成卡继续动态读取。

## 入口与权限

平台 `PlayerCardStudio.vue` 调用既有 `savePlayerCardTemplate` HTTP action，附加 `workflowAction`。`playerCardTemplates.cjs` 在既有平台负责人会话校验之后分派至 `playerCardWorkflows.cjs`；不新增裸HTTP函数或客户端SDK。操作为 list/create/get/materials/copyLayout/review/publish/candidates/issuePreviews/beginIssue/continueIssue/issueStatus/retryIssue/issues。

集合 `player_card_sets` 保存 recordType=set 的制卡项目、recordType=issue 的发放进度；首次由平台明确创建项目时建立集合。模板、不可变版本、活动指针与球员卡库继续使用已有集合，不迁移旧资料。新项目成员记录 setId/cardKind/issuanceMode；荣誉单卡内部沿用bronze兼容渲染键，该内部键不表示获得铜卡等级，界面只显示单卡。

## 发布与读取

升级套系含bronze/silver/gold三个模板，缺少任一背景或遮罩则拒绝预览；保存和排版同步不激活版本。统一预览返回有期限、绑定操作者及成员修订号的证明；发布事务重新核对三档修订、素材及历史任务，再统一写入版本和活动指针。草稿变动使旧预览失效，部分失败不切换任何档位。全平台套系更新三个基础指针；赛事套系保留独立活动键。荣誉样式不更新基础档位。

新赛事套系和荣誉单卡仅显式确认名单后建立授权，不能仅因同队或同赛事自动领卡。候选按稳定ID和现有官方名单规则读取，测试来源、缺少照片、升级套系等级未核定等情况明确禁选。发放前默认预览首批24名样卡，即可确认全部所选名单；更多预览为可选操作，不要求完整加载名单或生成全部PNG。姓名与照片从服务端读取；客户端不上传自绘成卡。发放按10人一批、逐人事务保存，记录操作者、范围、名单证据与进度，请求编号去重；可继续未完成记录。可选设为展示，保留旧卡、照片、积分和等级。

`playerCardSeriesReader.cjs` 在统一readCards内部按权威等级选择已授权的对应档位，核验原始及目标授权，不能跨卡库授权切换。webLoginApi和getMiniWorkspace同步此轻量模块。H5卡库返回当前套系档位作为展示标识；旧模板和既有100分权益仍有兼容路径。新升级套系按真实等级选档，荣誉授权不代表升级。

## 验证

- `node tools/test-player-card-workflows.cjs`：权限、完整度、过期预览、三档原子切换、名单范围、测试排除、幂等、旧卡保留和升级读取。
- 既有preload/library/entitlement测试保持通过；数据中心sync/check-governance/test-data-center检查。
- `work/test-card-studio-ui.cjs`：隔离内存数据库与拦截全部云请求，真实浏览器批量上传三张背景和共用遮罩、发布整套、发布单卡、动态预览所选球员并发放，样式库只显示两种样式项目。未写生产测试球队、球员或模板。

正式代码发布与运营人员发布模板/发放名单是不同操作；本次代码部署不激活真实新模板，不替代未完成旧批次。

## 分层选人与数据核查（2026-10-15）

平台发放窗口改为左右选择：左侧按赛事→球队→球员展开，另可按当前球队或球员查看；全平台适用样式可勾选全平台根节点，赛事样式仅显示其原授权候选。勾选后加入右侧本次发放，可移回或逐个移除；同一稳定球员ID跨赛事出现时去重，搜索后的整组选择只包含显示的匹配项。

层级目录复用已部署 `dataCenter.catalog` 的 teams/tournaments/players/rosters 投影，发放资格仅来自原工作流 candidates。目录不创建资格，不以姓名合并身份；历史或锁定名单未出现在目录时，其候选保留在未关联分组。当前球队视图不作为历史参赛归属证明。服务端原有预览、beginIssue、continueIssue仍逐次核对范围、来源、等级及修订。

竞技等级待核定的球员不可加入右侧；其“核查”打开已有数据中心球员卡核验页，预选稳定playerId并按下一节调用只读核查接口。关闭核查后刷新候选，只保留仍合格的已选ID。数据更正继续走原始记录、版本、原因及审计流程，不在制卡页直接改分或手填等级；数据读取失败不能当作无问题或零分。缺少球员档案的名单关联问题单独显示，不按姓名补档。

### 2026-10-16 核查链路纠正

上段 `auditPlayerCardCatalogPlayer` 是原页面引用的未实现操作，已由本节替代。单人核查和扫描现经 `savePlayerCardTemplate` 的 `workflowAction:auditPlayer/auditQueue`，复用平台负责人鉴权以及发放同源的 `data-center/service.cjs`。单人返回规范生涯快照、指标覆盖、历史球队/赛事行和原始问题编号；扫描每页最多100人，前端按游标读完，失败不伪装为零异常。

只读实现位于 `webLoginApi/playerCardAudit.cjs`。不读回手机号、证件或原图，不写球员、等级、赛事或发放记录；未知时长、来源待核、应援异常及测试来源仍按原数据中心规则显示。需要核实时长时复用已有 `dataCenter.inspectDuration/verifyDuration`，不新增比赛修改接口。此前仅验证打开抽屉的模拟错误不足以证明接口可用，现测试穿过真实模板鉴权处理器和实际数据中心模块，并核对审计与发放快照一致。

## 积分规则与旧素材（2026-10-16）

独立平台侧栏“积分规则”使用平台模板鉴权后的scoreRulesRead、scoreRulesSave、scoreRulesPreview、scoreRulesBegin、scoreRulesContinue。编辑参数先保存草稿，规范数据试算绑定15分钟证明与草稿修订；显式确认后分批准备卡级保留记录，最后事务切换规则。可恢复未完成准备任务；数据、草稿或活动规则变化时拒绝旧证明，不部分启用。

规则、发布任务、历史版本、稳定球员ID的卡级保留记录使用platform_settings的独立recordType及ID空间。保留来源是规范旧卡级、上一版保留记录或受写保护且有制卡版本的已获卡级，排除测试来源。权限仍按实际积分100分核定。配置、计算、保留和发布分别在playerCardScoreRules.cjs、shared/score-rules.cjs、shared/score-rule-store.cjs及规范服务中实现；不改球员或比赛事实。

已有制卡项目时，旧版素材默认折叠，避免将旧铜卡入口误认作另一个当前套系。“沿用新建”明确创建项目副本；现有项目通过继续制作或编辑新版维护，旧素材不自动删除或按名称合并。

历史时长核实只把锁定竞赛规程作为建议值，显示来源并由平台负责人确认该场适用后保存durationVerification；不以当前规程自动回写旧比赛，也不替代阵容或事件补全。

## 自动分批发放与基础样式（2026-10-16，用户确认）

确认所选名单后自动循环原10人批次，显示已处理、成功、失败人数。确定的个人业务问题（档案删除、范围变化、测试资料、缺照片、卡级待定、已有撤销记录）按逐人事务记失败并继续；数据库、网络、事务或样式版本异常停止且不推进未知项。失败记录持久保存；issueStatus回读进度，retryIssue只从已完成任务的失败ID建立幂等子任务，重查现有范围与资格，保留原历史结果。关闭浏览器不承诺后台独立运行，恢复从发放记录继续。未改变照片、积分或模板活动版本。

已发布旧基础样式从折叠区移至样式库，分别显示铜银金实际publishedVersion及对应已发布背景；草稿预览不冒充已发布版本。只读回查本次基础铜卡为v3且bronze活动指针存在，银/金为草稿且无活动指针；没有替用户发布银金模板。正式状态见../releases/card-automatic-issue-20261016.md。

## 已发放卡的旧客户端读取（2026-10-16）

无dynamicCardProtocol的现网PC继续走readCards的按需整图兼容。dynamic.exportCard已核验授权/数据/模板版本并解析cardUrl；reader识别有效static-export后直接保留结果，不以不存在的fileId再转换地址，也不拿赛事卡比对基础卡指针。动态场景不进入旧静态指针检查；旧静态记录仍走原路径。此修复不重新发卡、不修改展示选择或球员等级，详见../releases/card-read-compatibility-20261016.md。

后续实际请求核实：现网PC懒加载cloud模块已经发送dynamic/1，不能只凭入口JS判断旧协议。网页viewer另以playerCardRendererVersion=player-card-web/2协商可靠动态绘制；未声明者按需取得完整授权卡图，限制2人并发，不强制下载全员静态图。H5公开赛事详情仅对公开名单内、当前选中本赛事已发布套系且具有明确平台发放授权的球员显示本赛事卡；跨赛事/个人荣誉等不因该规则公开。原始人物持续使用可见像素投影。见../releases/card-browser-h5-display-20261016.md。
