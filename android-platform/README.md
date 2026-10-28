# 赛小蜂平台运营 · 安卓平板客户端

平台运营中心（`https://pingtai.sxffootball.cn/`）的安卓平板安装包。原生 Java WebView 壳，
只加载已上线的平台站点，不复制后台页面、不改变权限与数据边界；登录、`webLoginApi` 调用、
机构与平台权限校验全部仍由线上网页与服务端完成。

| 项目 | 当前值 |
|---|---|
| 包名 | `cn.sxffootball.platform` |
| 版本 | `1.0.0`（versionCode 1） |
| 最低 / 目标系统 | Android 7.0（API 24）/ Android 14（API 34） |
| 启动页 | `https://pingtai.sxffootball.cn/#/platform-login` |
| 下载地址 | `https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.0.apk` |
| 更新清单 | `https://www.sxffootball.cn/desktop/platform/android/latest.json` |

## 构建

工具链装在仓库外，默认 `%LOCALAPPDATA%\SxfAndroid`（JDK 17、Android SDK `platforms;android-34`
与 `build-tools;34.0.0`、Gradle 8.7），可用 `SXF_ANDROID_JDK`、`SXF_ANDROID_SDK`、
`SXF_ANDROID_GRADLE` 覆盖。

```powershell
powershell -ExecutionPolicy Bypass -File android-platform\scripts\build-android.ps1
```

脚本先运行 `node test/config.test.cjs`（9 项源码约定检查），再执行 `gradle :app:assembleRelease`，
把 `SxfPlatform-<version>.apk` 复制到 `android-platform\release\` 并打印大小与 SHA-256。
`-SkipTests` 可跳过检查，仅用于排查构建问题。

导出桥接另有浏览器级验证：`node android-platform\test\bridge.test.cjs`，依赖仓库内
`npm install --no-save playwright-core`（`tools/lib/load-playwright.cjs` 会自动加载）。

应用图标由 `scripts/make-icons.ps1` 从 `platform-admin-vue/public/pwa-512.png` 生成 5 档 mipmap，
白底、`ic_launcher.png`。

## 签名

签名身份放在仓库外 `%LOCALAPPDATA%\SxfAndroid\keystore\`：

- `platform-release.jks`：PKCS12，别名为 `sxfplatform`，store 与 key 口令相同。
- `platform-signing.dpapi`：口令用 Windows DPAPI 按当前用户加密，构建脚本解密后只在本进程内
  以环境变量传给 Gradle，不打印、不写入仓库、不进入发布包。

两者必须成对存在，任一缺失时脚本直接失败而不是重建身份；重建会导致已有安装无法覆盖升级。
`app/build.gradle` 只从 `SXF_ANDROID_KEYSTORE` 等环境变量读取签名参数。

## 行为与安全边界

- 只允许 `pingtai.sxffootball.cn` 站内导航；其他域名（如 `www.sxffootball.cn`）与 `intent://`
  之类地址交给系统浏览器，不在壳内放行。
- 禁止明文流量（`usesCleartextTraffic="false"`）、禁止 `file://` 文件访问、拒绝混合内容；
  WebView 调试关闭；Cookie 接受第一方、关闭第三方 Cookie。
- 上传走系统文件选择器（`onShowFileChooser`），与网页版一致。
- 页面内 `blob:` 导出由注入脚本转 `SxfApp.saveBase64()` 原生保存，Android 10+ 写入系统
  “下载”目录（`MediaStore.Downloads`），旧系统写入应用外部下载目录；单文件上限 32MB，超限提示
  改用浏览器打开。HTTP 下载仍走系统 `DownloadManager` 通知。
- UA 追加 ` SxfPlatformApp/1.0`；平台登录页识别到该标记后不再显示“下载安卓安装包”入口。
- 断网显示“网络连接不可用，点击重试”；WebView 渲染进程退出时重建界面；Android 返回键优先
  网页后退。

## 发布

APK、`SHA256SUMS.txt` 先上传，`latest.json` 最后上传，上传后用 `https://www.sxffootball.cn/`
回下载并比对大小与 SHA-256：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy 'android-platform\release\publish-1.0.0\SxfPlatform-1.0.0.apk' 'desktop/platform/android/SxfPlatform-1.0.0.apk'
```

平台登录页的下载入口地址写在 `platform-admin-vue/src/components/PlatformInstallGuide.vue` 的
`ANDROID_APK_URL`，升级 APK 时必须与 `latest.json` 同步更新，避免页面指向已删除的旧版本。
发布记录见 `docs/releases/android-platform-1.0.0-20261028.md`。

## 版本升级

1. 同时修改 `app/build.gradle` 的 `versionName` 与递增的 `versionCode`。
2. 用原签名身份执行构建脚本，确认 `apksigner verify` 证书指纹与上一版一致。
3. 更新 `release/publish-<version>/` 的 APK、`SHA256SUMS.txt`、`latest.json`。
4. 先上传 APK 与摘要，最后上传清单，回下载比对后再更新 `ANDROID_APK_URL` 并发布平台登录页。

## 已验证与未验证

已验证（2026-10-28）：Gradle 构建通过，产物 60,276 字节；`apksigner verify` v2 签名通过，
证书 SHA-256 `d08c6c23…d949150cc`；`aapt2 dump badging` 读回包名、版本、`sdkVersion 24`、
`targetSdkVersion 34`、启动 Activity 与 5 档图标；APK 内含 `classes.dex`、清单与资源；
9 项源码配置检查通过；线上 APK 回下载大小与 SHA-256 与本地一致。

`node test/bridge.test.cjs` 4 项通过：从源码抽出 `BRIDGE_JS` 注入真实浏览器后，点击 blob 下载
链接会阻止 WebView 自行处理，文件名与 base64 内容与原始字节一致；非 `blob:` 链接不被拦截；
超过 32MB 只提示改用浏览器、不写文件；重复注入不会重复保存。

未验证：本机没有连接安卓设备，未做真机安装、登录、短信/扫码、上传、断网恢复与覆盖升级测试；
导出桥接虽在浏览器中验证，写入系统“下载”目录（MediaStore）的真机结果仍未验证。安装后需在
平板上验收这些流程。
