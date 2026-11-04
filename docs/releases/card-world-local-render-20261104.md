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

## 六、后续注意

- `service-account-h5/card-world/js/dynamic-card-renderer.js` 是 `service-account-h5/dynamic-card-renderer.js`
  的字节一致副本（SHA-256 相同），共享渲染器改动后必须同步副本再发布。
- 后续静态发布一律使用绝对本地路径，避免 CLI 按项目根解析到主仓旧目录。
