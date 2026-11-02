# 安卓平板 0.1.1：刷新与原生布局兜底

2026-10-28，用户反馈“为什么刷新没用呢”。本次沿已有安卓下载与更新清单授权发布 /desktop/android/。

## 诊断边界

官网 /preview/admin/ 仍返回上一轮新版 index-C56Qz874.js，包含原生客户端识别和平板样式标记；不是仅凭用户没刷新推断。0.1.0 的刷新仅再次 loadUrl 当前地址，没有明确清理 HTTP 缓存或防缓存入口参数。此实现存在继续复用旧页面的可能，但未连接 vivo 真机重现，不能把缓存称为已取得设备证据的唯一原因。此前“刷新即可”的交付说明过于肯定。

## 修复

- 初次进入与刷新都为第一方页面添加可替换的 _sxf_reload 参数，保留原 query 编码及 hash 路由，重复刷新不无限追加同名参数。
- 刷新停止当前加载、清理资源缓存、刷新期间 LOAD_NO_CACHE、Cache-Control/Pragma 防缓存请求头，完成后恢复默认缓存。没有调用清 Cookie、DOMStorage、localStorage 或会话接口。
- 第一方页面完成时，由原生侧显式设置平板布局标记并通知导航，补充网页 UA 识别。
- 更新清单请求增加时间戳与 no-cache，不因旧清单缓存误报最新版。
- versionName0.1.1、versionCode101、包名 cn.sxffootball.pad.preview。与0.1.0证书一致，按系统正常覆盖安装保留数据；没有修改后台权限、机构、统计或业务数据。

## 验证与发布

- 21项 Java 策略测试通过，覆盖路由/原查询保留、替换防缓存参数、编码保留和非第一方地址回退。APK编译、v3签名通过，与旧版证书摘要比对一致。实际 DEX 含防缓存请求头、入口参数与原生布局标记字符串。
- APK 242389字节，SHA256=284bb367978bb2ca27fce7297b51c7c3424b60a5d2dc365718cb8b7424cfc803。源码提交 5563db66c0afc1dcf014f9e14f9700acc1c07546（基线bbee37c37a8373a0a93b1a8d26ae7bbbbf9a809c），正式仓库独立功能分支 codex/android-pad-0.1.1；未切换或覆盖其他会话工作区。
- 按新APK、SHA256SUMS、latest.json顺序发布。三个文件HTTP200且逐字节匹配本地；更新清单101高于旧版100，且下载地址、版本及APK摘要一致。证据 output/android-pad-0.1.1-20261028/hosting-readback.json。
- 未改网页正式/测试源码或后端，本次没有新网页正式发布，故不触发网页测试同步。APK自身为已登记测试渠道，不存在另一个已登记正式安卓渠道。
- adb仍未连接设备；实际vivo覆盖安装、页面刷新和登录资料保留需用户复验，不冒充真机验收。

下载：https://www.sxffootball.cn/desktop/android/SxfFootball-Pad-0.1.1-preview.apk 。直接覆盖安装，进入“更多→应用信息”确认0.1.1，再查看竞赛管理。

实现依据：[Android WebView资源缓存](https://developer.android.com/reference/android/webkit/WebView#clearCache(boolean))、[LOAD_NO_CACHE](https://developer.android.com/reference/android/webkit/WebSettings#LOAD_NO_CACHE)。
