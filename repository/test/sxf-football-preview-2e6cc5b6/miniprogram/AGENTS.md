# 数据板块小程序规则

球员注册、制卡、赛事证件要求与现场核验遵循 `docs/PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md`。球队注册不得强制身份证；证件、保险和电子证流程必须由当前赛事/组别显式配置。

修改数据功能前，读取仓库根目录下 `docs/data-center/README.md`、CONTRACT.md 与 INTEGRATION.md。统计通过 getMiniWorkspace.dataCenter 或已登记的统一模块完成；工作空间和业务权限必须由服务端校验。

不在页面计算竞技统计，不把 null、失败、未采集和无权限转成 0，不使用现有球队归属改写历史。新增或修改入口同步登记，执行数据中心业务检查。保持球队库、赛事名单、单场阵容三个不同层级。
