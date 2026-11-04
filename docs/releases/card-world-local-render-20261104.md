# 编辑球员卡：本机合成 + 更换照片/更换卡面/拖动构图（2026-11-04）

用户在 2026-11-04 明确授权「AI 生成按次 100 滴保持不变，现在就发布」。本轮把「编辑球员卡」从
「每步等服务端出 PNG」改为「手机本机 canvas 合成」，并把卡面下方的操作收成三个按钮。

## 一、源码与提交

| 项 | 内容 |
|---|---|
| 分支 | `codex/h5-card-world-edit-20261103`（worktree `E:\Documents\sxf-football-wt-h5`） |
| 提交 | `44a20f49`（本机合成 + 三按钮 + 两选项 + 拖动构图 + 合成动画）；`0038a922`（首屏先出卡面，字体与缩略图后补） |
| 前置提交（同一分支，本轮一并上线） | `9294040c`（上传自己照片换卡面，四个 `cardPhoto*` 动作）、`e9ff2a38`（统一叫「编辑球员卡」）、`1c16a4e3`/`ce47266e`（球衣照上传、换形象照入口） |

## 二、发布目标与结果

| 端 | 目标 | 结果 |
|---|---|---|
| 共享后端 | `webLoginApi`（差量：线上包 + `playerCards.cjs` 替换 + 新增 `cardPhotoReplace.cjs` + `index.js` 补 4 个 case） | Active / Nodejs18.15 / 512MB / 120s / InstallDependency=TRUE，ModTime 2026-11-04 16:13:54，CodeSize 42,426,143 |
| 共享后端 | `aiPortraitDemo`（差量：线上包 + `index.js` 替换，球衣照与卡面会话凭证） | Active / Nodejs18.15 / 256MB / 120s / InstallDependency=TRUE，ModTime 2026-11-04 16:14:31，CodeSize 6,093,579 |
| 正式静态 | `service-account-h5/card-world` → `/service-account-h5/card-world/` | 16 个文件，逐文件 HTTP 回读 SHA-256 全部一致 |
| 测试静态 | `preview/service-account-h5/card-world-ai` | 16 个文件，逐文件 HTTP 回读 SHA-256 全部一致 |

资源版本串统一为 `?v=20261104-ai7`（`index.html`、`design.html`、`portrait.html` 三页一致）。

## 三、验证记录

- 发布前：对实际拟上传目录运行 `node tools/check-referee-backend-package.cjs`，内部登记上传检查同时通过
  （`PASS: actual backend package retains scoped registration Word uploads and denies cross-event/invalid file type`）。
- 发布后：`fn code download` 回下载两个云函数，逐文件 SHA-256 与待发布目录比对，业务文件全部一致；
  仅 `node_modules/.package-lock.json` 由云端安装重写（InstallDependency=TRUE 的既有表现，业务代码无差异）。
  回下载的 `webLoginApi` 再次执行 `check-referee-backend-package.cjs` 通过。
- 路由在线探测（`https://www.sxffootball.cn/webLoginApi`）：
  `cardPhotoInfo` / `cardPhotoPrepare` / `cardPhotoCancel` 返回 `PLAYER_CARD_AUTH_REQUIRED`（说明路由已生效），
  未知操作返回 `未知操作：…`；`aiPortraitDemo` 的 `cardPortraitPrepareReference` 返回 403 会话失效（说明卡面会话分支已生效）。
- 静态页：正式与测试两端 `index.html`、`design.html`、`portrait.html`、`js/*.js`、`css/app.css`、
  `js/dynamic-card-renderer.js`、`assets/*` 共 16 个文件，HTTP 回读 SHA-256 与本地完全一致。
- 本地：`node --check` 覆盖 `design.js`、`portrait.js`、`api.js`、`playerCards.cjs`；
  `.codex-artifacts/h5-card-edit-20261103/` 下 6 套测试全部通过。

## 四、功能结论

1. 卡面在手机本机 canvas 合成（`player-card-dynamic/1` 描述协议），拖动 60ms 节流重绘，换背景只取一次 JSON；
   字体单独 `FontFace` 加载并缓存，首屏先用系统字体出图，字体到位后重画一次；三张背景缩略图延后 220ms 本机并行生成。
