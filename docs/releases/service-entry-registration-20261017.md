# 服务号 H5 球员登记/球队认领接口修复（2026-10-17）

## 背景与根因

用户真机复现：H5 登记表单可正常渲染（球队名来自服务端，说明扫码→关注→OAuth→会话→context 全链路通过），但点击「继续登记」后页面顶部出现红字「无法识别当前微信账号」且表单保留、按钮恢复——这是**提交失败后**的页面状态。

完整断点链：H5 `serviceEntryJoinPlayer` → webLoginApi.joinPlayer（context 校验通过）→ `cloud.callFunction(getMiniWorkspace, acceptServiceTeamPlayer)` → 线上 getMiniWorkspace 主入口**没有该动作**，请求先落入 `findCurrentUser()` → `cloud.getWXContext().OPENID` 为空（webLoginApi 由 H5 经 HTTP 调用，跨函数转发没有小程序 OPENID 上下文）→ index.js 抛 `无法识别当前微信账号` → catch 后原样透传回 H5。即交接文档 P0-1，文案有误导性（服务号侧微信身份已识别，断的是小程序 OPENID 上下文）。

## 本次发布内容（getMiniWorkspace，差量发布）

以发布当时线上包为基线（15:47 下载，5902 文件），只叠加三处修复，未带入其他任务未提交修改（本地多出的 `playerCardPreviewAssets.cjs` 未包含；线上已有的其他任务改动原样保留）：

1. **P0-1 接口断点**：`exports.main` 最前方拦截 `acceptServiceTeamPlayer` / `acceptServiceTeamClaim`，先于 `findCurrentUser`；新增 `loadServiceEntryRegistration` 服务端鉴权链（会话令牌 SHA256 → gate 用途/状态/有效期 → 扫码关注证明 → 手机号唯一自然人账号 → 微信绑定冲突），只认服务端会话、不接受客户端 userId/OpenID、不动数据库权限；服务号 OpenID 不写入任何小程序 OPENID 字段（`identity.openId` 传空）；球员登记复用 `acceptTeamPlayerInviteForWorkspace`，认领复用 `acceptPrebuiltTeamInviteForWorkspace`（手机号口径与 H5 列表一致、归属冲突阻断转人工）。
2. **P0-2 建档默认值**：新球员不再硬写 `identityVerificationRequired/portraitRequired: true`，改为 `false`（球队建档不强制身份证核验，符合 PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD）；历史数据不动。
3. **P0-3 认领匹配**：`teamPlayerInviteForWorkspace` 排除 archived/deleted 档案；多候选抛 `PLAYER_PROFILE_CHOICE_REQUIRED` 不取首条；重名查重同步排除归档（测试抓到的连带真 bug）。

webLoginApi 线上已含转发代码且与本地逐字节一致，未发布。H5 静态三文件（join-player/claim-team/service-entry）线上 last-modified 为 10-03，与收回本地的源码一致，未改动。

## 验证

- 新增 `tools/test-service-entry-registration.cjs`（内存库 mock）：23/23 通过，覆盖 9 条鉴权拒绝、登记/认领全链路、OpenID 隔离、归档排除、幂等认领、冲突阻断。
- 回归：`test-mini-invite-compact`、`test-invite-poster-share`、`test-invite-share-refollow`（分享修复未回退）、`sync-data-center --check` 全部 PASS。
- 发布：足球专用 sxf-cloud.ps1、独立最小配置（`--config-file` + 相对 functionRoot）、COS 部署、`installDependency=false` 完整依赖包；17:24:56 Active。
- 回读：重新下载线上包 5902 文件，与发布包逐文件一致（index.js 字节级相同）；运行时 Nodejs18.15、handler index.main、timeout 150、memory 512、环境变量 SXF_MATCH_PASS_SECRET、InstallDependency FALSE 均保持。
- 未上传小程序、未改版本号（仍为 1.1.39）、未提交/推送 Git。

## 待办

- 真机复测：重新扫码进入登记链接（原 proof 已过期），填写提交应到达 `acceptServiceTeamPlayer` 并跳转资料补全页。
- P0-4：登记提交→球队待办→结果触达闭环未做。
- 多孩子/跨档案选择 UI（`PLAYER_PROFILE_CHOICE_REQUIRED` 目前只有错误码，无选择入口）。
- 本地工作区改动未提交，由用户决定提交/推送时机。

证据目录：`.codex-artifacts/player-registration-release-20261017/`（online-baseline 线上基线、release-package 发布包、readback 回读包、deploy.cloudbaserc.json 发布配置、deploy5.log 发布日志、release-diff.txt 差量）。
