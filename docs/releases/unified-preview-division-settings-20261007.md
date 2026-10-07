# 统一预览发布与组别设置

## 合并范围

已只读查看另一会话“定位 PC 后台改动需求”的完成记录，并按 origin/preview 祖先核验：competition-table-cleanup、competition-font-size、registration-entry-cleanup、team-claim-code-entry、fix-real-event-demo-scope、fix-teams-read-rights 已全部合入。对方已完成的真实赛事读取和事件级球队权限修复保持；不再从旧功能分支覆盖完整后台。手机端另一个会话仍在进行，未把其未完成改动带入 PC 本次发布。

当前会话此前完成的演示空间、Word 范本、图片选择控件与自选字段、认领示例、旧演示虚拟球队池升级一并保留。认领示例与池补齐 a5a13030 已上传、入口及 TournamentTeams-C2fZZ1Eb.js 回读 HTTP200/哈希一致。

## 组别设置

原行菜单新增“组别设置”，使用现有 competition/create 页面编辑。取消基础/专业模式对比和升级选择；新增青少年模式、成人模式，年龄段（含自定义）、出生日期范围、比赛人数、参赛队伍数量和组别名称可编辑。保存重新置为未定版，仍须走原规则配置。已有名单容量保持，队数低于已报名数、日期反向或非法格式拒绝。

正式已定版/进行中组别保持结构锁定，虚拟演示允许重开草稿；不修改真实账号或业务数据。旧模式字段仅保留读取兼容，不再作为可选产品模式。报名表预设及虚拟球队筛选按参赛类别，不把“成人组/中年组”误当成无匹配虚拟池。

test-division-basics.mjs 覆盖保存回读、容量/日期限制、已有名单容量、类别识别和年龄专属虚拟池。统一从最新 preview 合并后构建并只发布 preview/admin；正式 admin 和正式云函数不在本轮发布。

## 统一发布回读

功能提交 2803ce8，最终构建/合并 4f31ce9e。8 个双方已完成 PC 功能分支均经 Git 祖先检查确认包含在该构建内。280 个静态文件全部成功上传 preview/admin。

| 资源 | HTTP | SHA-256 |
| --- | --- | --- |
| index.html | 200 | F594CF0C95182B52D4920922CA859CD0EC59764E361086E3B7079C4029D77C42 |
| divisionBasics-Dm76DcOT.js | 200 | 32A1ED84E6136C061B2C8B40C9D5EA99693597EC17E6F3DAA42FA44E749A7190 |
| DivisionManagement-Dj6RObUG.js | 200 | BB88BAE3E52B92EB5118D7138D65CCEB9FD5E729E946620DA07749C2B40C9DC5 |
| DivisionRulesWizard-CbxdZwWd.js | 200 | 3EA90EC25EE02D6C4EFBE76FE9826AE90259F5A00BC245DC06C5413153D1D42B |
| TournamentDivisionCreate-DvIBdDBg.js | 200 | F59BB450602C5FE663C6A867E453192A6853F8B334AC7FADE2D3EBB89E4C2262 |
| TournamentTeams-BcUnEmzw.js | 200 | E990DF0C1C9CC2A42BDDA141B1032DEE84B86E297AB52321437272D1126FE86E |

线上资源与构建一致，创建/编辑组别分包包含“组别设置”“青少年模式”“成人模式”。正式后台入口 SHA-256 发布前后保持 604820920BCBF12BF141FADA29AC3E107787F627FFFACFDA1F17C0135ACA80B1。本轮没有更新正式函数；浏览器实际点击尚未逐页验收。
