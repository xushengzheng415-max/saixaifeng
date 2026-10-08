# PC 切页缓存修复与测试版同步

日期：2026-10-07

- 同步基线：main `2c41f2ef` 已包含在 preview `ac66e3d7` 中；正式仓库工作分支合入该 preview 后，仅增加本次缓存修正与回归。
- 修正提交：`619299e`；源码集成提交：`848e96d3`，已推送功能分支与 preview。
- 原因：路由守卫每次导航读取 tournamentStaffAccess.scope，原缓存策略误将该操作归类为写入，前后均清空球员/球队缓存。
- 修复：scope、mine、invitations、managed 作为只读请求，不缓存其授权结果；实际业务请求仍经过原服务端权限验证。invite、accept、activate、activateOrganizerWorkspace、update、disable 保留缓存失效行为。
- 检查：`node --experimental-vm-modules tools/test-player-session-cache.mjs` 24 项通过，新增真实 cloud 调用回归覆盖读取保留缓存与授权变更失效；`git diff --check` 通过。
- 构建：正式仓库执行 VITE_APP_BASE=/preview/admin/ 的 PC 构建成功，完整上传 268 个文件。
- 公网回读：index.html、cloud-CuRvtp4P.js、PlayerDetail-DOD85x3L.js、TeamDetail-C0Kf3Arr.js、index-CW6FSty5.js 均 HTTP 200，SHA-256 与本地构建一致。cloud 分包包含本次四项只读分类。
- 入口 SHA-256：54FD42E0EAAE49BF8ABA8379019364872CC80A1CBB2148FA650CD46C3EF590E4。
- cloud 分包 SHA-256：DD109A91CB84A5F0784612A3CDF2846DDC04E64E5D0A37A34AC19C0BB03F3562。
- 正式 /admin/ 在发布前后入口内容一致且 HTTP 200；本次没有正式站发布、云函数部署、生产数据变更或小程序上传。
- 真实账号加载时长与页面交互待用户在测试版确认；静态资源回读和隔离回归不代替此项。
