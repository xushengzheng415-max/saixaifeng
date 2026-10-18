# 本人机构与共享赛事识别修复（2026-10-18）

- 本人机构优先采用 organizations 中稳定 userId 对应的负责人关系；赛事邀请成员关系不再作为本人机构冲突的依据。
- tournament_staff_invite 和 tournament_staff 关系仍通过原有授权链路进入对应共享赛事；未合并机构或修改赛事归属。多个本人机构仍阻断自动选择。
- 已登录身份的 scope/mine/invitations 查询允许在未确定机构时执行；其他操作的机构和赛事权限检查保持有效。
- 基于当时线上 webLoginApi 包仅修改 index.js、organizationScope.cjs，其余线上差异全部保留。只更新代码，未更新运行配置。
- 线上回读：95/95 个非 node_modules 文件 SHA-256 完全一致；函数 Active；运行时、超时、内存、环境变量、网络、Handler、Layer、依赖安装配置比较一致。匿名 scope 请求返回 AUTH_REQUIRED。
- 正式版与测试版共用该接口，均已生效。实际账号的机构记录未读取、未手工调整，页面恢复需以用户刷新结果确认。
- 之前的 PC 加载状态和教程按钮仍为 preview 发布范围，本次未覆盖正式 PC 静态页面。
