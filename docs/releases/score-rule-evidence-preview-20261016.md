# 积分规则试算依据修复（2026-10-16）

## 原因

用户保存新参数后，试算报“试算未取得完整指标，请先核查球员资料”，活动规则仍V2。正式计分已经按evidence-points/1使用已记录observed依据；规范快照同时保留原始metrics=null/partial和已计分creditedMetrics。配置试算只传old.metrics/coverage，丢失已计分依据，可能将有记录的出场误作0而首发仍为1，触发starts>appearances保护，或静默低估部分积分。

这不要求重新核实全部球员，也不需要删除草稿。用户确认的“有依据才计分、无依据该项不计积分”保持原规则；未知原始事实仍为null，不写成0。

## 修改

仅webLoginApi/playerCardScoreRules.cjs的试算输入：将规范快照creditedMetrics交给统一calculatePlayerCardPoints的observed字段，原始metrics/coverage保留。保留原metricVersion及dataCoverage/supportDrops不完整标记，不把部分应援当作全部完整。没有复制公式或重算真实比赛。真实不一致仍拒绝，并提示重新试算；网络/数据库失败、来源与测试身份、权限、旧证明、草稿修订和卡级保留校验不放松。

旧状态ready且无creditedMetrics的完整指标仍由统一计算器原回退支持。试算仅保存原review证明，活动规则只在用户确认发布、卡级保留准备完成后事务切换。本次代码更新不代用户发布草稿。

## 验证

test-score-rule-evidence-preview.cjs用真实统一计算器构造原始出场/分钟/进球不完整但已记录apps=2、starts=1、minutes=60、goals=1、support=2的规范快照。旧试算输入复现unverified，新试算原7分→64分与同一计算器一致；仍保留原始null，测试身份排除，试算不激活、读取失败/数据变化阻断、显式分批发布与权限均通过，玩家/比赛记录不变。全部隔离数据库，无生产试算或积分写入。

原score-rules回归保留银金卡级、100实际分权益、幂等与来源变化阻断；积分明细、13组统一积分、同步与治理检查通过。实际上传包只替换该模块并运行语法、裁判表防回退及下载包内证据试算测试。

## 正式回读

webLoginApi Active/Available、无CodeError；CodeSha256=b883d9ad55310c83fdd86e632bc8a88081d438aef6e86221afcff91c3eca17d0。回下载模块与源码字节一致，其他ZIP成员CRC与长度一致，仅模块与npm隐藏锁元数据变化。未改函数运行配置，裁判表及此前卡显示修复保留。

生产platform_settings配置在发布前后只读对比完全一致：revision=1、活动仍V2、已有草稿保留、无待发布任务。没有代执行生产试算或确认发布；匿名试算仍AUTH_REQUIRED。真实操作者刷新后重新试算，确认新影响后再发布。

源码e8b453f5，下载包测试修正65313cde（隔离规则试算禁止绘图，以便在Windows加载线上Linux包）。证据work/score-rule-evidence-20261016/{backend-delta,web-final,web-readback-verification}.json。
