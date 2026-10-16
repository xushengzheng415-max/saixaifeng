# 球员积分明细与自愿申诉（2026-10-16）

## 当前规则

用户确认：球员在职业生涯或球员卡下查看逐场积分依据；有异议才申诉，后台处理并回复。不要求运营预先处理全员数据。按已记录且可关联的事实累计，缺依据项目不领取积分；原始统计仍保留null/partial，不写回假0。系统失败、无权限、身份未验证及测试身份不能伪装为已计0分。

出场、首发、有效分钟、进球、应援沿用已配置参数。替补未上场无出场/分钟分，确认换上按原规则计分。分钟跨场累计承接；进球加分保留基础分比例上限。某场换人/罚下依据不完整时该场分钟分0，其他已确认项目继续计入。补录原始依据后重算；保留受保护V4/V5已获卡级和已发布floor，100分权益只看实际积分。

## 实现

- 统一源码dataCenter/shared/statistics、playing-time、player-card-snapshot、score-rule-store；新增points-ledger、points-appeals，同步脚本生成部署副本。accountingPolicy=evidence-points/1进入积分dataVersion及snapshotRevision，防止旧缓存复用。
- playerContributions仅用于服务器构造账单；普通query返回前移除。playerPointsLedgerForAuthorizedPlayer调用者须先授权。player-points-ledger/1按比赛返回日期、双方、赛事、首发/替补状态、出场分、首发分、有效分钟分、进球分、未计原因和当前参数，应援另列。逐场合计加应援必须等于当前总分，否则报对账错误。
- H5 getMyPlayerPointsLedger/submitMyPlayerPointsAppeal/listMyPlayerPointsAppeals沿用微信/登记会话及本人、孩子绑定；拒绝空微信身份，无前端机构授权。
- 小程序teamPlayerPointsLedger/Appeal/Appeals先校验工作空间与球队，再要求linkedUserId/playerUserId/guardianUserId指向当前自然人。普通team.manage不授予私人账单或申诉；canViewPointsLedger只控制入口，服务端仍再次鉴权。
- 申诉保存在platform_settings，recordType=player_points_appeal，记录稳定球员、比赛、项目、说明、期望记录、查看/提交明细版本。请求幂等、同人/同场/同项目待处理项去重；私有列表分页。遗漏比赛允许文字说明，不凭任意matchId读取比赛。本人/监护人只能提交和查看，不能改积分或处理状态。
- 平台数据中心默认“积分申诉”，不自动扫描全员。pointsAppealList/Ledger/Resolve仅平台负责人；可查明细、补依据、回复。版本CAS阻止重复处理；选择“依据已补录”须服务器重读并确认账单版本已变化。补录仍遵守裁判锁和原始事实守卫，未绕过已锁定赛果复核。
- 本次没有写真实球员、赛事或事件，没有制造生产申诉、批量迁移或代发卡。

## 验证

- finish-data-change：共享副本一致、数据中心权限/来源/分页、13组球员卡回归、治理检查通过。
- 积分账单：一场60分钟、另一场换人分钟缺失时只不计后一场分钟分；其他证实项目保留。补为30分钟后总有效分钟90，总分8变9。单人/批量、总分对账、替补未上场、进球上限、金卡保级和实际积分权益通过。
- 申诉：真实H5认证处理器的本人/孩子绑定、跨人/跨比赛拒绝、匿名拒绝、幂等、待处理去重、负责人权限、CAS、补依据后重算、私密标识不回传和读取失败不归零通过。
- 浏览器隔离样本：390px账单→本场申诉→平台只显示已提交申诉→回复→球员读取回复；没有生产业务写入。小程序源码验证作用域、字段白名单、本人/监护与普通球队管理者权限隔离、WXML简单表达式。
- 独立平台构建、实际包语法/依赖、裁判表防回退检查通过。最终web包保留同期裁判进球纠正代码与paperGoalReconcile；从该最新包只补统计缓存版本，回下载比对无关代码字节不变。其他四包回读保留既有运行文件（npm生成锁元数据除外）。

## 发布边界

| 目标 | 实际状态 |
|---|---|
| 平台运营后台 | 正式20261016093602-2943369e，27文件HTTP成功、SHA-256一致 |
| 共享计分与申诉 | 五函数Active/Available；函数SHA见下表，回下载统一模块一致 |
| 球员H5 | /preview/dynamic-card/h5/player-cards.html，四文件200/SHA一致，真实浏览器200、脚本已加载、无页面错误；正式H5待验收授权 |
| 小程序入口 | 源码已接入、隔离测试通过；未上传微信开发/体验/正式包，未将源码测试当作上线 |
| 主办方PC | 没有部署前端包；已有授权接口消费同一积分规则 |

证据目录：work/player-points-ledger-20261016/，含baselines、manifest、final-functions、verified-packages、platform-verification、h5-preview-readback。截图work/player-points-{mobile,reply}.png、work/points-appeal-admin.png。匿名线上getMyPlayerPointsLedger返回PLAYER_CARD_AUTH_REQUIRED。

源码提交：a13fa873、2943369e、7b6f60a。按项目AGENTS，H5先验收再正式；微信开发者平台上传仍需独立授权。此前自动审批拒绝的外部目的地上传授权，没有从本次“继续”推定获得。

## 最终函数摘要

| 函数 | CodeSha256 |
|---|---|
| webLoginApi | `3d780363749efd46f000fcdd0949250441185e6d29eb7a85fbe1450f59c1faf3` |
| dataCenter | `3b966206873f984d64fbb3d02879c53c737ef8a2b92fb7628088200f5c9c36a8` |
| getMiniWorkspace | `b14ef4a1c3984d48e57750d26895c5c7c2ce2a2e149331d96663c08fd306faf6` |
| resultCenter | `e6333b464a1f71969e9ec2bf65cac3130538632c15350c5f7a131887e985cbc7` |
| playerCardPublishWorker | `c4e6c4ad11c954164a23648719e8fdea23b57c25537e7c6de426e5074eb983c4` |
