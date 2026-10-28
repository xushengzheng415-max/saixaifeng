# 球员卡字体、描边与铜色渐变（2026-10-28）

状态：2026-10-28 已获本任务共用云函数发布授权。平台正式页面与三个函数已更新；发布读回记录见末节。未激活模板、未发卡。

## 最终行为

- 中文新增阿里妈妈数黑体、微软简综艺、微软简粗黑、汉仪雅库黑，保留标准黑体与毛笔楷体。旧 GBK 字体补 Unicode 映射，避免中文变成空白或回退；字形和原 fsType 保留。
- 球衣号码新增 Graduate、Jersey 25、Black Ops One，保留 Anton。GitHub 来源及 OFL 随字体保存；用户提供字体记录源文件 SHA-256，不扩展其授权声明。
- 独立文字描边开关、0–5 宽度、颜色及黑/白/金快捷描边。
- 金/银旁新增铜色渐变，亮铜→赤铜→深铜，并配置深铜描边。渐变预设保留已选字体、坐标、字号与字距。

## 源码范围

平台编辑器 PlayerCardTemplateLibrary.vue 和 playerCardFonts.js；统一合同 player-card-text-styles.json、字体 manifest、playerCardDynamic.cjs 的 family 映射；shared/player-card/draw.js 的字体映射及 H5/小程序同步副本。getMiniWorkspace 和 playerCardPublishWorker 仅准备相同字体合同、manifest、dynamic 模块和字体资产；不发布其他同期业务修改。没有修改积分、名单、授予、用户身份或机构权限。

## 验证证据

- `node tools/test-player-card-font-editor.cjs`：拦截全部云请求，实际浏览器加载 11 个字体二进制；选择中文及号码字体，铜渐变、描边切换、颜色、宽度保存并切档重读；生产写入为零。
- `node tools/test-player-card-added-fonts.cjs`：10 个字体选项均能规范化、JSON 往返；六种中文及四种号码的实际 PNG 像素摘要不同；动态 scene family 与共享渲染映射一致。
- `node tools/test-platform-card-fonts.mjs`：11 个平台本地字体资产 SHA-256 与 manifest 一致，嵌套 scene 使用平台独立域名。
- `node tools/test-player-card-text-styles.cjs`、`test-dynamic-player-card.cjs`、`test-player-card-layout-presets.cjs`：旧模板兼容、参数拒绝、描边/渐变实际输出、版本与权限回归通过。
- `platform-admin-vue/npm run build` 通过；边界检查通过，未新增浏览器 SDK。
- 截图与逐字体 PNG：`output/player-card-fonts-20261028/`。测试脚本需要本地 5176 Vite 服务。

## 发布待办及授权边界

平台界面已有正式发布授权；2026-10-28 用户进一步明确授权同步球员卡相关云函数再发布平台页面。

获授权后：先下载最新 webLoginApi、getMiniWorkspace、playerCardPublishWorker，按上述文件及新增字体作最小差量；对实际包执行裁判表防回退检查与相对依赖检查，保留环境配置和实际依赖。先准备平台字体资源，再同步后端及相应客户端，依端口既有流程构建/发布/读回并记录提交、HTTP/文件摘要。小程序新字体映射需要对应开发/体验版本验证，不能将源码同步视作现网生效。旧客户端的具体 fallback 需在正式发布前核实，禁止静默以普通黑体冒充所选字体。

源码目录当前存在其他任务修改；不得整包上传，不得将这些修改混入本次交付。同步工具全量 `--check` 在本次开始时未建立基线；getMiniWorkspace/playerCardReader.cjs 与 webLoginApi 的同期差异不属于字体改动，本次没有覆盖该差异。

## 实际发布与回读

- 功能提交 `f392d961`，字体配送源修正 `5e701f42`。平台正式版本 `20261028131644-5e701f42`，独立生产构建、45 个文件 HTTP/SHA-256 回读通过。
- 新增字体按既有 `https://www.sxffootball.cn/admin/fonts/player-card/` 配送，平台通过本地化映射使用自身域名。11 个新旧字体全部 HTTP 200 且 SHA-256 与 manifest 相同；只新增字体资源，没有替换主办方 `/admin/` 应用代码。
- 三个函数从本次刚下载的现网包制作差量，webLoginApi/getMiniWorkspace 各15个文件，worker14个文件；保留原节点依赖。裁判表防回退检查通过。最初 COS 更新因临时角色异常失败，随后通过直接代码包更新，不把失败上传当作上线。
- 三函数 Active/Available、无 CodeError；Handler/Runtime/Timeout/MemorySize/Environment/Role/VpcConfig/Layers/Type/PublicNetConfig 与发布前核对。worker 的 InstallDependency 单独设为 FALSE，随代码携带原依赖，防止自动 npm 安装升级间接依赖；不再恢复 TRUE 触发依赖重装。该项是部署依赖策略变化，环境变量、超时、内存、权限与触发器保持。
- 新字体在统一 `read` 中为旧客户端按原授权和版本校验提供完整PNG，不返回原始人物地址；`exportPlayerCardForViewer` 和小程序 `playerCardExport` 显式保留动态场景，以保持高清导出。隔离动态/兼容/导出回归通过；因此本轮无需上传现有含其他任务改动的小程序开发包，源码中的新映射留待该端下一次正常发布。
- 服务号只更新共享 `dynamic-card-renderer.js`，正式 `/service-account-h5/` 与已登记测试 `/preview/card-display/service-account-h5/` 均 HTTP 200/SHA-256 一致，共用此次正式后端；没有上传同期其他H5改动。平台按既定直接正式规则发布，没有自行新建云端测试目标。
- `PLAYER_CARD_UI_ORIGIN=https://pingtai.sxffootball.cn` 的实际线上资源检查通过：字体二进制实际解码、字体选择、铜渐变和描边；所有业务请求拦截到隔离内存库，未在生产建立测试项目或发布模板。截图 `output/player-card-fonts-20261028/live-editor-bronze-stroke.png`。
- 正式 HTTP 无会话探针：savePlayerCardTemplate、recognizeRefereeReport 均返回 AUTH_REQUIRED，没有公开写入或接口缺失。
- 完整包回下载结果保存在 `work/card-font-release-20261028/readback-verification.json`；该忽略目录仅保留诊断包与摘要，不入库。

最终回下载全部通过：webLoginApi保留7323个原包条目、getMiniWorkspace保留6556个条目、worker保留7178个条目。前两个函数仅npm隐藏锁元数据变化，worker依赖文件逐字节一致；没有缺失文件、错误差量或其他运行文件变化。worker关闭自动安装后才达到此结果，保持FALSE，不能在配置回填时再触发重装。

| 函数 | 最终 CodeSha256 |
| --- | --- |
| webLoginApi | 82274dcfa534a9d72037792ce5ae67817dde80d3b677c626ae70b389ccee7021 |
| getMiniWorkspace | 10974dcc98b1cac6168dd670bd80634e76ebc224f4946292313ed894e861cff1 |
| playerCardPublishWorker | bae1a2f1f9c33141ff0ee730816b164b4c0408e012143bdf50d4720b8f823f3f |
