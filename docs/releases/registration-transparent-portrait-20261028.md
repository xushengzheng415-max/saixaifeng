# 注册端透明形象照直入库（已发布，2026-10-28）

> 同日后续：登记生成面板已按用户要求简化为双图上传；参考图现走 2048px 优先直传，本文「输入仍为 800px」是上一阶段快照。最新 UI、余额校验与参考票据 owner 绑定见 [双图面板发布记录](registration-ai-sheet-20261028.md)。

**状态：用户明确回复「可以发布」后，两个共享正式云函数及 3 个 H5 文件已差量发布并完成回读。** 发布探针没有调用真实生图、没有写正式业务数据或扣真实蜂蜜；真实微信账号的业务验收由用户从本文入口继续测试。

## 发布与线上读回

- 仅执行 `fn code update` 更新 `aiPortraitDemo`、`webLoginApi`，没有执行运行配置、凭据或模型配置修改。发布前重新下载两份最新线上包，确认差异只含本轮目标；`webLoginApi` 实际上传目录重新通过裁判表接口保护检查。9 个变更文件及 80 个相对 require 依赖预检通过。
- 两个函数回下载：14 个入口/模块/依赖声明文件 SHA-256 与实际上传包一致，包含裁判表 OCR/分析模块。关键依赖元数据 8 项一致：webLoginApi 的 wx-server-sdk 2.6.3、database 1.4.1、Resvg 2.6.2、pngjs 7.0.0；aiPortraitDemo 的 node-sdk 3.16.0、database 1.4.2、jpeg-js 0.4.4、pngjs 7.0.0。
- 发布检查补强了保存锁：使用实际数据库 SDK 的更新序列化器验证，将锁写入改为 `db.command.set` 原子替换，避免清为 null 后再次写子字段失败；隔离回归通过后已重新差量上传并回读确认。最终 `serviceAiPortrait.cjs` SHA-256：`15BA7A3D21E2259672505D7AA4A9F769336408591FF1FD3AD80E776D318C579B`。
- 正式 H5 三文件 HTTP 200 且摘要全部匹配：`service-entry.js` 81,515B / `9BFF58FC12A5EBE5E3DED5BCBBBE31284592F084B70B29B52EA8B915EF0885A8`；`join-player.html` 869B / `DD103CA3D152D03E4AC69E43C465CBBD10253B4B56769393B7A3C4BFA7C63E91`；`claim-team.html` 566B / `32AAA9E54BBF6E0BD8C73806EB1404EE63BC11677B407A9428929B850C359481`。脚本先上传、入口后更新；缓存标识 `20261028-transparent-reg1`。
- 7 项无副作用线上探针通过：非法 JSON/空请求 400；无登记凭证、无后台凭证、公开透明输出均 403；登记 prepare/apply 已接线且无会话时明确拒绝，不是未知操作。AI 健康 GET 正常；回读时默认 `hunyuan35` 是当时后台已保存配置，本次没有代用户修改。
- 证据：`output/registration-transparent-20261028/{candidate-manifest,h5-readback,code-readback,dependency-readback,release-probes}.json`。后端/H5 源码未提交 Git，未推送；保留同期改动。
- 对应注册测试目录 live 检查：`/preview/service-account-h5/join-player.html`、`claim-team.html`、`service-entry.js` 均为 404，无已登记对应端可同步；未猜测/创建新目标。两个函数是共享正式后端，其他已有测试端调用也使用本次代码。

## 断点与修复

1. 注册页先前从公开接口取白底图；新增 `serviceEntryAiPortraitPrepare`，经过既有 `authorize_media` 和登记会话校验后，在 `auth_sessions` 创建独立 scope 的 15 分钟生成凭证。`registrationGenerate` 核对当前会话、用户、服务号身份、邀请入口和有效期，不复用平台管理员凭证。
2. 生成服务复用已部署透明 PNG 渲染器，生成后原图保存到受控路径，只将成片编号写入本次登记会话。登记预览可显示 PNG，确认使用只传 `generatedPortraitId + requestId`，不再把透明成片压成 JPEG 或上传大段 Base64。
3. 确认接口从本会话读取成片编号、校验归属/有效期/真实透明通道，在扣费前阻断无效图。现有上传模块通过仅限内部调用的第五参数接收已校验原图，直接复用同一文件 ID；透明原图不再调用分割，不再缩放/重传。
4. 同会话确认使用增加短时保存锁；重复 requestId 返回既有回执，不重复扣费或追加形象照。保存失败沿用既有退款逻辑，退款后可重试，扣费失败不伪造退款；锁最终释放，进程中断的锁 120 秒后可重试。
5. AI 接口对空请求、非法 JSON 和不支持的 action 返回 400，避免探测解析失败后意外默认生图。正常旧白底请求保留兼容。

