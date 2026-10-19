# 旧关注状态导致分享保护遗漏

当前验收：2026-10-17 用户手机复测确认“目前没问题了”，本项分享误回复修复验收通过；不覆盖整个注册/认领/审核/通知流程。下面是发布当时的验证快照，其中“待用户复测”状态已由本段更新。

## 发布当时记录

2026-10-17 服务号分享误回复复测修复已发布后端。只读核对13:34同码扫码证明为已关注，但当前自然人service_account_bindings仍停在unsubscribed/subscribed=false，gate未写posterShareWindows。旧manage查询subscribed=true导致返回空shareToken，独立旧包回归已复现。新逻辑按当前自然人的既有有效服务号关联生成分享保护，不以过期关注标志跳过；排除revoked/replaced/deleted/unbound/disabled，多账号同微信冲突阻断。签名验证后的服务号scan/subscribe进入登记入口时，仅同步既有且唯一自然人关联的关注状态，不新建/迁移绑定，不改变一次性订阅授权、模板、通知配额或名单资料；冲突/元数据更新失败记录告警并沿原流程处理。

两个函数均从本次刚下载的线上包差量更新：getMiniWorkspace仅invitePosterShare.cjs，serviceAccountCallback仅该模块及index.js的一处同步调用。getMiniWorkspace 14:00:01、serviceAccountCallback 13:59:46 Active；运行时/handler/超时/内存/角色/VPC/环境变量/描述保持，原依赖版本保持，下载后5902/6407全部文件哈希与候选一致。使用足球隔离CLI、独立最小配置、相对functionRoot及COS部署，关闭云端重装依赖以保留完整现有依赖。此次未上传小程序或修改版本号。旧包漏判复现、新包分享保护、签名回调、对方入口、subscribe、无绑定、失效绑定、跨账号冲突测试通过；健康200、无效签名403。未手工修改真实关注/账号数据，下一次真实扫码回调会同步；手机实际复测待用户。

证据目录：.codex-artifacts/invite-share-refollow-20261017。专项：tools/test-invite-share-refollow.cjs。
