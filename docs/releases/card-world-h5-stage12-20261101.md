# H5 我的球员卡阶段 1–2 正式与测试发布

日期：2026-11-01（Asia/Shanghai）。用户在本聊天明确授权正式发布。

## 源码与范围

- TRAE 提交：3f1a7fbd0b9d8ea9f3247e739248091564f93ee2。
- 发布补充：1ab69b4（codex/release-h5-stage12-20261101），保留现网裁判邀请回跳修复，支持 H5 preview OAuth 回跳及签名。
- 后端以刚下载线上包为基线，仅改 index.js、membership.cjs、playerCards.cjs，新增 membershipAccount.cjs。
- H5 发布 index.html、css/app.css、js/api.js、js/app.js 及两张品牌资源，共 6 文件；正式与测试资源相同。
- 功能：本人卡展示与卡库、设主卡、已有背景与构图设置、服务号鉴权、会员主键 users._id 及旧 officialOpenId 兼容、小程序入口 gh_6d11304cf55f。
- 未执行生产会员回填迁移；未上传小程序包。皮肤目录、照片草稿合成扣费、小程序支付属后续阶段。

## 发布与回读

- 环境 cloud1-7g8ckb3c7815a011，函数 webLoginApi；仅更新代码，未调用配置更新。
- 发布前包 SHA-256：398e4247ea75c78062339b9d8272d8b88b6ffe6ebb101b0035913d50b442831c。
- 发布后回下载包 SHA-256：76efae25f6be311377e647c39e45e9342f79ccc2c3297e641481712af0627876。
- Active / Available；Nodejs18.15、512MB、120秒、InstallDependency=TRUE 与环境变量脱敏结构均与发布前一致。未输出环境变量值。
- 回下载四个业务文件 SHA-256 均匹配发布源码；6615 → 6616 文件，仅四个目标业务文件与 node_modules/.package-lock.json 元数据变化，依赖其他内容未变。
- 正式：https://www.sxffootball.cn/service-account-h5/card-world/index.html
- 测试：https://www.sxffootball.cn/preview/service-account-h5/card-world/index.html
- 两端各 6 资源 HTTP 200，原始字节 SHA-256 与本地一致。
- HTML：060b8b7e15d8976c054c1c21020a5d700d0023f1b8b07824396deb8006baa060。
- api.js：0779f7876d57936026e43d44469847b9053a3761aa28e08dbe275b7d3ac8aa52。
- app.js：95c8a565051a3c4c6ddac8b0289ba598bdae614cbe70caf127f9dafb8478ac4b。
- 正式和测试共用 webLoginApi，未另建或部署测试后端。

## 验证与实际边界

本机 H5 静态边界、会员主键兼容、本人/监护及跨账号、背景保存不误扣蜂蜜、照片来源、13 类主卡回归全部通过；语法与裁判表/报名上传防回退检查通过。

线上 cardWorldLogin、servicePrivateJsSdkConfig、servicePrivateMembershipStatus、listMyPlayerCards、getMyPlayerCard、previewMyPlayerCard、saveMyPlayerCard 七个无效会话探针均 HTTP 200，返回预期登录错误；未写业务数据。

未使用真实用户会话，微信 JS-SDK 签名成功、真实卡面/保存、会员实际显示及开放标签跳转须由真实微信账号验收；不得将无效会话探针称为完整业务验收。公众号安全域名和小程序关联后台设置未更改。

回滚底包和发布前 H5 备份：.codex-artifacts/h5-stage12-release-3f1a7fbd。此目录含线上依赖包，不提交仓库。
