# Pad 客户端正式/测试通道切换（0.1.3）

2026-11-05。用户确认：Pad 端需要像 Windows 桌面端一样在应用内切换正式与测试通道；正式通道允许直接写入生产业务数据。

## 原状

`android-pad/src/cn/sxffootball/pad/ClientPolicy.java` 的 `HOME` 为编译期常量，固定指向 `https://www.sxffootball.cn/preview/admin/#/login`，包名 `cn.sxffootball.pad.preview`，0.1.2。应用内没有任何通道切换入口，安装包只能连测试站。

## 本次改动

- `ClientPolicy`：拆为 `HOME_PRODUCTION`（`/admin/#/login`）与 `HOME_PREVIEW`（`/preview/admin/#/login`），新增 `home(preview)`、`channelValid(value)`；`freshPageUrl` 增加显式兜底参数，避免非第一方地址回落到错误通道。
- `MainActivity`：通道写入本机 SharedPreferences（`channel`，默认 `preview`，升级安装保持测试）；标题显示「平板测试版/正式版」；「更多」菜单新增「切换正式版/切换测试版」，切换前二次确认。
- 两个通道同域，Cookie 与 DOM 存储天然共享，因此切换时清除 WebView Cookie、DOM 存储和浏览历史，并重新加载对应通道登录页，必须重新登录，防止测试会话带入正式环境。
- 版本 `0.1.3` / versionCode `103`；应用名改为中性的「赛小蜂足球·平板」；更新包下载文件名去掉 `-preview` 后缀。
- `build.ps1` 的 `Invoke-Checked` 兼容 PowerShell 5：javac 弃用提示写入 stderr 时不再中断构建（此前只有 pwsh 7 下可正常执行）。

## 验证

- `test-client.ps1`：30 项地址/通道/文件名策略测试通过。
- `javac --release 8 -classpath android.jar` 编译通过（仅既有弃用 API 提示）；D8 生成 `classes.dex` 33,180 字节。
- 打包签名使用恢复后的原密钥（`%LOCALAPPDATA%\SxfFootballBuild\signing\football-pad-preview.p12`）。新包证书 `SHA-256 1b7f54f91a356f5cd49da3c6a7ee77933bf7091370afd2f37b11ad8d69e10d57` 与线上 0.1.2 包逐字相同，可覆盖安装。
- 新包 `SxfFootball-Pad-0.1.3.apk` SHA-256 `ebb1ba12679db7d20d624eb5c7315a8a647badb50c7aa94d104704ad0a10937c`；`aapt2 dump badging` 读回包名、versionCode 103、versionName 0.1.3、横屏与权限未变。
- 线上旧包 0.1.2 摘要 `0fba0822c0a74b47cb069358708bd0b6e6bde2d5c823704fad8de525331eec1b` 与更新清单一致。

## 尚未完成

未上传 APK 与 `latest.json` 到 `/desktop/android/`，未在 vivo Pad3 Pro 真机安装验收。上传与本机通道切换需单独授权后执行。
