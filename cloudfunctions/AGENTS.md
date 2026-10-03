# 数据板块研发规则

球员注册与赛事身份核验按 `docs/PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md` 实施。云函数必须从已授权赛事/组别读取证件策略，不能把身份核验默认强制到球队邀请或所有比赛。

修改身份、球队关系、赛事名单、比赛事件、榜单、统计、导入或导出前，必须读取 `docs/data-center/README.md`、`CONTRACT.md` 与 `INTEGRATION.md`，路径相对仓库根目录。

所有新增或修改的竞技统计依该基准实现。统一源码是 dataCenter/shared，禁止另建页面或云函数统计公式；部署副本只能由 tools/sync-data-center.mjs 更新。固定读取上限、读取错误转成空数组、名称自动合并身份、根据当前球队改写历史归属均不允许。

交付须更新入口登记，并执行 sync-data-center --check、test-data-center、check-data-governance。规范或旧实现冲突时服从当前用户指令和 PRODUCT_RULES，不把未采集值伪装成零。生产迁移、上线和验收分别记录实际状态。
