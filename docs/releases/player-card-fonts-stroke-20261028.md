# 球员卡字体、描边与铜色渐变（2026-10-28）

状态：本地实现与隔离验证完成；未发布，未激活模板，未发卡。

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

平台界面已有正式发布授权；新增字体的保存、读取和导出需要共用云函数同步，依 AGENTS.md 共用后端单独授权规则，当前等待本任务云函数发布授权。不能只部署前端选项而让正式保存拒绝新字体 ID。

获授权后：先下载最新 webLoginApi、getMiniWorkspace、playerCardPublishWorker，按上述文件及新增字体作最小差量；对实际包执行裁判表防回退检查与相对依赖检查，保留环境配置和实际依赖。先准备平台字体资源，再同步后端及相应客户端，依端口既有流程构建/发布/读回并记录提交、HTTP/文件摘要。小程序新字体映射需要对应开发/体验版本验证，不能将源码同步视作现网生效。旧客户端的具体 fallback 需在正式发布前核实，禁止静默以普通黑体冒充所选字体。

源码目录当前存在其他任务修改；不得整包上传，不得将这些修改混入本次交付。同步工具全量 `--check` 在本次开始时未建立基线；getMiniWorkspace/playerCardReader.cjs 与 webLoginApi 的同期差异不属于字体改动，本次没有覆盖该差异。
