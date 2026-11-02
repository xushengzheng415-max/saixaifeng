# 共享账号分配权限与主子账号展示修复

> 本页为测试发布阶段记录。其后正式与测试均已完成发布，当前状态以 [正式发布记录](team-account-access-formal-20261101.md) 为准。

- 日期：2026-11-01（Asia/Shanghai）。
- 状态：PC 测试版已部署并读回；正式 /admin/ 未覆盖，等待产品负责人验收及正式发布授权。
- 用户确认：共享账号可以分配本赛事球队主账号、子账号权限；现有子账号设为主账号后应互换属性，不能多出账号行。

## 诊断

Pad 的 ClientPolicy.HOME 固定为 /preview/admin/；Windows 默认为 /admin/，可切换测试通道。安装客户端复用网页与后端权限，不单独维护账号模型。发布前线上两份 TeamDetail 页面均仍有 isStaff 且非 isOwner 就拒绝分配的旧判断；org 上下文和共享身份不同的会话因而会禁用入口。网页切换能力与实际版本缓存应单独核对，不根据客户端名称推断真实权限。

只读核验线上 organizerClaimInvite 与 webLoginApi：均已支持本赛事有效共享会话的球队账号分配特例，仍检查会话、机构、赛事范围，不需要再次部署后端。

主子账号互换后，服务端候选仍为两名且 accountType 已正确互换。重复行来自工作人员资料手机号为空，页面仅按手机号判断是否要补账号持有人行，漏掉已有 staffId 关联。没有新增自然人账号或工作人员，故无需删除真实数据。

## 修改

- 新增 utils/teamAccountAccess.js：共享账号按服务端 activeOrgId、当前赛事 active grant 启用入口；拒绝跨机构、跨赛事及撤权关系。保存仍由既有服务端授权链路验证。
- TeamDetail.vue 保存 scope.grants，不再把共享身份本身当作禁止分配的条件；未授权提示改为当前赛事未授权。
- 工作人员账号按 staffId（兼容 staff:ID）优先关联；升主账号后复用原工作人员行。只有确无对应工作人员资料时才补归属展示行，不按姓名合并。
- 手机号优先显示账号登记值，再回退工作人员资料中的 phone/phoneNumber，避免有记录却显示破折号。
- PRODUCT_RULES 与 ADR 已记录本轮用户确认规则。

## 源码、构建与发布

- GitHub 最新 preview 0313b995 为基线，隔离工作树 .codex-artifacts/team-shared-access-20261101，保留主工作区同期修改。
- 功能提交 24a34726，preview 合并提交 06c8e4fd145949219a4ef497fddf5f98a39cf6d0，均已推送 GitHub；未合并 main，分支按规则保留。
- npm run build，VITE_APP_BASE=/preview/admin/，2967 模块，1m43s 完成。隔离工作树已补齐构建需要的共享源码；没有改其业务逻辑。依赖锁与主仓一致，复用已安装依赖。
- 只上传 /preview/admin/，407 个文件成功。浏览器入口无 CloudBase SDK 导入；原注释中的 SDK 名称不是运行依赖。
- 7 个入口与关键 JS/CSS 地址 HTTP 200，线上 SHA-256 与本地一致。测试入口 SHA-256：7244c08bb59c0c02514d49b717f1677d6f548163d55cf3d736cf2a58e742e691。
- TeamDetail-CxieMQrM.js SHA-256：d9c701deef8c36ff1741c59303b93ec4b8f4134668f4f453242a6e9170e2959c。
- 正式入口发布前后 SHA-256 同为 c3275a68eb0c416bf365d4d639b623bafb76d5f420aebd93aa00c12a180acd87，保持不变。

## 验证与边界

- tools/test-team-account-access.mjs：14/14，覆盖共享授权、跨赛事、跨机构、撤权、工作人员手机号为空时的属性互换与稳定行数。
- Windows 当前源码 0.2.8 的正式/测试通道烟测在发布前后均 8/8，覆盖登录、沙箱、刷新、更新提示、导出和打印等。不是用户设备安装版本的证明，也不代替真实共享账号写操作验收。
- 未修改或发布 Windows/Pad 安装包，未部署云函数，未修改真实账号/球队数据。Pad 刷新测试页面可验收；Windows 可切换测试通道验收；默认正式通道仍待正式发布。
- HTTP 证据：work/team-access-preview-20261101/http-readback.json；客户端报告：desktop-windows/test-output/{preview,production}/result.json。
