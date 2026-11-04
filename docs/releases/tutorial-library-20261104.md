# 教程知识库与反馈引用（2026-11-04）

## 当前状态

用户于2026-11-04明确授权“上线吧”后，已发布平台正式站、两项共享云函数以及正式/测试服务号页面，并创建私有教程集合。功能源码提交 `d4426572bc4ee78250feb982834c7fa26dab7056`。没有修改真实客户反馈或发送客户通知；临时上线验证教程已按精确ID删除并读回为空。离线截图与测试教程不作为正式客户教程。

## 使用流程

1. 平台运营中心 → 教程知识库 → 新建教程，填写标题、分类、适用端口和分步说明，按需上传截图。
2. 保存草稿或预览；确认内容后发布。发布前提醒核对截图中的个人信息。
3. 反馈管理 → 处理 → 引用教程，搜索并预览已发布教程，最多引用3篇。也可在该反馈中点击新建教程；发布后自动附到当前回复，草稿不会被引用。
4. 点击回复并通知用户，沿用既有服务号通知；客户在“我的反馈”中点击“查看教程”阅读。
5. 教程已发布后可以继续编辑草稿，客户仍看到上次发布版本；再次发布才更新阅读内容。下架后旧链接显示不可用。

来源反馈只在本次新建编辑器内显示，不自动写入教程正文，也不公开反馈内容、用户账号或内部备注。未新增正式教程、修改客户资料、改变通知模板或调整“回复后已处理”的既有业务规则。

## 代码与接口

| 范围 | 入口 |
| --- | --- |
| 平台导航、列表、编辑、回复引用 | `platform-admin-vue/src/views/tournament-center/{TournamentCenterAdmin,TutorialLibraryPanel,TutorialEditor,ServiceFeedbackPanel}.vue` |
| 负责人维护、引用校验与审计 | `cloudfunctions/manageTournamentCenterContent/index.js`、`tutorials.cjs` |
| 客户公开阅读 | `webLoginApi` 的 `serviceTutorialGet` → `serviceTutorial.cjs` |
| 客户本人反馈中的引用 | `webLoginApi/servicePrivate.cjs`、`service-account-h5/service-personal.js` |
| 手机阅读页 | `service-account-h5/tutorial.html`、`tutorial.js`、`tutorial.css` |

新增 `service_tutorials` 集合，直接客户端读写保持禁止，仅通过服务端访问。字段：`draft`（编辑内容）、`published`（公开快照）、`isPublished`、`revision`、创建/修改/发布时间与操作者。内容含标题、分类、适用端口、必要条件和最多30个图文步骤；截图 PNG/JPG/WebP 单张不超过2MB，存储引用与正文分离。

维护接口沿用平台会话与负责人校验；保存采用事务与版本冲突检测，防止并发覆盖。`tutorialList` 分页查询并计数；回复引用只接受已发布教程 ID，标题由服务器读取已发布快照，不能伪造外链。公开接口按 `isPublished` 查询，只投影公开内容，云存储图片在阅读时解析临时地址。客户端使用文本节点或 Vue 转义，不执行教程中的 HTML。

`service_feedback.replyTutorials` 保存 `{ id, title }` 列表；个人反馈接口只回传当前已鉴权用户自己的引用。原有回复长度与通知逻辑保持兼容。教程下架和后续更新会影响已有链接的阅读结果，下架前有明确提示。

## 本地验证

- `npm run build`（平台工程）：通过，独立边界检查通过；保留既有大包体积提示。
- `node tools/test-service-tutorials.cjs`：鉴权、草稿隔离、发布快照、并发版本冲突、公开字段投影、云图片解析、引用校验、回复落库、下架及审计通过；采用内存数据，不触碰生产。
- `node tools/test-service-tutorials-ui.cjs`：浏览器完成新建草稿、编辑、预览、发布、列表错误重试、反馈引用和回复请求，以及390×844手机阅读、不可用提示；所有后端请求拦截为离线数据，无浏览器运行错误。
- 改动的云函数及 H5 JS：`node --check` 通过。
- 截图：`output/tutorial-library-20261104/`。

## 已授权发布范围

共享云函数 `manageTournamentCenterContent` 与 `webLoginApi`、新增私有集合 `service_tutorials`，以及平台界面、服务号 H5 对应文件。本轮均由用户“上线吧”明确授权；未发布主办方PC或小程序，也未改变其正式/测试基线。

发布时必须下载最新线上函数包，只合入本任务差量并保留依赖与配置。实际 `webLoginApi` 上传包、回下载包均执行 `check-referee-backend-package.cjs`（包含报名上传防回退检查）。禁止使用当前含其他任务未提交改动的整包覆盖生产。服务号 `me.html` 也应基于线上文件仅更新本任务脚本版本标记。正式与登记的测试 H5 同步发布并读回；共享后端说明共用关系。平台构建和发布仍执行既有独立分支、提交与工作区检查，不能把其他任务在途界面一并发布。

发布后的必验项目：匿名只读已发布教程、未授权维护被拒、发布/下架、上传截图、真实反馈引用保存与用户本人读取。真实发送通知须使用已授权的验收反馈，不能给现有客户发送测试消息。


