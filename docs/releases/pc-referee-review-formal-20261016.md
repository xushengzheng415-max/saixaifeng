# PC裁判表核对与草稿正式发布

用户已确认测试版并明确要求同步正式版。正式构建源码4b512a06，合并同步后的测试源码4ed09a26；核对弹窗组件摘要一致，保留preview独有功能。正式/admin完整构建与部署已完成，index.html、MatchDetail-B_jQdWK3.js、MatchDetail-Dcdf8WNC.css、TournamentScheduleV2-B9M1y_Hz.js、TournamentScheduleV2-tkIw_5gV.css均HTTP200且SHA256与构建一致。

新增独立进球分钟格和增删、比分实时计数和行/字段提示、已有进球分钟差异显示及二次更正确认、本机IndexedDB草稿保存/恢复。草稿按账号/机构/比赛隔离，恢复重新读取名单，提交仍校验身份、权限、比赛版本和签名；不写登录token，不宣称跨设备同步。不自动保存真实赛果。

共用webLoginApi后端无需本轮重传，已下载核对index.js、paperGoalReconcile.cjs、refereeReportAnalysis.cjs、refereeReportOcr.cjs、paperReportProof.cjs与已发布差量包一致，Active/Available。业务进球更正仅由操作者明确确认触发；没有代替用户提交本场比赛数据。

测试端执行main→preview语义合并并独立构建/部署，保留原有测试内容。最终测试资源读回结果随任务交付报告。没有运行新增测试套件；本轮执行构建、差异检查及线上文件/后端状态核对。