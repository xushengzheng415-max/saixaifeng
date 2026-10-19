# PC操作教程：B站播放器接入

2026-10-17更新：用户已验收预览并明确授权正式发布。教程功能已合入main（28d0ea72），正式入口为`https://www.sxffootball.cn/admin/#/tutorials`，四条已配置视频通过真实播放检查，五条待上线。正式与预览发布记录见`docs/releases/operation-tutorials-formal-20261017.md`。主工作区并发改动保持，实际使用已提交main源码快照构建。本文件下文“本地/待上线”的流程记录为开发阶段历史，现状以本段和发布记录为准。

## 入口与配置

- 公开路由：`/admin/#/tutorials`。预览基路径为`/preview/admin/#/tutorials`。
- 单节分享：添加`?lesson=account`，其他ID见目录。
- PC布局的“操作教程”“看本页教程”在新标签打开，避免离开未保存的业务表单；原帮助中心远程协助保持。
- 登录页提供操作教程入口，教程不依赖用户或机构会话。
- `web-admin-vue/public/tutorials/catalog.json`维护九节目录；每项`video`填完整BV号或`https://www.bilibili.com/video/BV.../`链接，`part`可选分P。短链需先解析成正式视频链接。
- 未配置视频显示待上线，不加载iframe、不用第三方示例视频冒充本平台教程。
- `public/tutorials/covers/`复用本次用户确认的9张大字封面。

## 播放

按官方外链播放器文档`https://player.bilibili.com/`生成固定HTTPS来源，关闭自动播放与弹幕。点击播放才请求B站；原视频链接提供外跳。iframe不携带本站Referrer；不传账号、赛事数据或原始分享链接中的追踪参数。用户切换教程时销毁iframe并清理计时器。20秒未触发iframe加载时显示重试；跨域iframe的load仅能代表文档加载，不能证明视频正常播放，故持续保留B站观看入口。

本次未涉及小程序、服务号H5代码、云函数、数据库、视频上传或外部平台发布。公开教程页面为手机适配PC工程页面，不代表原生微信小程序已接入。

## 验证与待办

- PC生产构建通过，使用独立`dist-tutorials`输出，不覆盖正式部署产物。既有战报背景资源未解析与大分包警告仍存在。
- `outputs/tutorial-center-20261017/verify.cjs`验证URL白名单、参数重建、路由匹配、公开访问、9节待上线状态、移动端宽度、点击后装载隔离播放器、切换销毁、目录错误重试和空态。
- `outputs/tutorial-center-20261017/desktop.png`与`mobile.png`为页面检查证据。
- 本次变更文件差异检查通过；仓库原有RefereeReportImport.vue空白问题不属于本次修改。
- 用户尚未提供真实视频链接：真实B站视频、清晰度、登录提示和微信浏览器兼容性待验收。
- 配齐后，将本次明确文件差量引入主办方功能分支，按PREVIEW_RELEASE_WORKFLOW.md先合并preview、构建预览、发布并读回；不得从平台长期分支整包发布主办方。生产发布另行授权。
