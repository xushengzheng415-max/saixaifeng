# 赛小蜂足球专属图标资产目录

> 状态：已确认资产；最后更新：2026-08-22
> 视觉规范与使用边界见 [`ICON_SYSTEM.md`](ICON_SYSTEM.md)。

## 一、视觉方向

两套图标均由 `oil-icon` 工作流生成，使用同一 `football-brand-v1` 构造体系：

- 深翡翠绿圆角主描边：`#087A48`；
- 淡薄荷绿填充：`#EAF7EE`；
- 克制的琥珀橙强调：`#F6A019`；
- 正视、扁平、圆角、统一留白；
- 使用足球面板、球场角线、奖杯或战术板作为品牌母题；
- 主描边必须重于填充和橙色强调，禁止黑色大面积填充。

## 二、V1：小程序五中心导航

- 生成日期：2026-08-11；
- 状态：产品负责人已批准；
- 原始 4×4 图标表：[`football-brand-v1-sheet.png`](prototype-assets/miniprogram-source-20260815/icon-source/oil-icon/football-brand-v1/football-brand-v1-sheet.png)；
- 透明切图与说明：[`football-brand-v1/`](prototype-assets/miniprogram-source-20260815/brand-spot/football-brand-v1/README.md)；
- 运行目录：`miniprogram/images/runtime/icons/brand-v1-tab-*.png`；
- 交互规则：选中态使用原图全透明度，未选中态使用同一张图降低透明度，不另画第二套图标。

| 语义 | 透明切图 | 小程序运行文件 | 使用位置 |
|---|---|---|---|
| 首页 | `tab-home.png` | `brand-v1-tab-home.png` | 底部首页、品牌空态 |
| 赛事 | `tab-event.png` | `brand-v1-tab-event.png` | 底部赛事、赛事场景 |
| 球队 | `tab-team.png` | `brand-v1-tab-team.png` | 底部球队、球队空态与兜底 |
| 青训 | `tab-training.png` | `brand-v1-tab-training.png` | 底部青训、青训场景与兜底 |
| 我的 | `tab-profile.png` | `brand-v1-tab-profile.png` | 底部我的、头像兜底 |

## 三、V2：赛事协作与状态图标

- 生成日期：2026-08-12；
- 状态：灰底原图、透明切图和洋红底 QA 均已保留；
- 原始 4×4 图标表：[`football-brand-v2-sheet.png`](prototype-assets/miniprogram-source-20260815/icon-source/oil-icon/football-brand-v2/football-brand-v2-sheet.png)；
- 512px 透明切图与说明：[`football-brand-v2/`](prototype-assets/miniprogram-source-20260815/brand-spot/football-brand-v2/README.md)；
- 256px 运行源：`docs/prototype-assets/miniprogram-source-20260815/runtime-icons-256/`；
- 小程序运行目录：`miniprogram/images/runtime/icons/brand-v2-01.png` 至 `brand-v2-16.png`。

| 编号 | 语义 | 建议场景 |
|---|---|---|
| 01 | 赛事日历 | 赛事入口、赛程、组别、加入赛事 |
| 02 | 奖杯 | 比赛成果、历史赛事、数据权益 |
| 03 | 正式名单 | 名单审核、资格检查 |
| 04 | 重点球员 | 阵容球员、球员亮点、个人档案 |
| 05 | 通知铃 | 消息空态、提醒 |
| 06 | 微信邀请 | 微信协作、分享邀请 |
| 07 | 邀请二维码 | 二维码邀请、家长协作 |
| 08 | 成员邀请 | 添加管理员、教练或协作成员 |
| 09 | 已通过 | 创建成功、审核通过、完成状态 |
| 10 | 待处理 | 等待审核、等待比赛、处理中 |
| 11 | 球队阵容 | 球员库、阵容与多人空态 |
| 12 | 球员身份 | 实名、资格、认领冲突 |
| 13 | 文档任务 | 资料完善、名单任务、待办 |
| 14 | 裁判哨 | 裁判任务、比赛执行 |
| 15 | 战术板 | 训练、阵容、赛事设置 |
| 16 | 球场与足球 | 比赛、数据总览、足球场景 |

## 四、生产使用边界

可以使用 PNG 专属图标的场景：

- 46px 及以上的品牌导航、场景入口、成功页、功能卡片、空状态和状态插图；
- 已明确批准使用 V1 的小程序五中心底部导航；
- V2 中与页面语义完全对应的赛事协作、邀请、名单、阵容、状态和任务插图。

必须继续使用共享 SVG 的场景：

- 16–24px 的密集功能控件；
- 搜索、返回、通知角标、锁、警告、表格工具等需要清晰识别的小图标；
- 没有准确语义对应的功能，禁止仅因颜色相近而硬套 PNG。

## 五、本次小程序替换台账

- 底部导航：首页、赛事、球队、青训、我的全部改用 V1 PNG；
- 首次使用引导：赛事、球队、青训三种场景入口改用 V1 PNG；
- 创建完成：成功标识改用 V2-09，资料、成员、赛事/训练动作改用 V2-13、08、01、15；
- 消息中心空态改用 V2-05；
- 首页无机构 Logo 的总览插图改用 V2-16；
- 球队空态、球队 Logo 兜底改用 V1 球队图标；
- 球员库空态改用 V2-11；
- 小型状态、锁、风险、通知和列表控件继续使用共享 SVG。

## 六、治理要求

- 任何新图标优先查询 `miniprogram/images/icons/manifest.json`；
- 原始图标表、透明切图、运行时缩放版本和语义清单必须同时保留；
- 页面不得从原型 PNG 裁切图标，不得在页面目录复制同一图标；
- 新一批图标必须沿用本文件的色板与构造体系，并完成切图及对比底 QA；
- 小程序运行资产改变后必须执行 WXML 扫描、JavaScript 语法检查和开发者工具预览编译。
