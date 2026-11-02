# 共享账号球队权限修复：正式与测试均已发布

- 日期：2026-11-01，Asia/Shanghai。
- 用户反馈正式电脑客户端刷新后仍不显示电话和可用的分配权限入口；本轮将已验收的测试修复发布到正式页面，并同步测试端。
- 结果：正式 /admin/ 与测试 /preview/admin/ 均已部署，分别完成 HTTP、资源 SHA-256 及 Windows 客户端通道烟测。未更新安装包、云函数或真实账号数据。

## 发布范围

共享账号在本赛事有效授权范围内可分配球队主账号/子账号；手机号按账号记录回退工作人员资料显示。现有子账号设为主账号时按工作人员ID复用原行，消除手机号资料未填时重复补出的账号持有人行。业务规则与实现见同日 team-account-access-preview 记录；该记录的“正式未覆盖”是此前阶段状态，由本记录替代。

主账号、共享授权、球队参赛关系和数据归属仍由既有服务端校验；未跨机构、跨赛事扩权。服务器真实记录已有的两名人员主子账号属性正确互换，本轮未新建、删除或合并人员。

## 源码与构建

- 正式基线 GitHub main c47929d6111b48580f4d2ebfe14b05951ff2eff7。
- 正式只引入测试已验证的5文件修复，main 提交 3fe773a3；未将 preview 其余70文件差异整体带入正式。冲突仅为 TeamDetail 导入区的同期头像组件，正式保留原头像实现，测试保留测试头像组件。
- 正式构建 VITE_APP_BASE=/admin/，2955 模块，35.62秒；正式源码已先推送 main，然后发布405文件到 /admin/。
- 正式发布后 main 合回 preview，保留测试独有改动，preview 同步提交 78bbc882；测试构建 VITE_APP_BASE=/preview/admin/，2967 模块，44.07秒，407文件发布到 /preview/admin/。
- 权限边界及账号行去重测试 14/14，分别在正式候选与同步后测试源码执行通过。
- 没有向 Gitee 推送镜像。同期主工作区修改保留；功能分支继承 preview 独有历史且发布分支仍由工作树占用，未未经核验强删分支。

## 正式线上读回

7个入口/关键资源均 HTTP 200，SHA-256 与正式构建逐一一致：

- /admin/：b97ed727371c05106988e18acb1472f0637b89d1f61da96c2f433436ebe254dc。
- /admin/assets/index-sW3Pi9Yz.js：687e70c0443249b001199447a046cd1528c12dd1008621578543b6e865f067e9。
- /admin/assets/TeamDetail-DDJUcdy7.js：13af13e83b0851f2a92c8b00a492ff4f54bd0e362757facf3e0bacd61b23d2ea。

正式入口不加查询参数的普通 HTTP 请求也返回 index-sW3Pi9Yz.js，缓存头 public, max-age=300, s-maxage=600。客户端此前已打开的页面仍需重新加载，不能用旧窗口中未重新载入的组件判定新发布失败。

## 测试同步读回

7个入口/关键资源均 HTTP 200，SHA-256 与测试构建逐一一致：

- /preview/admin/：6cbff8209298ba1bcd36246550a5ba783731bd9fea475ee30a9642d0a42700ac。
- /preview/admin/assets/index-CIz1rXpo.js：f77ac696bc089c98b400924b4bc1aebdbf69fb7f45b9e24730ef98a888a4696e。
- /preview/admin/assets/TeamDetail-Dk_vl6rB.js：acba7e4105aea80cf3ac0fabc025e367f3e5c9ddeac923485ea4d1ae513e2d96。

同步测试后正式入口摘要仍为 b97ed727…254dc，未被测试构建覆盖。逐项记录在 work/team-access-preview-20261101/{formal-http-readback,http-readback}.json。

## 客户端验收边界

Windows 当前源码0.2.8，正式/测试通道烟测分别8/8；测试使用独立会话，不替代用户设备安装版本或真人共享账号写操作验收。Pad 固定读取测试入口，Windows 默认正式入口，均沿用同一服务端权限规则。本轮没有读取个人令牌、替用户修改真实权限或更换安装包。
