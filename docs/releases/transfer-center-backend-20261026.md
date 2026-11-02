# 2026-10-26 赛事转会中心后端（dataCenter）生产部署记录

## 授权与范围

用户 2026-10-26 明确回复“好的，执行吧”，授权按上一轮提议执行 `dataCenter` 差量部署，使小程序转会中心的 `transfer*` action 上线。本轮**只更新 `dataCenter` 代码**，未改其他云函数、未改函数配置（运行环境／内存／超时／环境变量）、未写业务数据、未建集合、未建索引、未上传小程序包、未推送 Git。另一个独立域名端（平台后台／PC）不在本轮范围。

## 部署前核对（只读）

- 生产环境：`cloud1-7g8ckb3c7815a011`。
- 集合：12 个转会相关集合均已存在，无需新建——`transfer_windows`／`transfer_requests`／`transfer_offers`／`transfer_events`／`transfer_cooldowns`／`player_contracts`／`player_loans`／`contract_renewals`／`transfer_free_signings` 均 0 条，`player_team_memberships` 4 条、`player_team_history` 4 条、`player_valuations` 1 条。
- 线上基线：`dataCenter` 原部署时间 2026-10-25 15:17:36；`tcb fn code download dataCenter` 回下载基线包**没有** `transfer/` 目录，说明此前 `transfer*` 未在线。
- 本地与基线逐文件 SHA-256 比对：本地 `cloudfunctions/dataCenter` 相对线上有 4 个无关键（`durationVerification.cjs`、`shared/membership.cjs`、`shared/statistics.mjs`、`shared/write-policy.cjs`）与 4 个新共享文件（`shared/tournament-boards.cjs`、`shared/tournament-boards.mjs`、`shared/roster.cjs`、`shared/valuation-view.cjs`）以及 `transfer/`。其中仅转会所需文件进入本次发布包，**其他任务（处罚、榜单、时长核实、membership/write-policy）的未提交改动一律未上传**，避免替其他任务越权发布。

## 本次变更（8 个文件，以线上包为基线的差量）

新增：

- `shared/roster.cjs`（赛事内名单判定，转会与身价投影共用）
- `shared/valuation-view.cjs`（身价只读投影，青少年不公开／未测算待评估）
- `transfer/rules.cjs`（纯规则：轮次、冷却、窗口、状态机、PENDING 登记）
- `transfer/service.cjs`（事务编排：报价、还价、审核交接、自由签约、续约、到期）
- `transfer/index.cjs`（`transfer*` action 路由与响应信封）

修改：

- `index.js`：新增转会领域路由（在 staff 门禁之前）与 `initializeCollections` 的转会集合登记；其余分支与线上逐行一致（仅这几处差异）。
- `identity.cjs`：赛事子账号权限码新增 `event.transfer`（其余一致）。
- `staffPolicy.cjs`：赛事权限白名单新增 `event.transfer`（其余一致）。

## 发布过程

- 发布包 = 线上回下载基线整包（含 `node_modules`、`package.json`）+ 上述 8 个文件；staging 与基线复核后**只有这 8 个文件**为新增或内容变更。
- 发布前：对 8 个文件逐个 `node --check` 通过；staging `index.js` 确认含 `transferCenter.ACTIONS.includes(event.action)`；`node tools/test-transfer-center.cjs`、`node tools/test-mini-transfer-center-pages.cjs` 均 PASS。
- 命令：`sxf-cloud.ps1 football run fn code update dataCenter --dir <staging> --deployMode cos --json` → `Code updated`。

## 部署后读回

- `tcb fn code download dataCenter <readback>`：与 staging 逐文件 SHA-256 比对，**缺失 0、差异 0**；`transfer/index.cjs`(4023B)、`transfer/rules.cjs`(22339B)、`transfer/service.cjs`(95485B) 均在线。
- `tcb fn detail dataCenter`：`Status=Active`、`CodeResult=success`、`ModTime=2026-10-26 22:48:45`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=150`、`InstallDependency=TRUE`、`CodeSize=11290124`；`CodeInfo` 中已含转会路由与集合登记；环境变量与运行配置未被 `fn code update` 修改。
- 入口探针：`fn invoke dataCenter -d {"action":"transferWindowGet","tournamentId":"probe"}` 返回 `AUTH_REQUIRED`（未带身份），证明新包已加载且 `transfer*` 路由可达，而不是此前的 `DATA_ACTION_INVALID`。

## 未完成／后续

- 小程序仍需上传开发／体验版并真机验收：赛事详情 →「转会中心」→ 市场页窗口状态、搜索与筛选、分页、球员资料页；窗口未配置时应显示「本赛事未配置转会窗口」。
- 本赛事尚未配置真实转会窗口（`transfer_windows` 为 0 条），且目前**没有任何页面调用 `transferWindowSave`**（PC 主办方窗口配置页与小程序窗口页都还没有实现），所以市场页对所有赛事都会显示「未配置／未开始」。要做真机验收，需先补窗口配置页，或由具备 `event.transfer`／`event.manage` 的账号直接调用该 action（首次传 `version=0`）。
- 索引待上线产生真实单据后按实际查询再列计划；本轮未建生产索引。
- 报价／还价／审核／自由签约／我的转会等写入类小程序页面尚未实现。
- 云函数为正式共享后端，本环境没有独立测试后端；小程序未上传，因此本轮无测试端需同步。
