# 已定版比赛规则调整：换人与替补席人数

> 同日后续用户补充只填球员人数，并修复共享账号保存范围误判；当前生效范围和测试发布以[球员人数与权限修复记录](execution-player-scope-20261104.md)为准。本页三项人数为此前阶段记录。

- 日期：2026-11-04。
- 用户确认新增范围：换人规则、替补席总人数、替补球员人数、球队官员人数；仅用于尚未开赛比赛，其他结构规则仍锁定。
- 实施状态：用户授权“一起发布测试版”后，两项修复已合并发布到 /preview/admin/；共用webLoginApi的受控保存接口已同步。正式PC静态页面未覆盖，未替任何真实组别填写具体人数。

## 界面

顶部“修改换人”和弹窗“换人设置”统一为“调整比赛规则”。同一弹窗含换人方式、人数、窗口、再次上场和3项替补席人数。保留未设置null与明确0的区别；桌面3列、窄屏单列，限制弹窗最大高度并保留可见保存按钮。保存后回显新版本及实际数值。完整草稿修订入口仅在无实际赛程时开放。

## 后端与边界

新增divisionExecutionRules.cjs，旧divisionSubstitutionRules.cjs兼容转发；显式接入updateDivisionExecutionRules及旧updateDivisionSubstitutionRules分发，恢复缺失的保存入口。主办方身份、机构/组别归属、协助模式、竞赛模块授权、事务内expectedRulesVersion和定版状态均校验。

只允许原换人设置与regulationDetails中的benchTotalLimit（0—30）、benchPlayerLimit（0—30）、benchOfficialLimit（0—20）。拒绝结构字段、未知嵌套字段、非法数值和跨赛事修改。沿用既有字段范围，不新定各类人数的配额相加语义。

保存同步当前配置与活动规则快照，追加不可变旧版本历史；单纯调整替补席时不会因换人设置相同而被错误跳过。重复保存无变更不追加版本；活动快照与当前记录不一致时仍做版本更新。旧客户端只发换人设置时不清除替补席人数。

比赛详情对未开赛场次读取当前规则；已开赛/完赛场次优先读取本场快照或开赛时对应历史快照，不套用后改的替补设置。接口不更新matches或已冻结比赛记录。产品规则及ADR已同步用户确认范围。

## 验证

- test-division-execution-rules.cjs：字段白名单、三项人数范围、null/0、非法数组、结构锁定、身份与模块授权、协助模式、跨赛事、并发版本、历史保留、兼容旧客户端与幂等均通过。
- test-bench-limit-resolution.mjs：空值解析及未开赛/已开赛/完赛取规程范围通过。
- test-division-execution-browser.cjs：实际规则页→真实后端模块的隔离事务→保存回显通过；桌面及390px弹窗检查通过。没有向真实后端发送修改请求，测试数据未入云。
- 最终VITE_APP_BASE=/preview/admin/构建通过，2978模块、25.54秒；后续仅调整后端校验并重新通过后端回归，前端构建未再变。
- 预览截图output/division-execution-20261104/dialog-{desktop,mobile}.png，属于隔离样例，不表示真实赛事已改规则。

## 测试发布与读回

- 源码：功能提交0fd66a56；preview集成并保留同期战术板更新后为c4fd7d8cb28b9370a6fa4dfe5973cc156f5dacef，已推送GitHub。一次GitHub临时500及一次并发分支推进均已处理，无强推；未将本功能推入main。
- 基于刚下载的最新webLoginApi包，仅修改index.js与divisionSubstitutionRules.cjs，新增divisionExecutionRules.cjs。共6713文件，部署后回下载全量SHA-256一致，所有原依赖字节保持。
- 显式保持线上InstallDependency=FALSE；Nodejs18.15、512MB、120秒、index.main、环境变量配置、角色、网络与层均未变。2026-11-04 18:22:27函数状态Active/Available。
- index.js SHA-256为924f64542fb68e75d034281f5b3c6acc5fcb252c99f96300bfc932b9f1e8c59e；规则模块为6f57a7f16d29aac2db65775f507d5d7bb65d0774ba8abbf38dae418b22dbba1d。
- 拟上传与回下载的实际包均通过裁判表接口及报名Word上传防回退检查。实际包与回下载模块的权限、历史快照、版本并发、幂等及旧接口兼容回归通过；两个保存接口未登录探针均返回AUTH_REQUIRED。
- 最终preview构建2978模块、23.42秒；409文件上传 /preview/admin/。入口、规则页、比赛详情及共享人数模块共10项URL均HTTP200且SHA-256与本地一致。
- 测试入口摘要1b683c7226d21535c68e734de7198470549f51a8f3b94dafc8608b3c5b66e45d；DivisionRulesWizard-CKks5EGk.js摘要0640533084b6e8ef3f8ba9ac9113db9e25459c29dcc44f40aa39745dd4cfe1dc。
- 正式入口发布前后均31f17f9708a0d2463cea20bb9ace8abd7ecefb386820fd76abf2168714b3ccfc。Windows当前源码0.2.8使用独立测试会话，发布前后正式/测试通道均8/8；不代表真人已修改真实规则。
- 证据在work/division-execution-release-20261104/{manifest,backend-readback,http-readback,auth-probe}.json，客户端报告在output/division-execution-release-20261104/desktop-{before,after}/。

本次只发布测试PC界面，没有发布正式/admin/、H5或小程序。保存接口由正式与测试共用，新接口及旧换人接口兼容逻辑在同一后端生效；用户若在测试页保存真实赛事组别，会实际修改该组别未开赛比赛使用的规则，不是隔离数据库。接口本身不改写matches或历史快照；本任务未执行真实规则写入。正式PC发布仍需后续本任务明确授权。
