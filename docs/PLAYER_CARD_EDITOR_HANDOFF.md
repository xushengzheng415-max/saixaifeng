# 球员卡系统接入交接

更新：2026-10-01。状态：已确认的接入合同与候选实现交接；不是接口或功能已正式上线的证明。

## 开发者先读

- [球员卡套件统一规范](PLAYER_CARD_INTEGRATION.md)：系统目标、统一渲染、发布切换、权限和跨端一致性。
- [积分与权益](data-center/PLAYER_CARD_POINTS.md)：服务端正式积分、等级和 100 分高级权益。
- [当前状态](CURRENT_STATUS.md)、[数据发布记录](data-center/RELEASE.md)：确认实际已部署接口和端口。

修改球员卡显示、编辑、制卡、分享、导出、模板或卡种时，先读上述文档。接入前确认服务端入口已经部署；文档中的候选 action 不得作为接口已上线的依据。

## 后台与球员的编辑范围

平台负责人管理卡种、背景、黑白遮罩、字段位置与样式、默认人物构图。首版素材画布为 300 × 430，每种模板是一张背景 PNG 和一张同尺寸黑白遮罩 PNG，单张不超过 2 MB。

球员或获授权监护人仅调整标准形象照的大小和位置。文字、国籍旗帜、球队队徽的模板坐标由平台后台控制；资料事实更正走原资料和审核流程。不得在球员编辑页开放姓名、号码等文字的模板排版修改。

后台文字配置键为 number、position、name、jerseyName、height、weight，配置 X/Y、字号、字重、颜色；国籍与队徽配置中心 X/Y 和尺寸。人物配置中心 X、纵向 Y 和缩放。可见性、层级及额外字段由统一受控模板合同扩展，不能只在某一页面增加。

首版基础卡种为 bronze、silver、gold。限定卡规则未确认，不能由页面按生日、赛事名或奖项字符串发放。等级、积分和换照片/背景权益均取服务端核定结果，不用年龄、手填场次或卡面颜色推断。

## 遮罩与正式成卡

绘制顺序：背景 → 标准透明人物 → 按遮罩复绘背景前景 → 文字、国籍与队徽。

黑色遮住人物，白色透出人物。灰色按亮度处理边缘；背景和遮罩共用像素坐标。不要把黑白遮罩直接叠为可见图层。后台最终预览、球员最终预览、保存和批量更新须使用同一正式渲染器。

成卡是完整图片。PC、H5、小程序、列表、详情、阵容、分享和导出只读取成卡并等比缩放，不能在调用页再绘制人物、模板或文字。

## 调用合同

调用方传稳定 playerId、业务上下文和授权会话。服务端根据权限读取资料、标准形象照、当前卡种和活动模板，不接受客户端提供的积分、等级或身份事实。

成功返回至少包含：
- status：ready、unavailable、pending、failed、forbidden 中的明确状态。
- cardUrl：ready 时可用的完整成卡地址。
- playerId、cardTypeId、templateId、publishedVersion。
- cardDataVersion、renderVersion；生成时间和文件摘要供发布核对。
- 需展示时返回获授权的服务端积分、真实等级及权益。

没有成卡不默认铜卡；生成中、读取失败和无权分开显示。签名地址只用于临时展示，不持久化到业务资料。页面重新进入、重新可见或收到版本变化后重新读取；缓存键含球员、卡种、活动模板版本、数据版本及授权范围。

网页继续通过现有 webLoginApi HTTP 入口调用，沿用项目会话。小程序通过其授权读取适配器调用。公开页须有明确公示范围；私有成卡读取接口和临时地址不能因为榜单公开而自动转为公开。

## 候选接口与代码定位

以下是本次隔离候选实现中的名称，服务端入口注册、真实事务与权限测试、部署回读仍待完成；页面接入者须先核对发布记录。

| 能力 | 候选入口 |
| --- | --- |
| 后台列表与详情 | listPlayerCardTemplates、getPlayerCardTemplate |
| 保存草稿 | savePlayerCardTemplate，携带 revision |
| 发布、分批更新 | publishPlayerCardTemplate、continuePlayerCardTemplatePublish |
| 发布进度、失败重试 | getPlayerCardTemplatePublishStatus、retryPlayerCardTemplatePublish |
| 活动模板只读 | getActivePlayerCardTemplate，携带卡种 |
| 授权 PC 成卡读取 | getPlayerCardForViewer |
| 本人或监护人读取 | listMyPlayerCards、getMyPlayerCard |
| 正式预览与保存 | previewMyPlayerCard、saveMyPlayerCard |
| 小程序完整成卡读取 | playerCardRead 云函数 |

候选代码位置：
- 后台编辑器：web-admin-vue/src/views/tournament-center/PlayerCardTemplateLibrary.vue。
- 模板、发布、渲染：cloudfunctions/webLoginApi/playerCardTemplates.cjs、playerCardPublish.cjs、playerCardRender.cjs、playerCardSuite.cjs。
- 授权消费：playerCards.cjs、playerCardsAdmin.cjs、playerCardAccess.cjs；小程序 cloudfunctions/playerCardRead。
- PC 显示组件：web-admin-vue/src/components/player/PlayerCard.vue。
- H5 编辑和调用：service-account-h5/player-card-editor.js、player-cards.js、app.js。

