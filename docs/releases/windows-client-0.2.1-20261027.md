# Windows 客户端 v0.2.1：接入原有竖版 LOGO

2026-10-27，用户提供现成官方竖版标志 `E:/Documents/saixiaofeng_football/logo文件/竖版.png`，4167×4167 透明 PNG。客户端以这份原图为品牌源，保留原图形、中文标准字和 FOOTBALL；登录页不再用图标另加普通字体拼写品牌名。应用小图标只提取原图中由空白带分隔的蜂与足球，等比缩放，不重画或改变原图。

原文件原样保存于 `desktop-windows/assets/brand-original-vertical.png`，运行素材为 `brand-vertical.png`，摘要与裁切边界登记于 `brand-source.json`。`scripts/build-brand.py` 可复现尺寸变体。v0.2.0 的原品牌适配记录仅为历史，当前源以本次用户提供文件为准。

v0.2.1 保留既有登录、安全、数据与连接超时修复，仅更新客户端品牌素材和登录页排版。网页、小程序、H5、云函数未修改或部署。安装包、打包源文件摘要和正式/测试入口验证结果，以本版本 `release/RELEASE-MANIFEST.json` 为准。

## 本地交付验证

- 用户原图与仓库副本 SHA-256 完全一致：`23313036c35ff049c2297396e6bff1edde364cb54164bdd3b2936595ea9b66d5`。
- 8 项原有断言通过；打包后的正式/测试入口各 7 项运行检查通过，1440/1024 窗口截图已查看。包含二维码获取/刷新、渲染器隔离、路由超时回归、合成下载、PDF 打印与连接恢复，不包含真人扫码后的真实业务写入验收。
- 完整竖版运行素材和图标已进入 `app.asar`，逐文件与当前源码及素材摘要比对一致。
- 安装包：`desktop-windows/release/SxfFootball-Setup-0.2.1-x64.exe`，121,863,776 字节；SHA-256 为 `c0a9578a7b7f3c7d082a8c66696244cdadcecccbd8a46ff1d9449770109cb45f`。仍为未配置发布者签名的内部试用包。
- Logo 素材包：`SxfFootball-App-Logo-Vertical-20261027.zip`，包含用户原图、完整运行竖版、图标、透明/深色变体、来源和说明。
- 代码未提交或推送；用户当前运行的旧客户端没有被强制关闭。升级时退出旧客户端后覆盖安装。
