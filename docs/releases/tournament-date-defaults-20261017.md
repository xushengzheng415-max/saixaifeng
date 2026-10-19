# 创建赛事默认时间规则（2026-10-17）

PC 管理后台创建赛事页（`TournamentCreateBasic.vue`，演示模式与真实创建共用）的赛事日期、报名截止日原来为空或写死过去时间（visualQa 分支为 2026-07），用户需手动从过去日期翻找。现改为按当前时间动态生成：报名截止日=今天+3天，参赛日期=截止日+1起连续3天（如今天 10-17 → 截止 10-20，赛期 10-21~10-23）。默认值仅预填，两个日期选择器仍可自由修改。

新增 `web-admin-vue/src/utils/tournamentDateDefaults.js` 共享工具（defaultRegistrationDeadline / defaultCompetitionRange / shiftDateString），创建表单两个初始化分支（isVisualQa / 普通）均改用动态默认值。演示规程范本 `demoRegulations.js` 的 demoRegulationData() 不再返回模板中写死的 2026-07-01~07-10（截止 2026-06-25），改为动态生成，演示模式点“使用范本”不再带入过去日期。上传真实规程识别出的日期仍以规程内容为准，用户可核对修改。

改动共 3 个文件，21 增 2 删。提交 `ee002d5e` 已推 Gitee origin/main。本地构建通过后部署 CloudBase 静态托管正式环境 `/admin/`（cloud1-7g8ckb3c7815a011），376 文件上传成功。线上核验：www.sxffootball.cn/admin/ 返回 200；创建页 chunk 与含本次改动的 demoRegulations chunk 均与本地构建产物逐字节一致（SHA 相同），`basicInfo` 动态时间锚点在线上产物中命中。CDN 如有缓存几分钟内刷新，可用无痕窗口验证。默认时间的实际页面效果需登录后进入创建赛事页确认。

本次未改动：E:/Documents/sxf-football 工作区（platform-ops 分支）的既有未提交改动保持原样；编辑赛事页（TournamentEditBasic）加载已有数据，不适用创建默认值规则；旧版 TournamentCreate.vue 已无路由引用，未改动。
