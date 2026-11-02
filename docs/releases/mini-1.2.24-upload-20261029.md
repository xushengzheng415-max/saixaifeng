# 小程序 1.2.24 / 1.2.25 开发版上传记录（队徽裁剪与去背景 + 主包瘦身）

- 日期：2026-10-29，Asia/Shanghai。
- 授权：用户指令「上传体验版」，据此上传小程序新版本。
- 目标：球队端小程序 `wx57164cca8676f411`，先后上传 `1.2.24`（队徽裁剪与去背景）与 `1.2.25`（同一功能 + 主包瘦身）。
- 结果：微信开发者工具 CLI 两次均返回 `✔ upload`，回执 `work/upload-1.2.24-info.json`、`work/upload-1.2.25-info.json`。**1.2.25 为当前最新开发版**。

## 包体

| 包 | 1.2.23 | 1.2.24 | **1.2.25（当前最新）** |
|---|---|---|---|
| TOTAL | 3,993,704 | 3,998,521 | 3,912,185 |
| main | 2,045,363 | 2,050,180 | **1,963,844** |
| `/packageA/` | 50,324 | 50,324 | 50,324 |
| `/packageDiscover/` | 392,496 | 392,496 | 392,496 |
| `/pages/match/` | 153,341 | 153,341 | 153,341 |
| `/pages/team/` | 826,699 | 826,699 | 826,699 |
| `/pages/tournament/` | 525,481 | 525,481 | 525,481 |

1.2.24 主包 2,050,180 B ≈ 2002.1 KB，余量仅约 46 KB。1.2.25 主包 1,963,844 B ≈ 1917.8 KB，**余量约 130 KB**。五个分包在三个版本间逐字节相同，所有增减都发生在主包。

## 主包瘦身（1.2.25）

主包超限风险来自 `images/runtime`（761 KB）。逐文件核对引用（`.js/.wxml/.wxss/.json` 全文检索文件名，并排除动态拼接目录 `images/icons/` 与 `images/runtime/guest-experience-v1/`）后，确认 4 张图在全部源码中**零引用**，加入 `project.config.json` 的 `packOptions.ignore`：

| 文件 | 大小 | 说明 |
|---|---|---|
| `images/runtime/discover/hero-create-bg.jpg` | 42,688 | 属于已删除的 `pages/discover/record/` 旧版素材，现存页面无引用 |
| `images/runtime/discover/hero-record-bg.jpg` | 22,910 | 同上 |
| `images/runtime/team-card-bg-v1-lite.jpg` | 14,062 | 现有海报/球员卡代码均未引用 |
| `images/runtime/icons/brand-v1-tab-growth.png` | 6,676 | 底部导航已无「成长」项 |

合计 86,336 B，与主包减少量（2,050,180 → 1,963,844）完全一致。

- 仅从**打包**中排除，源文件仍保留在仓库，未删除、未移动，可随时回滚。
- 动态拼接已单独核对：`components/guest-experience/content.js` 用 `imageRoot + 名称 + '.jpg'` 拼 14 张效果图、`feature.icon` 用 `'/images/icons/' + 名称 + '.svg'`，这两个目录整体保留，不参与「零引用」判定。
- 若后续任何页面重新引用上述 4 张图，必须先删除对应 `packOptions.ignore` 条目，否则运行时会取不到图。
- 另有两张此前已排除且仍无引用的 `images/runtime/discover-adult-bg.jpg`、`images/runtime/discover-youth-bg.jpg`。

## 本次内容

三个队徽入口统一走「正方形裁剪 → 本地去背景 → 原图与透明图各上传一次」：

- `miniprogram/utils/logo-cutout-core.js`（新增）：纯像素算法，沿用 PC `web-admin-vue/src/utils/whiteBgRemover.js`——边缘采样推断背景色、四邻域泛洪只标记与外边缘连通的背景、恢复被轮廓包住的内部白色；阈值 240 / 容差 60。
- `miniprogram/utils/logo-cutout.js`（新增）：Canvas 2D 封装，输出 600×600 PNG；去背占比 `<0.4%`（未识别出背景）或 `>92%`（整图背景）时只保留原图；透明图与源图同目录，命名 `team-logos/original/{id}.png` 与 `{id}-transparent.png`。
- `components/quick-create-sheet`：选图后自动裁剪去背，新增隐藏画布 `#teamLogoCutout` 与 `logoHintText` 提示。
- `pages/guide/team-info/team-info`、`pages/onboarding/onboarding`：删除旧 `createCanvasContext` 裁剪与 `imageProcess.removeBackground` 调用，改走统一模块，画布改为 `type="2d"`。
- 失败路径统一：Canvas 2D 不可用或取像素失败时回退原图直传，并如实显示「已保留原图（未识别出背景）」。

