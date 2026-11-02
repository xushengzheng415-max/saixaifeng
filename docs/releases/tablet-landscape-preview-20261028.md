# vivo Pad3 Pro横屏适配：测试版发布

2026-10-28，用户明确授权「发布测试版，供平板验收」。目标仅为`https://www.sxffootball.cn/preview/admin/`，正式后台未发布。

## 源码与整合

- 预览基线：`241b48dd3a5f6593530862fd19cb08fb83010658`。
- 功能分支：`codex/tablet-landscape-20261028`，最终功能提交`d2b843a336759b42b15fd29fa033d3bd5cce0ac4`，已推送Gitee。
- 预览集成提交：`95dc6e7b8efa39a952846e14c6188d04bbce51d3`，已以非强制快进推送Gitee`preview`，包含原预览基线的所有内容。
- 仅引入本次6个产品文件的最小补丁，加本地检查工具和交接文档，保留预览已有功能。工作区仍在原`codex/platform-ops`，未切换、重置、暂存或提交其他任务的工作区改动；占用本地`preview`的其他工作区未被更改。
- 使用独立临时Git索引从预览基线生成版本化功能/集成提交。构建源码由正式仓库的该集成树导出到仓库内`.codex-artifacts/pad-preview-20261028/`，没有用脏工作区整包构建覆盖测试端。6个产品文件与集成提交中的Git对象逐字节核验一致。

## 构建与横屏检查

- 前端依赖清单及锁文件与原工作区相同，复用同一已安装依赖，不升级产品依赖。
- 在导出的预览集成源码上重新构建，`VITE_APP_BASE=/preview/admin/`；入口及资源均使用该基路径。现有赛报背景引用和大分包警告仍存在，构建成功。
- 在该源码上重新执行Android触控样例检查：1548×1032 CSS、2倍密度对应3096×2064物理像素，另测1280×800横屏。赛事空间、控制台、球队、比赛管理、设置、比赛详情共12组合通过；菜单授权项目一致，时间标签点按、弹窗边界、桌面1440px对照通过。
- 本地检查使用DEV专用隔离样例，CloudBase请求被阻断；没有创建或修改真实账号、球队、赛程、名单或赛果。CommonJS兼容变换只用于本地检查服务器，未修改共享比赛算法或生产构建配置。

## 发布及线上读回

通过足球CloudBase启动器发布`preview/admin/`，405个静态文件上传成功，资源先传、`index.html`最后传；未清理远端其他文件。

- `/preview/admin/`和`/preview/admin/index.html`均HTTP200，入口SHA-256均为`e8d216bed3bc3533510b8fb2a541671fbcb7bba356512a886048e4e2ac684442`，与本地一致。
- 11个关键入口、脚本与样式逐文件回下载，SHA-256全部一致，包括`index-BSm-Va5M.js`、`index-GOvFlNck.css`、`LayoutView-BnHlTZaz.js`、`LayoutView-CqXLfgj3.css`、比赛详情和赛程模块。
- `/admin/`仍HTTP200，发布前后SHA-256均为`b75b7ffc65cc10eb7cc35ea8999cf2d929706bc6a714d341c326c339bc124163`；正式入口未改动。
- 真实测试地址以Android横屏触控仿真打开，登录页及微信二维码框正常，1548×1032视口没有整体横向溢出。未以虚假登录态访问线上私有业务页；业务页面通过上面的隔离样例复验，实际vivo设备与真实授权账号仍由用户验收。

构建与回读清单在`output/tablet-landscape-20261028/release-commits.json`、`release-assets.json`、`online-result.json`、`online-ui.json`及`result.json`。登录二维码截图仅作本地检查，不归档到知识库。

## 平板验收

在vivo Pad3 Pro上用浏览器横屏打开`https://www.sxffootball.cn/preview/admin/`，使用原账号登录。重点看菜单收放、组别筛选、球队/名单、赛程时间编辑和弹窗。测试前端共用正式后端，保存、审核等写操作仅使用明确测试赛事与测试数据。

当前仅测试发布，没有合并`main`、发布正式`/admin/`、重传Windows客户端、小程序、H5或云函数，也没有迁移数据库。功能分支保留，待后续验收和正式流程完成后再按规则清理。