## 业务边界

- 既有「预览不扣蜂蜜、确认使用按服务端金额扣费」不变。平台后台工具仍免费自用，其凭证不能拿来冒充登记凭证。
- 不改球员身份、球队归属、正式名单审核、卡级/积分算法或卡片绘制协议。现有 `portraitId → portrait.fileId → registrationDraft → 统一球员卡渲染` 继续复用；`provider` 不参与资格判断。
- 本轮只覆盖球队邀请登记的 AI 形象照环节，不把无邀请 `self-register.js` 当成已接入同一流程。
- AI 输入照片仍用现有 800px 压缩；本轮消除的是生成成片在确认阶段被再次压缩/抠图，未宣称人物身份一致性或原始参考照质量已经解决。
- 成片预览记录有效期 2 小时；确认使用后同一文件成为长期形象照。未确认的成片和中断上传对象暂无新增自动清理任务，不将「过期」等同于「物理删除」。

## 隔离验证

- `tools/test-registration-transparent-portrait.cjs`：仅内存数据库和合成透明 PNG；覆盖登记凭证绑定、跨会话拒绝、大于 96KB 的成片通过编号保存、PNG 字节/尺寸保持、零重复分割/上传、重复确认及并发只扣一次、保存失败退款/重试、扣费失败解锁。透明检测使用实际 `isTransparentPng` 源码。
- `tools/test-player-registration.cjs`：登记字段/认领/归属/并发/草稿/恢复/转会回归通过。
- `tools/test-service-entry-registration.cjs`：20/20 通过，包含手机号与邀请范围、领队确认和异常拒绝；日志中的故意拒绝为隔离用例，非线上故障。
- `tools/test-ai-portrait-model-settings.cjs`、`tools/test-ai-portrait-chain.cjs` 通过，补测非法 JSON/空请求 400 与无登记凭证 403。
- `tools/test-honey-recharge.cjs` 的金额复核、签名与账本幂等回归通过；没有执行真实支付。
- 两个后端入口、模块和前端脚本 `node --check` 通过；实际拟上传 `webLoginApi-stage` 已执行 `tools/check-referee-backend-package.cjs`，裁判表接口及依赖保护通过。
- 数据中心统一服务与数据治理测试通过；`sync-data-center --check` 仍报告 12 处本轮未修改的既有共享副本差异。候选包保留刚下载的线上副本，本轮未覆盖或替其他会话同步这些文件。
- 尚未以真实微信账号完成新链路的生成、确认扣费、模板制卡全程；发布和线上技术读回完成，不将其表述为真实业务验收完成。

## 可审阅发布包

目录：`output/registration-transparent-20261028/`，版本摘要：`candidate-manifest.json`（9 个变更文件）。

- `webLoginApi-stage/`：刚下载线上包为基线，入口仅增加一个 action，另更新 `service-entry.js`、`serviceAiPortrait.cjs`、`serviceRegistrationMedia.cjs`；同期其他接口与依赖原样保留。
- `aiPortraitDemo-stage/`：刚下载线上包为基线，仅更新入口并新增 `registrationPortrait.cjs`。
- `h5-stage/`：`service-entry.js`、`join-player.html`、`claim-team.html`；页面脚本缓存版本 `20261028-transparent-reg1`，不覆盖其他 H5 文件。
- 未改运行配置、模型配置或凭据；未创建新的生产目标。发布前如线上源码再次变化，须重新差量合并，不能直接用旧暂存包覆盖。

## 测试入口与发布授权

新链路测试入口：`https://www.sxffootball.cn/service-account-h5/registration-resume.html?v=20261028-transparent-reg1`（HTTP 200）。需微信打开并具有可恢复的球队邀请登记记录；没有记录时先扫球队邀请二维码。它使用**共享正式后端**，不是免扣费的隔离环境：预览不扣蜂蜜，确认使用仍按现行规则扣蜂蜜。

目前没有已登记、独立后端的注册端隔离测试地址。用户在本任务已明确允许差量发布这两个共享正式函数及对应 H5，授权范围内发布已完成。平台后台工具保持原有管理员门禁，不重新公开。
