# 教程知识库与反馈引用（2026-11-04）

## 当前状态

本地实现并验证，未提交、未推送、未部署。没有创建生产集合、写入客户反馈或发送通知。离线截图与测试中的教程均为验收示例，不是正式客户教程。

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

## 待授权发布范围

共享云函数 `manageTournamentCenterContent` 与 `webLoginApi`、新增私有集合 `service_tutorials`，以及平台界面、服务号 H5 对应文件。平台界面有既有发布授权；共享云函数、集合和服务号发布按 AGENTS.md 另行获得当前任务授权后执行。

发布时必须下载最新线上函数包，只合入本任务差量并保留依赖与配置。实际 `webLoginApi` 上传包、回下载包均执行 `check-referee-backend-package.cjs`（包含报名上传防回退检查）。禁止使用当前含其他任务未提交改动的整包覆盖生产。服务号 `me.html` 也应基于线上文件仅更新本任务脚本版本标记。正式与登记的测试 H5 同步发布并读回；共享后端说明共用关系。平台构建和发布仍执行既有独立分支、提交与工作区检查，不能把其他任务在途界面一并发布。

发布后的必验项目：匿名只读已发布教程、未授权维护被拒、发布/下架、上传截图、真实反馈引用保存与用户本人读取。真实发送通知须使用已授权的验收反馈，不能给现有客户发送测试消息。