2. `getMyPlayerCard` 新增 `withPortraitData:false`：编辑页不再传输最多 5MB 的 base64 形象照；默认不传时行为不变。
3. 底部三个按钮：更换照片 / 更换卡面 / 编辑构图。更换照片弹两个选项：
   相册上传或拍摄（`portrait.html?mode=upload`，服务端抠图，确认后才写卡面并计费）、
   一键形象照（`portrait.html?mode=ai`，单人照 + 球衣照合成，生成期间有合成动画）。
4. 编辑构图：直接在卡面上单指拖动、双指缩放，控制条紧贴卡面下方（缩放 / 重置 / 完成调整）；
   轻点卡面进入构图，向下滑动翻页不会误触。
5. 计费口径（用户 2026-11-04 确认）：上传自己照片满 100 分免费，未满按 100 滴蜂蜜；
   AI 生成形象照保持按次 100 滴（会员折扣），与生涯积分无关。

## 五、事故与处置

首次静态发布误用了相对路径 `service-account-h5\card-world`，CloudBase CLI 按项目根
（`E:\Documents\sxf-football`）解析，实际上传了主仓旧原型目录的 28 个文件，覆盖了正式端
`index.html`、`css/app.css`、`js/app.js`、`js/api.js`。发现后立刻改用绝对路径
（`E:\Documents\sxf-football-wt-h5\service-account-h5\card-world`）重新发布 16 个文件，
并逐文件回读 SHA-256 确认正式端已恢复为本分支版本。

## 五、旧文件清理（用户 2026-11-04 授权「执行清理」后完成）

正式端删除 20 个旧原型文件：

- 单文件 15 个：`README.md`、`落地说明.md`、`card-world.html`、`meet-anim-demo.html`、
  `css/card-world-proto.css`、`css/my-main-card.css`、`css/player-card-holo.css`、
  `js/card-world-proto.js`、`js/my-main-card.js`、`js/player-card-holo.js`、`js/portrait-entry.js`、
  `assets/pitch-3d.svg`、`assets/card-tie-dongze.png`、`assets/tie-dongze-card.png`、
  `assets/logo-saixiaofeng.png`。
- 目录 1 个（5 文件，删除前 `--dry-run` 逐项确认）：`assets/player-card-holo/**`。

测试端删除 1 个：`js/portrait-entry.js`（更早一轮就已在本地下线的旧入口脚本）。

清理后两端目录各为 **16 个文件**（与本轮源码一一对应），再执行一次 HTTP 回读：16/16
SHA-256 全部与本地一致（`ALL MATCH`）；`index.html` 7089、`design.html` 5372、
`portrait.html` 7874 字节，与本地完全相同。`css/holo-cosmos.css`、`js/holo.js` 属本轮页面仍在用的文件，保留。

## 七、追加（同日）：上传照片改竖版取景框 + 可拖动调整

用户指出「上传自己的单人照片也要能编辑图片，把图片放到合适的位置，球衣也是一样；怎么是横版的呢？
平台运营后台不是有现成的版式么」。据此把 `portrait.html` 的三处上传框从横版改为竖版取景：

- 人物照（自己上传、AI 单人照）取景框 `3:4`；球衣照 `1:1`，与平台后台「AI 形象照」的竖版预览、
  姿势预设同一竖向版式，不再横版把人物拦腰截断。
- 选完照片先进取景调整：单指拖动改位置、双指捏合 1–4 倍缩放，全部本机完成；
  人物照默认铺满取景框，球衣默认整件放进框里。
- 点「调整好了」后按当前取景框导出竖版照片（1200 宽白底 JPEG，超限自动降质），
  后续抠图/参考板上传都用这张，原图不再直传；按钮随后变为「重新调整」可再进编辑。
- 「重置」回到居中不缩放；`retryOwn` 会连同取景状态一起复原。

