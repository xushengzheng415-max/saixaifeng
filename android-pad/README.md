# 赛小蜂足球安卓平板客户端

当前为 0.1.2 平板测试版（首版0.1.0），包名 cn.sxffootball.pad.preview，Android 10+。原生 Java WebView 复用 https://www.sxffootball.cn/preview/admin/ ，不复制后台或改变业务权限。安装后微信扫码与手机号验证码登录均使用已上线网页流程。应用有本机独立会话存储，不能继承浏览器登录。

## 构建

工具安装在 %LOCALAPPDATA%/SxfFootballBuild/android，独立于系统 PATH。需要 JDK17、Android build-tools35.0.0、platforms android35；首次下载来源及校验结果见本轮 output/android-pad-20261028/。

首次执行 pwsh -File android-pad/scripts/setup-tools.ps1 校验并安装固定工具版本，然后执行 pwsh -File android-pad/scripts/build.ps1。输出 android-pad/release/SxfFootball-Pad-0.1.2-preview.apk 及 SHA256SUMS.txt。脚本直接运行 javac、D8、AAPT2、zipalign、apksigner，无额外前端 SDK 和 Gradle 插件依赖。

签名密钥与 DPAPI 加密密码留在仓库外 %LOCALAPPDATA%/SxfFootballBuild/signing，不提交、不复制到发布包。必须保留原密钥才能覆盖安装升级；不可因缺失而随意重建。此身份为测试包，不代表已取得应用商店认证。

## 行为

- sensorLandscape：只请求横屏或反向横屏；适配系统栏安全区和 Android 返回手势。桌面图标沿用既有圆角品牌图，Android 启动器使用 adaptive-icon 系统蒙版。
- 返回、刷新、更多及断网重连为原生控件；不以后台子资源单次加载失败替换整页。WebView 进程退出可重新连接。
- 系统文件选择器支持现有上传，HTTP 文件用系统下载通知。Blob/data 导出经原生保存位置对话框写入，最大25MB；来自第一方页面且携带每页随机 nonce 才能调用导出接口。不申请存储、相机或短信读取权限，不自动读取短信。大文件或系统选择器不支持的拍摄功能可用“在浏览器打开”。
- HTTPS、禁止明文与本地文件 URL 读取、拒绝证书错误；第一方主框架保留内部导航，外部 HTTPS/微信链接由用户点击后交系统应用；不放行任意 intent URI。WebView 调试关闭、应用备份关闭。参考：[Android WebView 文件访问安全](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion)。
- 更新清单固定 https://www.sxffootball.cn/desktop/android/latest.json，核对 android、测试包包名、递增 versionCode、第一方安卓目录 APK 下载地址。发现新版显示“更多 · 更新”，经用户选择在浏览器下载、系统确认安装；不静默升级，不申请自动安装权限。首次清单尚未发布时静默跳过启动检查，手动检查给出重试提示，不能假报已是最新。

## 版本升级

同步修改 AndroidManifest.xml 和 ClientPolicy.java 的版本号与 versionCode，递增整数；用原签名密钥构建，更新清单写入新 APK SHA256。发布顺序 APK/摘要先上传、清单最后上传，再读回验证；不要覆盖 Windows 更新清单。网页更新沿现有 preview 流程；本包连接测试站，仍共用正式后端，真实写操作须使用明确测试数据。

## 已验证与未验证

编译、zip 对齐、APK v3 签名、manifest 包名/版本/横屏/权限读回通过；16 项纯 Java 地址与文件名策略测试通过；浏览器执行实际导出注入脚本，程序触发及用户点击 Blob 导出、UTF-8、文件名、nonce 与注入去重通过。页面已有的横屏仿真与线上登录入口读回保持有效。

当前 adb 没有连接设备，未进行 vivo Pad3 Pro 真机安装或宣称原生 WebView 全流程实测；安装后需验收旋转、短信收取/登录、上传、导出保存、断网重连及覆盖安装。官网 APK 与更新清单已更新为0.1.1，HTTP/文件摘要回读通过；清单版本101高于旧安装版100。真机更新标识与覆盖安装仍待用户验收。0.1.0历史记录见 docs/releases/android-pad-0.1.0-20261028.md。

## 0.1.1 刷新修复

旧版按钮只对当前地址再次 loadUrl，没有明确绕过缓存。本版对网页入口添加可替换时间戳参数、清理 HTTP 资源缓存、刷新期间使用 LOAD_NO_CACHE 和 no-cache 请求头，页面结束后恢复默认缓存。路由 hash 与原有查询参数保留，不清理 Cookie、DOMStorage 或登录会话。启动入口及更新清单请求也增加防缓存参数；第一方页面加载后由原生侧补充平板布局标记。

21项 Java 策略检查与 APK 编译/签名校验通过，新旧签名证书一致，允许同包名覆盖安装；不将此称为 vivo 真机缓存故障已复现或安装已验证。参考：[WebView.clearCache](https://developer.android.com/reference/android/webkit/WebView#clearCache(boolean))、[WebSettings 缓存模式](https://developer.android.com/reference/android/webkit/WebSettings#LOAD_NO_CACHE)。
