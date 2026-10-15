# 制卡工作流

2026-10-15 用户确认：基础及赛事金银铜是升级套系；球队荣誉、个人表现与特殊卡可按名单单独或批量制作发放。已发布样式库展示类型与样式，个人成卡继续动态读取。

## 入口与权限

平台 `PlayerCardStudio.vue` 调用既有 `savePlayerCardTemplate` HTTP action，附加 `workflowAction`。`playerCardTemplates.cjs` 在既有平台负责人会话校验之后分派至 `playerCardWorkflows.cjs`；不新增裸HTTP函数或客户端SDK。操作为 list/create/get/materials/copyLayout/review/publish/candidates/issuePreviews/beginIssue/continueIssue/issues。

集合 `player_card_sets` 保存 recordType=set 的制卡项目、recordType=issue 的发放进度；首次由平台明确创建项目时建立集合。模板、不可变版本、活动指针与球员卡库继续使用已有集合，不迁移旧资料。新项目成员记录 setId/cardKind/issuanceMode；荣誉单卡内部沿用bronze兼容渲染键，该内部键不表示获得铜卡等级，界面只显示单卡。

## 发布与读取

升级套系含bronze/silver/gold三个模板，缺少任一背景或遮罩则拒绝预览；保存和排版同步不激活版本。统一预览返回有期限、绑定操作者及成员修订号的证明；发布事务重新核对三档修订、素材及历史任务，再统一写入版本和活动指针。草稿变动使旧预览失效，部分失败不切换任何档位。全平台套系更新三个基础指针；赛事套系保留独立活动键。荣誉样式不更新基础档位。

新赛事套系和荣誉单卡仅显式确认名单后建立授权，不能仅因同队或同赛事自动领卡。候选按稳定ID和现有官方名单规则读取，测试来源、缺少照片、升级套系等级未核定等情况明确禁选。发放前支持分页动态预览，姓名与照片从服务端读取；客户端不上传自绘成卡。发放按10人一批、逐人事务保存，记录操作者、范围、名单证据与进度，请求编号去重；可继续未完成记录。可选设为展示，保留旧卡、照片、积分和等级。

`playerCardSeriesReader.cjs` 在统一readCards内部按权威等级选择已授权的对应档位，核验原始及目标授权，不能跨卡库授权切换。webLoginApi和getMiniWorkspace同步此轻量模块。H5卡库返回当前套系档位作为展示标识；旧模板和既有100分权益仍有兼容路径。新升级套系按真实等级选档，荣誉授权不代表升级。

## 验证

- `node tools/test-player-card-workflows.cjs`：权限、完整度、过期预览、三档原子切换、名单范围、测试排除、幂等、旧卡保留和升级读取。
- 既有preload/library/entitlement测试保持通过；数据中心sync/check-governance/test-data-center检查。
- `work/test-card-studio-ui.cjs`：隔离内存数据库与拦截全部云请求，真实浏览器批量上传三张背景和共用遮罩、发布整套、发布单卡、动态预览所选球员并发放，样式库只显示两种样式项目。未写生产测试球队、球员或模板。

正式代码发布与运营人员发布模板/发放名单是不同操作；本次代码部署不激活真实新模板，不替代未完成旧批次。

## 分层选人与数据核查（2026-10-15）

平台发放窗口改为左右选择：左侧按赛事→球队→球员展开，另可按当前球队或球员查看；全平台适用样式可勾选全平台根节点，赛事样式仅显示其原授权候选。勾选后加入右侧本次发放，可移回或逐个移除；同一稳定球员ID跨赛事出现时去重，搜索后的整组选择只包含显示的匹配项。

层级目录复用已部署 `dataCenter.catalog` 的 teams/tournaments/players/rosters 投影，发放资格仅来自原工作流 candidates。目录不创建资格，不以姓名合并身份；历史或锁定名单未出现在目录时，其候选保留在未关联分组。当前球队视图不作为历史参赛归属证明。服务端原有预览、beginIssue、continueIssue仍逐次核对范围、来源、等级及修订。

竞技等级待核定的球员不可加入右侧；其“核查”打开已有数据中心球员卡核验页，预选稳定playerId并调用原auditPlayerCardCatalogPlayer。关闭核查后刷新候选，只保留仍合格的已选ID。数据更正继续走原始记录、版本、原因及审计流程，不在制卡页直接改分或手填等级；数据读取失败不能当作无问题或零分。缺少球员档案的名单关联问题单独显示，不按姓名补档。
