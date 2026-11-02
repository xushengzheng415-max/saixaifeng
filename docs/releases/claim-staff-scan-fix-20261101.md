# 球队认领码遗漏已授权工作人员：已发布

- 日期：2026-11-01。
- 状态：2026-11-01 16:33:50（Asia/Shanghai）getMiniWorkspace 已发布；云端 Active / Available，源码回下载摘要一致。未人工修改该球队真实授权数据，用户下次扫码按已有邀请激活。
- 用户已确认规则：主账号与已登记授权的子账号均可扫码识别并接收各自权限；子账号不等待主账号先扫码，不因此取得球队所有权。已同步 PRODUCT_RULES 与 ADR。生产发布另获用户「上线吧」明确授权后执行。

## 线上核验

用户反馈黄科大主教练子账号扫码看不到球队。最小字段只读核验确认：球队仍待主账号认领；主教练已登记在主账号邀请的成员候选中，并存在有效的 organizer_team_access / team_member 邀请；其手机号唯一对应已注册账号，但 team_memberships 尚无有效关系。

发布前扫码 claimableTeams 仅查询主账号认领/移交邀请；最新线上包还缺少本地候选的 activateAssignedStaffAccounts，登记邀请没有在首次登录激活为成员关系。两处缺口共同导致子账号不可见。不得通过把主教练手机号加到主账号认领白名单修复，否则可能改变所有权。

## 修复范围

`cloudfunctions/getMiniWorkspace/index.js`：扫码复用既有工作空间授权恢复；将本人已有管理关系且参加当前赛事的球队补充为「已授权管理」入口。复用统一数据读取与工作空间权限；不变更主账号、不自动认领、不扩大到机构经营数据。分批查询本赛事参赛关系，排除已撤销、拒绝、退出、删除和归档记录；同球队入口去重。

`tools/test-team-claim-code-contract.js`：模拟补齐事务与 doc.set；新增主教练待激活邀请、撤权、过期和跨赛事用例，确认球队所有权和领队白名单不改变。

## 验证

- node --check 通过。
- 认领码契约 26/26 通过。
- 实际拟上传包与线上回下载包均隔离回归 26/26；新增只读子账号用例验证扫码不升级权限。
- 云函数已部署；真实主教练账号扫码待本人现场验收。现有小程序已支持已授权入口直接进入，本次不重传小程序。

## 发布与读回

从刚下载的最新线上包合入差量：首次登录激活既有工作人员邀请、授权子账号保留单球队空间、不因球队授权扩展机构管理能力、扫码识别本赛事已授权球队。6028 个文件发布前仅 index.js 变化（72 增、6 删）；其他本地未发布功能没有整包带入。

足球专用 sxf-cloud 启动器执行 fn code update getMiniWorkspace，受控无敏感配置显式保留 installDependency=true。CLI 返回更新成功；云端 Active / Available。Nodejs18.15 / 512 MB / 150 秒 / index.main / InstallDependency=TRUE 不变，运行配置、环境变量配置、角色、网络与层对比无变化。

回下载 6028 文件：index.js SHA-256 为 49eb613a55be1ce39bf321217682d3cf4bfdbcf5bbf979140a9cb2217bebfa2c，与拟上传文件一致。唯一额外差异为 npm 重建 node_modules/.package-lock.json 的 license 与开发工作区 workspaces 元数据；全部业务模块、依赖实现、依赖版本、包完整性值均保持。无新增/删除文件。

未登录调用 claimableTeams 的真实线上探针受控拒绝，未发生越权数据写入；请求 585a7548-73be-41c2-8c84-7110ed27377e。证据为 work/claim-staff-release-20261101 内 manifest.json、readback.json、受控配置及前后包。

正式与预览/开发小程序共用同一 getMiniWorkspace 正式后端，本次一处发布即同步生效，无独立测试后端重复部署。未改 PC 静态页面、H5、其他云函数；未发布小程序正式版。Git 保留工作区同期修改，本次没有整包提交或推送。