验证：`node --check` `portrait.js`/`design.js` 通过；6 套测试全通过，新增 15 条断言
（竖版 3:4、球衣 1:1、不再有 4:3、三个取景框与调整条、双指放大到 0.5、单指拖动改变位置、
重置回到居中、确认后退出取景并可「重新调整」、导出为裁剪图、球衣同样进入取景）；
正式与测试端各 16 个文件重新发布，HTTP 回读 SHA-256 `ALL MATCH`。

## 九、追加（同日）：换照片方式由入口决定，形象照页不再二次选择

用户反馈「都已经是一键形象照了，怎么还有一个上传自己的照片」。原因：从编辑页「更换照片」选了
「一键形象照」后进入 `portrait.html?mode=ai`，页内仍保留「上传自己的照片 / AI 生成形象照」两个页签。

- 删除形象照页的页签与 `mode-upload` / `mode-ai` 切换，`setMode` 只按入口 `mode` 显示一种流程：
  `mode=upload` 显示「上传自己的照片（自动抠图）」，其余（含卡面页旧链接）显示「一键形象照」。
- 顶部副标题与球员说明卡按方式分别改写，不再出现「两种方式都能换」的说明与另一方式的流程。
- 卡面页「换形象照」改为进编辑页并带 `photo=1`，进页后自动弹出「更换照片」的两个选项；
  「直接生成 AI 形象照」固定带 `mode=ai`；编辑页「更换照片」两个选项分别带 `mode=upload` / `mode=ai`。
- 清理 `.mode-tabs` / `.mode-tab` 样式；`portrait.html`、`js/portrait.js`、`js/app.js`、`js/design.js`、
  `css/app.css`、`index.html`、`design.html` 版本升到 `20261104-ai9`。

验证：`node --check` `app.js`/`design.js`/`portrait.js` 通过；6 套测试全通过（新增「形象照页不再有方式切换标签」
「方式只由入口 mode 决定」「页内只显示一种流程」「卡面页换形象照进编辑页并弹更换照片」「编辑页支持 photo=1」
等断言）；两端 16 文件重新发布，HTTP 回读 SHA-256 `ALL MATCH`，并线上回读确认两端均无页签、版本为 `ai9`。

## 十、追加（同日）：上传自己的照片进页直接拉起相册/拍照

用户反馈「既然是上传自己的照片直接就是读取相册或者拍照就可以」，指的是选了「上传自己的照片」进入
`portrait.html?mode=upload` 后，仍要先点一次空白取景框才会弹系统选择框。

- `portrait.html`：`#own-empty` 文案由「点这里选择照片」改为「从相册选择或拍照」；
  取景框下新增显式按钮 `#btn-own-pick`（「读取相册 / 拍照」），浏览器拦截自动弹框时可直接点它。
- `js/portrait.js`：新增 `autoOpenOwnPicker()`，进页渲染完成后 80ms 触发一次 `#own-input.click()`，
  由 `ownPickerTried` 保证同一页只尝试一次；被拦截时不影响取景框拖动与按钮点选。
  只在 `state.mode === 'upload'` 时尝试，AI 流程不自动弹框。
- `css/app.css` 新增 `.btn--full`；三个页面资源版本统一升到 `20261104-ai10`。

说明：微信内置浏览器对「页面加载即自动打开相册」有限制，若自动弹框被拦截，用户点取景框或
「读取相册 / 拍照」按钮同样直达相册/拍照，不再出现「必须先点空白框」的多余一步。

验证：`node --check` `portrait.js` 通过；6 套测试全通过（新增「上传自己的照片直接拉起相册/拍照」
「取景框提示改为从相册选择或拍照」「提供显式的读取相册/拍照按钮」等断言）；
正式 `/service-account-h5/card-world/` 与测试 `/preview/service-account-h5/card-world-ai/` 两端各 16 文件重新发布，
HTTP 回读 SHA-256 `ALL MATCH`，并线上回读确认两端版本 `ai10`、含 `btn-own-pick` 与 `autoOpenOwnPicker`、无方式页签。

## 十一、追加（同日）：上传照片抠图后确认背景图

用户要求「上传图片后应该是需要人像分割，然后确认背景图，和注册球员上传背景的流程是一样的」。
注册球员建档里，人像分割之后要在球员卡编辑器里确认「卡片背景」；换形象照页缺了这一步。