## 正式与测试回读

| 端口 | 源码与发布结果 |
| --- | --- |
| 平台正式站 | `d4426572`；release `20261104070445-d4426572`；`npm ci`、正式生产构建通过；45个文件SHA-256全部回读一致 |
| 服务号正式 | `/service-account-h5/`：只更新教程三文件、`service-personal.js`及`me.html`脚本版本；五文件HTTP200，摘要与拟发布文件一致 |
| 服务号测试 | `/preview/service-account-h5/`：分别基于其线上原文件做同一差量；五文件HTTP200，摘要一致 |
| 共享后端 | `manageTournamentCenterContent`、`webLoginApi`均Active/Available；共用正式后端，无另建或覆盖测试函数 |
| 教程数据 | `service_tutorials`；客户端规则 `{read:false,write:false}`；维护仍由平台负责人接口控制 |

平台没有另行登记的独立测试域名，本任务未臆造平台测试部署目标。H5两端分别保存线上差异；源码追溯为功能提交加各自下载的线上基线，而非将当前含其他任务改动的工作区整包上线。共享后端亦以刚下载包为基线，只新增教程模块及必要入口、反馈投影字段。本次没有将平台长期分支整分支合入main/preview。

匿名接口实测：草稿不可读、非法ID被拒、无会话教程管理被拒；临时公开快照可读且不泄露草稿和操作者；下架后不可读。正式/测试阅读页在390×844浏览器尺寸下均无横向溢出、无页面运行错误。临时记录 `tutorial_4b1eb8a0-5cd1-4eb0-ae56-7772db527c26` 已删除，按releaseCheck条件回读为空。未使用真实客户反馈发送通知；负责人真实会话下的首次制教程、截图上传与微信内接收通知仍属于实际使用验收，不把离线模拟和公开阅读检查描述成这些流程已实测。

## 依赖回读与限制

两项函数继续保持InstallDependency=TRUE及发布前运行时、内存、超时、环境变量配置。`webLoginApi`实际拟上传包和回下载包均通过裁判表与报名Word上传防回退检查；业务及运行依赖文件一致，仅`node_modules/.package-lock.json`有30项license元数据差异，无版本变化。

`manageTournamentCenterContent`云端自动安装带来4项间接依赖版本变化：follow-redirects 1.16.1→1.16.2、semver 5.7.2→5.7.3、url内部qs 6.16.1→6.17.1、@types/node 26.6.5→26.6.6。根lock及兼容shrinkwrap试验未能保持旧版本；这些试验文件已移除，没有写入仓库或最终包。完整原依赖包的COS更新试验因云端代码包权限失败，旧Available版本仍可用；随后通过正式CLI重发并回读为Active/Available。没有改变InstallDependency开关以规避检查。

对上述运行依赖完成26项兼容检查，覆盖有效版本范围匹配、URL查询解析、HTTP重定向及wx-server-sdk模块与事务入口加载，结果通过。这些检查不等同于完整生产流量回归，也不宣称原依赖字节完全一致。发布证据保存在忽略目录`work/tutorial-release-20261104/`。

平台发布期间仅暂存其他任务的两份球员卡文件和共享导航改动；发布源严格使用HEAD加教程功能，发布后已恢复原内容，隔离stash保留作备份。未将球员卡在途改动发布。

## H5资源摘要

| 路径 | SHA-256 |
| --- | --- |
| `service-account-h5/tutorial.html` | `60da701c4382bb8a711e0544d638f0f1392adc75d50d090d523c34492dceed19` |
| `service-account-h5/tutorial.js` | `f8c91db06f9d3e41d672dd2438f8940f51e0a6d4229a87b8a05a5d239b426f20` |
| `service-account-h5/tutorial.css` | `b75b804d81d17d5a098b3c76bbe0f2c7d3ae7e0eff474dd644fd6ae9cbfe71b8` |
| `service-account-h5/me.html` | `91fffdecd4128e68c56907822c13fa98b7a415c02389d0e0d599b0d67ac41b33` |
| `service-account-h5/service-personal.js` | `52c84d5db058fe6b51bc476482b0f2845b52e5b7bf73a1046908ffad96e3f77b` |
| `preview/service-account-h5/tutorial.html` | `60da701c4382bb8a711e0544d638f0f1392adc75d50d090d523c34492dceed19` |
| `preview/service-account-h5/tutorial.js` | `f8c91db06f9d3e41d672dd2438f8940f51e0a6d4229a87b8a05a5d239b426f20` |
| `preview/service-account-h5/tutorial.css` | `b75b804d81d17d5a098b3c76bbe0f2c7d3ae7e0eff474dd644fd6ae9cbfe71b8` |
| `preview/service-account-h5/me.html` | `e5cf3abdeb82e5be89b7d3499561a484347271b55bc68afbafeb27f990f1960d` |
| `preview/service-account-h5/service-personal.js` | `5d1a7c5fecdcaef4985fe8be20eec6da52c35fd71254eeed911eccb27aa99afe` |
