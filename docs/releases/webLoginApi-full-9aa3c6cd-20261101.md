# webLoginApi 指定提交整包重新发布

日期：2026-11-01，Asia/Shanghai。用户明确要求以 feat/card-world-h5-stage1-2 的 9aa3c6cd6756a7c845a8c278f85bf510dc30cd88 整包重新部署 webLoginApi。

## 目标与源码

- 目标环境：cloud1-7g8ckb3c7815a011；函数：webLoginApi。
- 完整源码目录：该提交的 cloudfunctions/webLoginApi；本轮没有修改此提交源码，也没有上传 H5 静态文件。
- 重点变更：playerCardFontCache.cjs 校验并复用包内字体，仅下载缺失或哈希不一致的字体；缓存写系统临时目录。
- 本次以指定提交的 index.js 为准，包含该提交本身的路径范围；之前 Codex 补充的 preview 签名和裁判邀请回跳参数修复不属于该提交，未另外叠加。
- 原现网依赖随包，InstallDependency=TRUE 保持原配置。未执行数据库迁移、配置更新或小程序上传。

## 回读证据

- 发布前包 SHA-256：76efae25f6be311377e647c39e45e9342f79ccc2c3297e641481712af0627876，已保留回滚包。
- 发布后包 SHA-256：fbc0a93626132de7bc6267907c523f45d6c8b2ca73cc9239e4369880e240ca66。
- 字体缓存文件本地 SHA-256：38c26fd9e969b662648fe0c118f30b7f552eeaaec361d01d28e40d51b18f0ffb。
- 函数 Active / Available，运行时 Nodejs18.15、512MB、超时120秒、InstallDependency=TRUE；配置及环境变量脱敏结构与发布前一致。
- 七个无效会话 HTTP 探针（主卡登录、微信签名、会员状态、列表、详情、预览、保存）均 HTTP 200，返回预期鉴权错误，未写业务数据。
- 本机字体缓存、会员、H5 球员卡、照片源、主卡回归与裁判表/报名上传防回退检查通过。

## 测试端与验收边界

正式和测试 H5 共用该 webLoginApi，后端同步生效，不另传旧测试函数包；本次未改前端。指定提交不含 preview 签名路径扩展，测试页开放标签签名存在版本差异，不能宣称该签名已验证可用。

未使用真实账号会话，完整卡面渲染、字体冷启动耗时和微信内保存/跳转须真机验收；鉴权探针不代替这些验证。

本机回下载目录：.codex-artifacts/full-webLoginApi-9aa3c6cd-readback；源码目录：.codex-artifacts/release-full-webLoginApi-9aa3c6cd。依赖包与配置不提交仓库。
