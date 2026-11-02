# 小程序队徽裁剪与去背景（2026-10-29）

## 问题

小程序「球队」页 →「创建球队」快速弹层（`components/quick-create-sheet`）上传队徽时**没有任何裁剪与抠图**：

- `chooseLogo` 只把 `wx.chooseImage` 拿到的原图 `wx.cloud.uploadFile` 到 `team-logos/original/*.png`，随后 `setData({ transparentLogo: '' })`；
- `submit` 把空的 `transparentLogo` 交给 `onboardingWorkspace.createTeam`，服务端 `logo: transparentLogo || originalLogo` 落库，队徽就是带底原图。

另外两个小程序入口（`pages/guide/team-info/team-info.js`、`pages/onboarding/onboarding.js`）虽然调用了 `imageProcess` 的 `removeBackground`，但该云函数依赖 `HUNYUAN_API_KEY`，**线上未配置**：只读探针调用返回
`{"success":false,"error":"未配置AI密钥，请在云开发控制台环境变量中设置HUNYUAN_API_KEY"}`。
所以它们实际只完成裁剪，`transparentLogo` 恒为空，界面停在「裁剪完成，将保留原图」。

与 PC 对比：`web-admin-vue/src/utils/whiteBgRemover.js` 的本地算法（四角/边缘样本推断背景 + 四邻域泛洪 + `restoreEnclosedWhitePixels`）是真正生效的；`TeamDetail.vue` 与云函数 `webLoginApi/teamLogoPatch.cjs`（换图清空派生图、`logoVersion+1`）配套。与 `docs/UI_DELIVERY.md`「队徽默认透明、无外框；上传必须走共享裁剪与透明抠图流程」不一致。

## 处理（本地完成，未部署未上传）

新增两个共享模块，三个入口统一接入：

1. `miniprogram/utils/logo-cutout-core.js`：纯像素算法，不依赖 `wx`/DOM，规则与 PC `whiteBgRemover.js` 完全一致（阈值 240、容差 60、四邻域泛洪、内部白色保护、透明白恢复）。
2. `miniprogram/utils/logo-cutout.js`：
   - `process({ owner, canvasId, filePath, crop })`：`wx.getImageInfo` + Canvas 2D 隐藏节点，先铺白底再绘制（与 PC 防止透明白丢 RGB 一致），居中裁正方形（沿用原裁剪页的 `offset*side/250` 换算），导出原图 PNG，再跑算法并导出透明 PNG。
   - 占比保护：去掉的像素 `<0.4%`（没识别出背景）或 `>92%`（整图都是背景，会得到空图）时只返回原图，不产出透明图。
   - `uploadCrest`：原图上传到 `team-logos/original/{id}.png`，透明图上传到 `team-logos/original/{id}-transparent.png`（沿用已确认可写的目录，只靠后缀区分，不依赖新目录权限）；透明图上传失败不阻断创建，服务端自动回退原图。
3. 三个入口改为一套流程（选图 → 裁剪 → 去背景 → 两图上传）：
   - `components/quick-create-sheet/index.js`：新增 `processLogo`，隐藏 Canvas 2D `#teamLogoCutout`；队徽提示改为 JS 预计算的 `logoHintText`（`可稍后补充` / `正在裁剪并去背景…` / `已生成透明队徽` / `已保留原图（未识别出背景）`）。Canvas 2D 不可用（旧基础库、取像素失败）时自动退回原图直传，保证仍能建队。
   - `pages/guide/team-info/team-info.js`、`pages/onboarding/onboarding.js`：删除 `wx.createCanvasContext` 旧裁剪与 `imageProcess` 调用，改为 `logoCutout.process` + `logoCutout.uploadCrest`；隐藏画布改为 `<canvas type="2d" id="…">`。
   - `pages/guide/team-info.js`（无子目录的旧页）未在 `app.json` 注册、无任何跳转，属废弃代码，本次不动。

## 验证

- `node tools/test-logo-cutout-core.cjs`：白底、彩色底、内部白色保护、透明白恢复、整图纯色按占比拦截、窄白边满图不蔓延，以及与 PC 常量对齐；全部通过。
- `node tools/check-team-crest-flow.cjs`：三个入口 WXML 标签配对、表达式限制、事件处理器存在，且都接入统一模块、不再调用 `imageProcess`；全部通过。
- `node --check`：`logo-cutout.js`、`logo-cutout-core.js`、`quick-create-sheet/index.js`、`guide/team-info/team-info.js`、`onboarding/onboarding.js` 通过。

## 未完成 / 后续

- **未部署、未上传小程序**；体验版/正式版验证仍需单独授权。真机需要复核：透明 PNG 在球队列表、报名快照、球员卡里的显示效果，以及 600×600 处理耗时。
- `cloudfunctions/imageProcess` 已无调用方且密钥未配置，建议后续单独授权后下线，避免再被误接入。
- 服务端 `onboardingWorkspace` 目前只校验 `cloud://` 前缀，未校验透明图与源图的一致性；PC 端换图由 `teamLogoPatch.cjs` 兜底，小程序端创建新队不会触发旧派生图问题，暂不改后端。