`config/release.js` 版本号 `1.2.23` → `1.2.24` → `1.2.25`，`releaseDate` `2026-10-29`，标题「队徽上传裁剪与去背景」，版本日志新增一条分节。

> 与 1.2.23 一致，小程序工作区其他会话未提交的改动同样进入本次包；本次只上传，未改动云函数、业务数据库或其他端口。

## 上传链路

正式仓库路径下 CLI 曾停在编译初始化（1.2.23 已记录），本次沿用「从正式仓库复制独立上传目录」的做法：

- 上传源：`work/mini-upload-1.2.24`、`work/mini-upload-1.2.25`（`miniprogram/` 全量 + 精简 `project.config.json`，保留同一 AppID、`miniprogramRoot` 与 `packOptions.ignore`）。
- 逐文件 SHA-256 对照两次均 **658/658 一致**，清单存 `work/upload-1.2.24-source-manifest.json`、`work/upload-1.2.25-source-manifest.json`。
- 命令：`cli.bat upload --project 'work/mini-upload-1.2.25' -v 1.2.25 -d "队徽上传统一走裁剪与本地去背景；主包剔除未被引用的旧素材约84KB" -i work/upload-1.2.25-info.json`。
- 1.2.25 首次上传失败：生成上传用 `project.config.json` 时用了 PowerShell 5 的 `Set-Content -Encoding UTF8`，写出 BOM，CLI 报 `code 10 / 请检查 project.config.json 是否存在及是否有效`、`Using AppID: undefined`。改用 `[IO.File]::WriteAllText` + `UTF8Encoding($false)` 去 BOM 后同一命令上传成功。今后生成该文件必须用无 BOM 写法。

## 验证

- 168 个小程序 JS 文件 `node --check` 全部通过。
- `node tools/test-logo-cutout-core.cjs` → PASS（白底/彩色底/内部白色保护/透明白恢复/满图不误删）。
- `node tools/check-team-crest-flow.cjs` → PASS（三入口统一走 logo-cutout，WXML 标签配对与表达式限制合规）。
- `node --check miniprogram/config/release.js` 通过，`version` 读回 `1.2.25`、分节 38 条、首条「队徽裁剪与去背景」。
- 零引用核验：对全部 `.js/.wxml/.wxss/.json` 检索文件名，4 张待排除图命中 0；`packOptions.ignore` 现 6 条，JSON 解析通过。
- 上传回执包体与上表一致，主包减少量与排除文件体积完全对得上（86,336 B）。

## 体验版状态与边界

- 开发者工具 CLI 命令清单中只有 `upload`（上传开发版），**没有设置体验版的命令**；`cli.bat --help` 实测仅有 upload / preview / build-npm / auto 等，无 trial 相关入口。
- 上传结果是开发版 1.2.25。**用户已于 2026-10-29 在微信公众平台把该开发版设为体验版**；该操作在后台完成，我方无后台版本读取权限，体验版指向以用户确认为准，不以上传成功代替体验版生效。
- 未提交审核、未发布正式版；未部署云函数、未写业务数据库、未改动其他端口。
- 真机验收仍待现场：600×600 Canvas 2D 处理耗时、非正方形图片裁剪手感、弱网与失败回退提示、透明 PNG 在球队列表/报名快照/球员卡中的显示。
- 若主包后续还要扩容，下一步才考虑对 `images/runtime` 里仍在使用的 5 张大图（`home-stadium-v4.jpg` 90.9 KB、`login-bg.jpg` 66.6 KB、`home-roles-emerald-stadium-v1.jpg` 65.7 KB、`transfer-announcement-stadium-v1.jpg` 50.7 KB、`organizer-home-stadium-v2.jpg` 48.2 KB）做压缩或迁入分包，那会改变视觉观感，需单独确认。
- `cloudfunctions/imageProcess` 因本次改造已无调用方，且线上未配置 `HUNYUAN_API_KEY`，建议后续单独授权后下线（本次未动）。