- `portrait.html`：上传方式新增「确认背景图」区块（`#own-confirm`），含卡面预览舞台 `#own-card-canvas`、
  背景选项列表 `#own-bg-list`、提示 `#own-bg-hint`；确认按钮改为「确认，用这张替换卡面」；
  引入 `js/dynamic-card-renderer.js`（与共享渲染器字节一致）。
- `js/portrait.js`：
  - `prepareOwnData` 的提示改为「正在做人像分割」，抠图成功后才显示「确认背景图」。
  - `loadCardInfo` 用 `getMyPlayerCard` 取卡级、积分、换背景权益和当前背景，不页面自算；
    `loadCardScene` 用 `previewMyPlayerCard` + `player-card-dynamic/1` 取背景描述。
  - `paintOwnCard` 用人像分割出的透明人像替换 `cardScene.assets.portrait`，本机 canvas 合成真实卡面效果
    （禁止客户端自绘 PNG，仍只做预览）。`portraitIsLayer` 卡面不出预览，给明确提示。
  - `cardGate` 与设计页同一套门禁：高于当前卡级按积分解锁、非当前背景且无换背景权益不可选；
    锁定项点选只提示，不发请求。
  - 确认链路：先 `saveMyPlayerCard` 保存所选背景（服务端再判权限），再用一次性凭证 `applyCardPhoto` 写照片；
    任一步失败回显服务端原因并保留可重试状态。重新选择照片会清掉背景选择与预览。
- `css/app.css` 新增 `.card-confirm` 分隔样式；`index.html`/`design.html`/`portrait.html` 资源版本升到 `ai11`。

验证：`node --check portrait.js` 通过；6 套测试全通过（新增 12 条「人像分割与确认背景图」断言）；
正式 `/service-account-h5/card-world/` 与测试 `/preview/service-account-h5/card-world-ai/` 两端各 16 文件重新发布，
HTTP 回读 SHA-256 `ALL MATCH`，线上回读确认两端 `ai11`、含 `own-confirm`、渲染器脚本、`paintOwnCard`、
`cardGate` 与「先存背景再写照片」链路。

## 十二、追加（同日）：卡面页删掉独立的 AI 形象照面板

用户反馈「既然有编辑路径了，这部分就不要了吧」，指的是卡面页（`index.html`）那块
「重点 · 对背景或形象照不满意？」+「直接生成 AI 形象照」大按钮。此前它绕开编辑球员卡，
和 hero 区「编辑球员卡 / 换形象照」两个入口重复。

- `index.html`：删除整个 `#ai-panel`（含 `#btn-ai-portrait`）；会员权益面板里的陈旧指引改为
  「换照片或形象照请进「编辑球员卡」用「更换照片」，可选相册上传或拍摄，也可一键形象照由 AI 生成」；
  `js/app.js` 查询版本升到 `ai11`。
- `js/app.js`：删除 `openAiPortrait()` 与 `#btn-ai-portrait` 绑定（避免空引用），保留 `gotoPortrait`
  与 `aiPortraitPlayerId`；「换形象照」仍进编辑球员卡并自动弹「更换照片」。
- `design.html`：`js/design.js` 查询版本同步升到 `ai11`（该文件本次会话已多次改动）。

验证：`node --check app.js` 通过；6 套测试全通过（把「卡面页 AI 入口固定进一键形象照」替换为
「卡面页已删掉独立的 AI 形象照面板」「会员说明改成走「编辑球员卡」换照片」两条断言）；
正式与测试两端 16 文件重发，HTTP 回读 SHA-256 `ALL MATCH`，线上回读确认两端已无
`ai-panel`/`btn-ai-portrait`、`app.js` 不再含 `openAiPortrait`，且「换形象照」入口仍在。

## 十三、后续注意

- `service-account-h5/card-world/js/dynamic-card-renderer.js` 是 `service-account-h5/dynamic-card-renderer.js`
  的字节一致副本（SHA-256 相同），共享渲染器改动后必须同步副本再发布。
- 后续静态发布一律使用绝对本地路径，避免 CLI 按项目根解析到主仓旧目录。
