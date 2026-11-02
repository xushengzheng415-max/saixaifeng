# 裁判登记授权回跳丢失邀请：正式与测试已发布

- 日期：2026-11-01。
- 状态：用户指令「全部修复」后，webLoginApi 及正式/测试 H5 均已发布并读回。未修改真实裁判、账号、邀请及比赛任务数据；实际微信扫码登记待本人复测。
- 用户反馈：从主办方裁判登记二维码进入，却显示绑定裁判身份，并在获取短信时提示无待执行裁判任务。

## 已验证事实

截图手机号的裁判档案按 phone / phoneNumber / mobile / contactPhone 查询无记录。近期本赛事二维码登记邀请指向正式或测试 /service-account-h5/，包含 refereeInvite 参数。两端实际 app.js 的授权请求只传页面路径；线上 webLoginApi.refereeOAuthReturnUrl 也剥离全部查询参数。授权后只靠 localStorage 的待办邀请恢复登记，缺少原缓存时会进入 getWorkbench → renderBinding。

线上 serviceMatchWorkflow 的 sendBindSms 只对已有已审核裁判且存在 canOperate 执法任务放行；所以新裁判在这个错误入口会被拒。此检查不是裁判入库条件，不应通过给新人先安排任务或自动审核资格绕过。截图只能证明页面落入任务绑定分支，未取得该真实微信回跳全过程日志，不把缓存丢失原因冒充完全复现的真实设备事实。

正确流程继续为：赛事登记二维码关注服务号 → 专属登记链接 → 微信授权 → 上传裁判证、头像与本人资料 → referees 待审核 → 审核与排班。已有产品规则未改变；入库、审核通过和取得单场操作权限分别记录。

## 最小修复

- H5 beginOAuth：将本次 refereeInvite 带入本站返回地址。
- webLoginApi.refereeOAuthReturnUrl：仅对白名单域名和正式/测试裁判H5路径保留 refereeInvite，丢弃 code/state 及其他参数，限制长度。
- H5 completeOAuth：清理授权参数前先从回跳URL恢复本次邀请，优先于旧缓存；仍走 getRefereeInvitation 的邀请状态与关注身份验证。
- 登记入口已有H5会话过期时，保留本次邀请并重新授权，不转去任务绑定。
- 不修改裁判资格审核、任务权限、短信校验、库结构或无证裁判例外流程。

## 验证

- webLoginApi/index.js、H5 app.js 语法及 diff 检查通过。
- tools/test-referee-registration-return.cjs：返回地址8项 + 真实H5页面5场景通过（无缓存授权返回、失效邀请、首次登记授权请求、普通工作台、过期会话重新授权）。对正式与测试实际待上传文件分别通过；线上对应文件逐一SHA-256相同。
- 所有网页请求均本地隔离，不发送短信、不访问真实OAuth、不写云端。截图 output/referee-registration-20261101/registration-return.png。
- tools/test-referee-full-workflow.mjs 全流程回归通过，包含赛前核验、记录、报告和签字；不等同于真实人员已登记成功。

## 发布与线上验证

- 从最新线上包差量修改webLoginApi/index.js，仅4增1删；131个原有业务/配置资源文件除index.js外摘要均一致。拟上传及回下载均通过裁判表和报名Word上传保护检查。
- 云端修改时间2026-11-01 17:35:53，Active/Available。Nodejs18.15、512MB、120秒、index.main、InstallDependency=TRUE保持；运行配置、环境变量、角色、网络及层配置对比无变化。
- 保留线上自动安装开关。回下载6607文件，含自动安装的6476个依赖文件。直接依赖版本与原锁文件一致；在线安装对三项间接依赖发生解析更新：@types/node 26.6.5→26.6.6、follow-redirects 1.16.1→1.16.2、url内qs 6.16.1→6.17.1，均通过原依赖声明范围检查。没有修改uploadFile或其InstallDependency=FALSE配置；不宣称这些间接依赖字节与发布前相同。
- webLoginApi/index.js 回下载SHA-256：f364f1d52b6627f498c81fba6ad0c3575121b8bfdf934690fa900b0ef1bdb3ff，与拟上传一致。
- 正式 /service-account-h5/、测试 /preview/service-account-h5/ 各只上传app.js和index.html。分别以各自线上文件差量修改，保留其他HTML、CSS和脚本；缓存版本20261101-referee-return1。
- 两端app.js SHA-256均为d82fe99d877f17558f58cf39f7fa30aea2ba6c5508edaccdccda6eeaf05e3482；正式index.html为1d418dadc9198a240ca66c6ac1f15adeaadfe565de90963b75d76e966fa4992f，测试为d200f0f50a7c76f238335b29ee1e4d342dbaef1cd24559f37e76ba6d8a70f276。4个URL HTTP200，与各自拟上传文件逐一一致。
- 线上授权URL探针确认正式和测试回跳均保留refereeInvite；未登录workflow返回H5_AUTH_REQUIRED。探针仅生成2条10分钟有效OAuth state，未访问微信OAuth、不发送短信、不注册人员。
- 源码已同步GitHub main efdbd9930f779d3c772230c410f06b6a14eaa248，main合回preview为1dc0cf078052d18f51a4503ae03f3012418441a3；保留其他未验收测试内容。本次没有重新发布PC或小程序。
- 工作证据在work/referee-registration-20261101/{backend-manifest,h5-manifest,readback,probe-result}.json。后端由正式和测试H5共用，只发布同一正式函数，不以旧测试包覆盖生产。

## 真人复测

关闭截图中的旧任务绑定页，重新扫描主办方裁判登记二维码或打开对应专属登记链接。应进入提交裁判资料页；上传裁判证和头像并提交后，先进入裁判库待审核，审核通过和获得场次任务仍是后续独立状态。未替截图人员创建裁判档案或推断其资料已提交。
