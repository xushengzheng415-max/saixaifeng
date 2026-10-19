# 分享面板误触登记回复

2026/10/17 00:05:53 邀请海报分享误回复修复已上传开发包1.1.30，服务端最终发布于2026-10-17 00:13:12。用户手机重复确认仅打开分享面板就收到服务号登记入口，不能把SCAN回调等同于本人主动扫码。小程序分享前经beginInvitePosterShare按team.manage、当前空间球队和有效球员邀请校验，查当前自然人已关注的服务号绑定，在同一码gate写入短期posterShareWindows；不绑定或改变账号。面板结束经匹配随机令牌关闭窗口，分享图显式needShowEntrance=false。服务号回调仅对同一码/同一微信/有效分享窗口内CreateTime的SCAN静默，不新建登记扫码证明，不阻止其他微信、subscribe事件或窗口外本人扫码。最大90秒自动过期，结束保留15秒仅供迟到回调按原事件时间核对；时间按微信秒粒度处理。

验证：全入口签名XML隔离测试覆盖分享人静默/不产生登记扫码记录、接收人正常回复、本人窗口外正常回复、subscribe保留、跨队/无权限/无绑定/旧令牌及过期窗口；原生隔离端验证begin→纯图片面板→end顺序、shareBusy复原。两函数代码及新增invitePosterShare模块回下载一致，其他运行文件和原依赖版本保持；getMiniWorkspace仅隐藏锁license/workspaces元数据变化，serviceAccountCallback新增根锁、锁文件仅元数据变化。运行时/超时/内存/handler/角色/VPC/环境变量/描述保持；serviceAccountCallback显式关闭云端自动装依赖InstallDependency=FALSE，以完整线上基线依赖随包发布，避免26.6.4→26.6.5类型定义及qs6.16.0→6.16.1的非目标更新。使用足球隔离CLI、最小配置及COS部署成功；早先环境COS直发遇assume-role限制未采用。最终Active、health200及非法分享范围探针拒绝，无真实通知发送或球员数据修改。上传总2821256字节，主包1692796字节。手机真实复测仍待用户，仅上传开发版，未提交正式审核。

证据目录：.codex-artifacts/invite-share-detection-20261016。既有H5球员认领缺口不在本次范围内，仍待后续处理。
