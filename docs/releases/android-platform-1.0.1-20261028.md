# 平台运营中心安卓客户端 1.0.1（应用内更新）发布

2026-10-28。用户提出“平台更新老是反复安装也是不好的”，要求平台运营后台具备“更新可刷新”
能力。本轮把这条诉求拆成两半：网页/应用外壳由平台站点自己做到“发现新版本→一键刷新”，
安卓安装包由客户端自己检查并一键下载安装。本文记录安装包侧（1.0.1），网页侧见
`docs/releases/platform-update-refresh-20261028.md`。

## 交付内容

- 客户端源码：`android-platform/`（原生 Java WebView 壳，仍只加载线上平台站点）。
- 下载：<https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.1.apk>
- 更新清单：<https://www.sxffootball.cn/desktop/platform/android/latest.json>
- 摘要：<https://www.sxffootball.cn/desktop/platform/android/SHA256SUMS.txt>
- 登录页入口：`platform-admin-vue/src/components/PlatformInstallGuide.vue` 的 `ANDROID_APK_URL`
  改为 1.0.1，并在安装步骤中说明“以后有新安装包时点‘立即更新’即可”。

包名 `cn.sxffootball.platform` 不变，`versionName 1.0.1`，`versionCode 2`，minSdk 24，targetSdk 34。

## 应用内更新流程

1. 页面加载完成（`onPageFinished`）后检查更新，6 小时内最多一次（`SharedPreferences`
   `sxf-platform-update` 的 `lastCheck`）。
2. `HttpURLConnection` 读取 `latest.json`（8 秒超时，带 `Cache-Control: no-cache`，UA
   `SxfPlatformApp/<versionName>`）。
3. 远端 `versionCode` 不大于本机、或 `downloadUrl` 不是 `https://` → 静默跳过。
4. 有新版本弹“发现新版本”，显示版本号与 `notes`，按钮“立即更新 / 稍后”。
5. 下载走系统 `DownloadManager`（`application/vnd.android.package-archive`，
   `setDestinationInExternalFilesDir`），每 1 秒查一次状态，最多 240 次。
6. 下载完成用 `MessageDigest("SHA-256")` 校验清单 `sha256`，不一致提示“安装包校验失败”并放弃。
7. 校验通过取 `getUriForDownloadedFile`，以 `ACTION_VIEW` +
   `FLAG_GRANT_READ_URI_PERMISSION` 拉起系统安装器；被“禁止安装未知应用”拦截时提示去设置里开启。

清单声明 `android.permission.REQUEST_INSTALL_PACKAGES`。首次更新需要用户在系统设置里允许该应用
安装未知来源应用，之后同一签名覆盖升级不再提示。

`latest.json` 字段：`versionCode`、`version`、`downloadUrl`、`sha256`、`size`、`notes`（客户端同时
兼容 `versionName` 与 `url` 两个历史字段名）。

## 构建与校验

- `node android-platform/test/config.test.cjs` 13 项通过：新增“更新清单来自 www 静态托管”
  （含 `downloadUrl` 回退与 `versionCode` 解析断言）、“安装包更新需校验 SHA-256”、
  “清单声明安装未知应用权限”、“版本号随壳更新递增”。
- `node android-platform/test/bridge.test.cjs` 4 项通过（导出桥接未受影响）。
- `powershell -File android-platform/scripts/build-android.ps1`：`assembleRelease` 成功，产物
  `android-platform/release/SxfPlatform-1.0.1.apk`，64,896 字节，SHA-256
  `85d4a547a24e0089b60c780c0bc15645efca9b1a3172840fc03fcb509bd559ba`。
- `apksigner verify --print-certs`：v2 签名通过，证书 SHA-256
  `d08c6c23e40f32ce04767b6ecd488dc2c857fdffb56dfc5b13e9a47d949150cc`，与 1.0.0 一致，可覆盖升级。
- `aapt2 dump badging`：包名 `cn.sxffootball.platform`、`versionCode='2'`、`versionName='1.0.1'`、
  `sdkVersion:'24'`、`targetSdkVersion:'34'`、应用名“赛小蜂平台运营”。
- 签名仍由仓库外 `%LOCALAPPDATA%\SxfAndroid\keystore` 的 keystore + DPAPI 口令文件提供，本进程解密，
  不打印、不入库。

## 发布与回读

发布目录 `android-platform/release/publish-1.0.1/`（APK、`SHA256SUMS.txt`、`latest.json`），按目录
上传到 `desktop/platform/android`。`tcb hosting deploy` 的第二个参数是云端目录而不是键名：早前把
单个文件配该目录路径上传，生成了一个名为 `desktop/platform/android` 的错误键（内容恰是
`latest.json`），而真正的 `SxfPlatform-1.0.1.apk` 返回 404。已删除该错误键，改用目录上传后复验：

```
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy 'android-platform\release\publish-1.0.1' 'desktop/platform/android'
```

`hosting list desktop/platform/android` 现为 4 个文件：`SxfPlatform-1.0.0.apk`、`SxfPlatform-1.0.1.apk`、
`SHA256SUMS.txt`、`latest.json`，无额外目录键。

2026-10-28 回读（`https://www.sxffootball.cn`，GET 加时间戳与 `Cache-Control: no-cache`）：

| 文件 | 状态 | 类型 | 字节 | SHA-256 |
|---|---|---|---|---|
| `SxfPlatform-1.0.1.apk` | 200 | `application/vnd.android.package-archive` | 64,896 | `85d4a547…9bd559ba`（与本地一致） |
| `SxfPlatform-1.0.0.apk` | 200 | `application/vnd.android.package-archive` | 60,276 | `f641bdb8…f947889d8`（旧版仍可下载） |
| `SHA256SUMS.txt` | 200 | `text/plain` | 176 | `4fae4ad7…3f46ebf8`（与本地一致） |
| `latest.json` | 200 | `application/json` | 524 | `e2d0c0f4…caddea282`，`versionCode 2` / `version 1.0.1` |

`node tools/check-platform-live-pwa.cjs` 同时校验线上清单与安装包：`manifestStatus 200`、
`version 1.0.1`、`versionCode 2`、APK `200`、类型 `application/vnd.android.package-archive`、
64,896 字节、摘要与清单一致，0 失败。

## 已知限制

- 本机未连接安卓设备，真机“检查更新→下载→SHA-256→系统安装器→覆盖升级”全链路尚未实测；
  首次更新需用户在系统设置允许“安装未知应用”。
- 客户端只做版本升级检查，不改写页面内容；页面与业务逻辑更新由 WebView 每次加载线上站点生效，
  并配合网页侧的“已发布新版本→立即刷新”提示。
- 清单走 CDN，若某次发布后短时间未提示更新，属缓存未刷新，不影响已安装版本继续使用。