候选代码还在 codex/player-card-global-publish 的本地隔离工作树，尚未整体合入 main。文件名和接口名用于交接定位，不构成可调用承诺。页面提交完成后需更新入口登记和发布记录。

## 保存与发布时序

保存草稿只更新草稿、素材引用和修订号，页面保存后重新读取服务端草稿。并发修订冲突提示重新加载，不静默覆盖。

发布创建不可变版本和待激活任务，使用保留的标准形象照、裁剪、受控资料及服务端资格重制所有受影响成卡。全部生成并校验成功后，事务切换活动指针。切换前所有读取继续使用上一完整版本；有失败就阻止整体激活，后台显示数量、对象与原因。

pending 只能提示更新进度；blocked 提示待修复并保留旧活动版本；完成激活并回读版本后才能提示“已生效”。任务须能在刷新、网络中断和服务端重试后继续；新制卡或资料变化与发布并发时，不能遗漏新卡或激活旧资料版本。旧图片和不可变版本保留，回滚走受控版本操作。

候选集合名称为 player_card_templates、player_card_template_versions、player_card_template_states、player_card_publish_jobs、player_card_renders。历史 players.playerCardFileId 是迁移线索；完整成卡正式读取须服从活动版本，不能永远直读旧文件引用。

## 各端页面接入

后台添加“球员卡模板”入口，提供上传、字段调整、同源最终预览、保存、发布进度和失败队列。发布后的模板只改外观，不改球员事实和积分。

球员详情、阵容和列表统一调用成卡读取。卡内保持固定比例，周边按钮和页面布局可响应屏幕尺寸。球员个人编辑仅调整人物构图，最终预览和保存调用正式渲染器。

H5 登记首卡与“我的球员卡”使用同一套服务。小程序旧 identity_cards 若没有稳定 playerId，显示未关联，不能按姓名补关联或根据页面积分生成另一张卡。

## 验收与上线登记

2026-10-01 全平台接入修订已完成源码与正式网页部署：现行服务端活动指针、统一 PNG、名单初始源及首次标准照补齐规则见 PLAYER_CARD_INTEGRATION.md 和 data-center/INTEGRATION.md。部署时从最新线上函数和 H5 包差量接入，保留已在线的积分应援账本、空间生命周期、阵容及账户转移配套模块；不恢复为旧 main 函数包。小程序 1.0.34 已上传开发版，不能据此称微信正式版已生效。最新生成数量及校验见 data-center/RELEASE.md。

验收草稿刷新保持、黑白遮罩方向、铜银金字段、人物大小位置、权限与积分权益、无卡/生成中/失败/无权、模板失败阻断、新卡与旧卡统一切换、资料变化和发布并发、任务中断恢复、回滚。

同一球员在 PC、H5、小程序及分享/导出中应返回相同活动版本和成卡文件内容。记录模板版本、受影响数、成功数、失败数及文件摘要；线上代码或文档合并不代替实际运行回读。

2026-10-01 只读审计曾确认：线上铜银金底图与仓库对应素材一致；当时未建立模板集合，已保存个人成卡和标准形象照记录均为 0。该快照发布前必须重查。

候选后台初版构建、部分脚本语法及样例 PNG 合成已验证。整套云函数入口、真实事务/权限、跨端消费、版本切换和正式发布仍未完成验证。小程序开发包、体验版、审核与正式版分别登记。不要把本交接文档发布称为系统上线。


## 2026-10-01 本地候选补充

预装按全平台／指定球队／指定赛事／指定球员添加到 H5 卡库，不能覆盖既有基础卡。具体对象名称与稳定 ID 同时可见。同一范围支持多个模板并存，按模板独立更新；球员主动选择展示卡。卡库接口、集合、授权与实际未发布边界见 PLAYER_CARD_TEMPLATE_LIBRARY.md。文字样式合同和字体来源见 PLAYER_CARD_TEXT_STYLES.md，最终预览与保存使用统一渲染器。

## 2026-10-01 预览固定与遮罩裁切

正式 PC 编辑器的排版预览固定在右侧并以视窗高度垂直居中，窗口缩小时等比缩放；右下角显示/隐藏按钮不改草稿，隐藏再显示保留预览和参数。拖动按 animation frame 合并更新，结束/取消/卸载均释放监听；素材缓存最多 12 组，参数修改不重新合成遮罩。旧资料缺少徽标字段时补默认值，避免编辑器渲染报错。

人物层在固定 300×430 卡面坐标内应用黑白遮罩。前端转换为白色 alpha PNG，服务端 SVG 使用同一亮度×alpha 规则，灰色只渐隐一次；不再依靠透明背景复绘来隐藏人物。用户提供的遮罩2.png 黑色底部像素、白色区域与灰色渐隐均以原生 PNG 输出验证，透明背景情况下不会露出裤子。

本地浏览器实际滚动 976 px 后预览中心仍为视窗中心 360/720 px；隐藏时改字号 40，再显示后保留，截图在正式仓库 work/card-editor-mask-qa/editor-centered-mask.png。正式 PC 入口 index-B38LQGSL.js 和平台分包 TournamentCenterAdmin-PjmM5HT2.js HTTP/摘要回读一致；webLoginApi 和 playerCardPublishWorker 渲染模块 ZIP 摘要匹配。字体、渐变、描边与排版方案保留；既有模板/草稿和照片没有自动改写或激活。新成卡按保存/发布流程应用修复。
