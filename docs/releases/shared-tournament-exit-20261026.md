# 共享赛事主动退出（2026-10-26）

状态：2026-10-26 已按用户明确授权发布共享后端和 PC 预览版；正式 PC 未发布。真实账号主动退出仍待用户选择赛事验收，未代替用户退出任何赛事。

## 行为

- 共享赛事卡片显示次要操作“退出共享”；二次确认说明退出后失去管理权限，重新加入需主办方授权。
- 服务端 tournamentStaffAccess.leave 只接受本人 grantId，在事务内重新核验 userId 和 active 状态，停用授权并写 leave 审计；重复请求幂等，审计失败整笔回滚。
- 沿用 disabled 状态，使现有各端 active 授权检查即时拒绝后续请求。赛事、球队、球员、账号、机构成员关系、其他授权保持不变。
- webLoginApi 将 leave 作为个人授权操作转发；无本人机构的受邀者也可退出，身份与授权归属仍由服务端校验。
- 页面等待期间防止重复退出，失败保留卡片，成功移除当前授权卡片并清理相应本地赛事权限；账号变化时拒绝继续提交。

## 文件与验证

实现：cloudfunctions/tournamentStaffAccess/index.js、cloudfunctions/webLoginApi/index.js、web-admin-vue/src/views/tournament/TournamentSpace.vue。

隔离回归：node tools/test-shared-tournament-leave.cjs，覆盖本人退出、越权、假会话、伪造身份、无效授权、重复请求、其他授权保留、列表移除、旧授权读取/激活拒绝及事务回滚。两项云函数入口 node --check 通过；以最终线上回下载的授权函数及 policy 重跑上述回归通过。

预览与正式前端共用本次已发布后端。没有修改真实共享授权、赛事、球队、球员或账号记录。裁判接口完整性检查通过。

## 构建补验

2026-10-26 初次本地构建2930模块/53.88秒通过；最终基于最新 preview 的正式拟发布构建2941模块/20.88秒通过，使用 VITE_APP_BASE=/preview/admin/。Vue模板编译及页面交互隔离回归通过，覆盖取消确认、请求失败、切换账号、自有赛事拒绝退出和重复点击。原有静态报表图路径、Sass旧API及大分包警告仍存在。

## 发布与读回

- 功能分支 codex/shared-tournament-exit-20261026，源码提交 ef77b1b4f2f320ec879dc349f019c2f177f1d7ce，基于当时最新 Gitee main 精确暂存本次五个文件；未提交平台工作区其他改动。
- 最新 preview 45e6f4fb 合入功能后形成 e21b1f157866e1b58319576507ebadb90f853072，已推送 Gitee；本次没有合入 main。保留预览已有控制台与纪律管理修改。
- 正式仓库内从该 preview 提交导出确定源码及共享依赖，构建后完整上传400个文件到 /preview/admin/。入口：https://www.sxffootball.cn/preview/admin/#/tournament-space 。
- 预览 index.html、入口 JS/CSS、Vue/Element Plus分包、TournamentSpace JS/CSS 共7个资源均HTTP200且SHA-256与构建完全一致。入口摘要 f466d61a9b15042431bb5fc0bf8e002126e9b5202a8f8a3259188b5fd24e5a4a；赛事空间 JS 摘要 f7be1334f6ae0ae9db573137e11fa9af97171c8c3a4128a8d1d819b9441318f9。
- 正式 /admin/ HTTP200，入口摘要仍为432b54bde9e5d67dd5f1e50866fb9b0c9915b8139caa900b792861fc387d10a0，与发布前一致。

## 共享后端

两个函数均从刚下载的线上包差量发布，只改index.js，最终Active/Available。tournamentStaffAccess原包5815文件、webLoginApi原包6589文件；最终回下载所有文件与拟发布包逐字节一致，依赖版本和文件数不变。入口摘要分别为114d73ae5e0d70b5e3d4faaefc3d7784ef6fa019b5a0159262ee8d4696176b44、9b2754ebe0a87f99452f5622e6ac4ff35bde51244343285cf7515a5c573461ac。

首次CLI沿用TRUE自动安装导致少量依赖版本漂移，已从发布前包恢复并以installDependency:false重新完整上传。随后通过单独配置操作恢复原InstallDependency=TRUE；再次查询包CodeSha256不变，运行配置、环境变量、内存、超时、处理入口、网络、层和角色与发布前一致。该恢复不再次执行代码上传。

线上无效会话探针：授权函数返回STAFF_ACCESS_DENIED，webLoginApi中转返回AUTH_REQUIRED，均无写入。未做真实账号退出、重新授权或多标签页现场验收。

证据目录：正式仓库 .codex-artifacts/shared-exit-backend-20261026（包清单、回下载、HTTP摘要与隔离回归），源码快照 .codex-artifacts/shared-exit-preview-source-20261026。目录中的签名下载链接、函数包及依赖仅供本机核验，不进入文档归档；只同步本发布记录等白名单规范。
