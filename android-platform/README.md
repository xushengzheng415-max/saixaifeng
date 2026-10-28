# 赛小蜂平台运营 · 安卓平板客户端

平台运营中心（`https://pingtai.sxffootball.cn/`）的安卓平板安装包。原生 Java WebView 壳，
只加载已上线的平台站点，不复制后台页面、不改变权限与数据边界；登录、`webLoginApi` 调用、
机构与平台权限校验全部仍由线上网页与服务端完成。

| 项目 | 当前值 |
|---|---|
| 包名 | `cn.sxffootball.platform` |
| 版本 | `1.0.1`（versionCode 2） |
| 最低 / 目标系统 | Android 7.0（API 24）/ Android 14（API 34） |
| 启动页 | `https://pingtai.sxffootball.cn/#/platform-login` |
| 下载地址 | `https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.1.apk` |
| 更新清单 | `https://www.sxffootball.cn/desktop/platform/android/latest.json` |

## 构建

工具链装在仓库外，默认 `%LOCALAPPDATA%\SxfAndroid`（JDK 17、Android SDK `platforms;android-34`
与 `build-tools;34.0.0`、Gradle 8.7），可用 `SXF_ANDROID_JDK`、`SXF_ANDROID_SDK`、
`SXF_ANDROID_GRADLE` 覆盖。

```powershell
powershell -ExecutionPolicy Bypass -File android-platform\scripts\build-android.ps1
```

脚本先运行 `node test/config.test.cjs`（13 项源码约定检查），再执行 `gradle :app:assembleRelease`，
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

## 应用内更新

打开应用、页面加载完成后（每 6 小时最多一次）读取 `latest.json` 比对本机 `versionCode`：

1. 远端 `versionCode` 不大于本机，或下载地址不是 `https://`，静默跳过；
2. 有新版本时弹窗“发现新版本”，展示版本号与更新说明，按钮“立即更新 / 稍后”；
3. “立即更新”用系统 `DownloadManager` 下载 APK（类型 `application/vnd.android.package-archive`，
   存到应用外部下载目录），每 1 秒轮询进度，最多等 4 分钟；
4. 下载完成后用 `MessageDigest SHA-256` 校验清单里的 `sha256`，不一致直接报“安装包校验失败”；
5. 校验通过用 `DownloadManager.getUriForDownloadedFile` 取得内容 URI，带
   `FLAG_GRANT_READ_URI_PERMISSION` 交给系统安装器；系统未允许“安装未知应用”时提示去设置里开启。

清单字段：`versionCode`、`version`（或 `versionName`）、`downloadUrl`（或 `url`）、`sha256`、`size`、
`notes`。清单本身用 `Cache-Control: no-cache` 请求，避免 CDN 缓存导致长期检测不到新版本；页面
内的 Vue 代码、样式、业务逻辑仍由 WebView 每次加载线上站点自动取新，不需要发版。

## 发布

**`tcb hosting deploy` 的第二个参数是云端目录，不是键名。** 只传单个文件时容易把文件写成同名
“目录键”，线上真实文件反而 404。发布统一按目录上传 `release/publish-<version>\`：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy 'android-platform\release\publish-1.0.1' 'desktop/platform/android'
```

上传后必须 `hosting list desktop/platform/android` 确认每个文件都在正确路径、没有额外的同名目录键，
再回下载比对大小与 SHA-256。目录里只放 APK、`SHA256SUMS.txt`、`latest.json`；旧版本 APK 不会被覆盖，
保留在线上供回滚与对比。

平台登录页的下载入口地址写在 `platform-admin-vue/src/components/PlatformInstallGuide.vue` 的
`ANDROID_APK_URL`，升级 APK 时必须与 `latest.json` 同步更新，避免页面指向已删除的旧版本。
发布记录见 `docs/releases/android-platform-1.0.0-20261028.md`、`docs/releases/android-platform-1.0.1-20261028.md`。

## 版本升级

1. 同时修改 `app/build.gradle` 的 `versionName` 与递增的 `versionCode`。
2. 用原签名身份执行构建脚本，确认 `apksigner verify` 证书指纹与上一版一致。
3. 更新 `release/publish-<version>/` 的 APK、`SHA256SUMS.txt`、`latest.json`。
4. 按上面的目录方式上传，回下载比对后再更新 `ANDROID_APK_URL` 并发布平台登录页。
5. 已安装的旧版本会在下次打开时提示“发现新版本”，一键更新即可，不需要卸载重装。

## 已验证与未验证

已验证（2026-10-28）：Gradle 构建通过，产物 60,276 字节；`apksigner verify` v2 签名通过，
证书 SHA-256 `d08c6c23…d949150cc`；`aapt2 dump badging` 读回包名、版本、`sdkVersion 24`、
`targetSdkVersion 34`、启动 Activity 与 5 档图标；APK 内含 `classes.dex`、清单与资源；
9 项源码配置检查通过；线上 APK 回下载大小与 SHA-256 与本地一致。

`node test/bridge.test.cjs` 4 项通过：从源码抽出 `BRIDGE_JS` 注入真实浏览器后，点击 blob 下载
链接会阻止 WebView 自行处理，文件名与 base64 内容与原始字节一致；非 `blob:` 链接不被拦截；
超过 32MB 只提示改用浏览器、不写文件；重复注入不会重复保存。

重新构建可复现（2026-10-28 再次执行 `build-android.ps1`）：`assembleRelease` 39 秒完成，产物仍是
60,276 字节、SHA-256 `f641bdb8…f947889d8`，`apksigner` 证书 SHA-256 `d08c6c23…d949150cc`
与首版一致，线上回下载大小与摘要也一致，因此同版本无需重新上传。页面样式更新（如桌面窗口标题条
修复）由 WebView 每次加载线上站点自动生效，不必重打包 APK。

未验证：本机没有连接安卓设备，未做真机安装、登录、短信/扫码、上传、断网恢复与覆盖升级测试；
导出桥接虽在浏览器中验证，写入系统“下载”目录（MediaStore）的真机结果仍未验证。安装后需在
平板上验收这些流程。

1.0.1（应用内更新，2026-10-28）：`test/config.test.cjs` 13 项通过（新增更新清单来源、SHA-256 校验、
安装未知应用权限、版本号递增）；`bridge.test.cjs` 4 项通过；`assembleRelease` 构建成功，APK
64,896 字节，SHA-256 `85d4a547a24e0089b60c780c0bc15645efca9b1a3172840fc03fcb509bd559ba`，
`apksigner` 证书指纹与 1.0.0 相同（可覆盖升级），`aapt2` 读回 `versionCode 2`、`versionName 1.0.1`。
线上 `latest.json` 回读 `versionCode 2`，APK HTTP 200、类型 `application/vnd.android.package-archive`、
大小与摘要一致；1.0.0 仍可下载。真机上的“下载→校验→拉起系统安装器”链路尚未实测。
