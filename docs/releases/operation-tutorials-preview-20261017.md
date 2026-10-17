# 操作教程预览发布

2026-10-17，用户授权先上线体验。仅发布主办方PC预览站`https://www.sxffootball.cn/preview/admin/#/tutorials`，未发布正式/admin/，无云函数、数据库或配置变更。

功能提交`f65cb89`从最新origin/preview独立引入，合入preview为`0c81a75a`。只迁移教程源码、目录、封面及三个前端入口文件；未整体合并平台长期分支，未夹带主工作区并发修改。

公开教程页提供九节目录、单节链接、登录前访问、点击加载B站iframe、重试及前往B站观看入口；后台布局增加总入口和按当前路由匹配的教程入口，登录页增加教程入口，原远程协助保持。

已配置：账号注册BV1KHJe6REbj、创建赛事BV1u5Je68Eaw、竞赛组别BV1mEJe6oEcd、报名与球队BV1t7Je6tEv6，其余五节待上线。

预览基路径构建成功；受控足球CLI上传390文件。线上HTTP入口、入口资源、教程JS/CSS、目录JSON及九张封面SHA-256与本地一致；正式入口SHA-256前后不变。桌面和390px手机公开页检查通过，无横向溢出。四条真实B站视频均读出正确标题、readyState=4，静音播放约1.7秒且currentTime增长，非仅检查iframe加载。未验证所有浏览器、清晰度切换、全片播放或实际音频输出。B站提供“前往哔哩哔哩观看更高清”的提示，网页保留外跳入口。

本机验证与线上证据：正式仓库`outputs/tutorial-center-20261017/online-readback.json`、`online-player-check.json`、`online-account.png`、`online-mobile.png`。预览仍共用正式业务后端，本次仅公开教程及播放器检查，没有发业务写请求。

用户在预览站体验通过后再按PREVIEW_RELEASE_WORKFLOW推进main与正式发布；尚未得到正式发布授权。仍在录制的教程收到明确对应的视频后再配置。
