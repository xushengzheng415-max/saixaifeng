# 平台运营中心安卓平板客户端 1.0.0 发布

2026-10-28，用户要求“做一个 APK 的安装包，能在平板上用，安卓的”。本轮交付平台运营中心
（`pingtai.sxffootball.cn`）的安卓平板安装包，并把它接到平台登录页，用户可以直接下载安装。

## 交付内容

- 客户端源码：`android-platform/`（原生 Java WebView 壳，只加载已上线平台站点，不复制后台逻辑）。
- 下载：<https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.0.apk>
- 更新清单：<https://www.sxffootball.cn/desktop/platform/android/latest.json>
- 摘要：<https://www.sxffootball.cn/desktop/platform/android/SHA256SUMS.txt>
- 平台登录页新增“下载安卓安装包”入口：`platform-admin-vue/src/components/PlatformInstallGuide.vue`
  的 `ANDROID_APK_URL` 与 `apk` 分支；登录页说明同步改为覆盖电脑、安卓、iPad 三种设备。

包名 `cn.sxffootball.platform`，versionName `1.0.0`，versionCode `1`，minSdk 24（Android 7.0），
targetSdk 34。安装后以独立应用运行，登录、权限与数据仍全部走线上 `webLoginApi` 与平台页面。

## 构建与校验

- `android-platform/scripts/build-android.ps1` 构建通过（Gradle 8.7 + AGP 8.5.2 + JDK 17 + SDK 34）。
- APK 60,276 字节，SHA-256 `f641bdb8a85735a7c6858a00ac8893c042f8f5632fd60c21011dc68f947889d8`。
- `apksigner verify --verbose --print-certs`：验证通过，v2 签名方案生效（minSdk 24 无需 v1）；
  证书 SHA-256 `d08c6c23e40f32ce04767b6ecd488dc2c857fdffb56dfc5b13e9a47d949150cc`。
- `aapt2 dump badging` 读回包名、版本、`sdkVersion:'24'`、`targetSdkVersion:'34'`、应用名
  “赛小蜂平台运营”、启动 Activity 与 160/240/320/480/640 五档图标。
- `node android-platform/test/config.test.cjs` 9 项检查通过：联网权限、禁止明文、启动页为平台
  正式域名、站内白名单只有平台域名、无 `http:` 启动、导出桥接保留、SDK 版本固定、签名只从
  环境变量读取。
- 签名口令已从明文 properties 迁移为 Windows DPAPI 加密文件 `platform-signing.dpapi`，
  `keytool -list` 读回证书指纹与上一版一致，构建脚本不再接触明文口令。

## 发布与回读

使用规定的足球 CloudBase 启动器，环境 `cloud1-7g8ckb3c7815a011`，只新增
`desktop/platform/android/` 三个文件，按 APK → 摘要 → 清单顺序上传；未触碰
`desktop/windows/`、`desktop/android/`（主办方平板测试包）、`/admin/`、`/preview/admin/`、
云函数或环境配置。

2026-10-28 回读结果（`https://www.sxffootball.cn`，带 `Cache-Control: no-cache`）：

| 文件 | 状态 | 类型 | 字节 | SHA-256 |
|---|---|---|---|---|
| `SxfPlatform-1.0.0.apk` | 200 | `application/vnd.android.package-archive` | 60,276 | `f641bdb8…f947889d8`（与本地一致） |
| `SHA256SUMS.txt` | 200 | `text/plain` | 92 | 与本地一致 |
| `latest.json` | 200 | `application/json` | 497 | 与本地一致 |

## 安装方式

平板浏览器打开下载链接，或在平台登录页点“下载安卓安装包”→ 弹窗底部“下载安装包”。下载完成后
在通知栏或“文件”里点开 APK；系统提示“禁止安装未知应用”时，允许当前浏览器或文件管理器安装。
不想装 APK 也可以继续用 Chrome“添加到主屏幕”（PWA）；iPad 仍用 Safari“添加到主屏幕”；
电脑仍用 Edge/Chrome 地址栏“安装”。

## 已知限制

- 本机未连接安卓设备，未做真机安装、登录、短信/扫码、上传、导出保存、断网恢复与覆盖升级验证；
  `blob` 导出到系统“下载”目录的桥接只做了源码级检查。
- 平台登录页在安卓设备上优先给 APK 安装包，不再使用 Chrome 的 `beforeinstallprompt` 一键安装；
  后台顶栏仍保留原有“添加到主屏幕”引导。
- 客户端不内置更新检查，升级需要重新下载 APK 覆盖安装；`latest.json` 供后续接入使用。
- 签名身份保存在仓库外，需与 APK 一起长期保留，否则无法覆盖升级。
