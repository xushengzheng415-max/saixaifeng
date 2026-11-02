# 安卓平板客户端 0.1.0 测试版发布

2026-10-28，用户确认“发布安卓下载和更新清单”，授权目标仅官网 /desktop/android/。按 APK、摘要、更新清单顺序发布，没有覆盖 Windows 文件或正式 /admin/。

- 下载：https://www.sxffootball.cn/desktop/android/SxfFootball-Pad-0.1.0-preview.apk
- 更新：https://www.sxffootball.cn/desktop/android/latest.json
- 摘要：https://www.sxffootball.cn/desktop/android/SHA256SUMS.txt
- Android 10+，包名 cn.sxffootball.pad.preview，versionName=0.1.0，versionCode=100。固定横屏，连接已验收 /preview/admin/，仍共用正式后端。
- 源码功能提交 622e792bc2bd3867ee45c08afdb9655c924c5ce8，Gitee 分支 codex/android-pad-0.1.0。未将平台长期分支整体发布。
- APK 242392 字节，SHA256=2c523a6b60802b6467bd99ae4decc22e58f13f7efe903d0494b776532b02d494。构建、APK v3 签名、zip 对齐、包名/版本/横屏/权限读取、16 项纯 Java 策略测试及实际 Blob 导出脚本检查通过。
- 三个官网文件全部 HTTP200，逐字节与本地一致，更新清单版本/包名/下载地址/SHA256 互相匹配。证据 output/android-pad-20261028/hosting-readback.json。
- 当前安装版本100等于清单版本100，不应显示有更新。后续递增 versionCode 并用同一签名构建、更新清单，代码会在“更多”显示更新入口；本轮未伪造更高线上版本来测试，也没有真机验证更新标识、覆盖安装。
- adb 没有连接 vivo Pad3 Pro。原生 WebView 真机安装、登录/短信收取、上传导出、断网恢复、旋转与覆盖安装仍待用户验收。签名密钥及 DPAPI 密码保存在仓库外，不随 APK 发布。

安装：用平板浏览器打开下载链接，下载完成后按系统提示安装。系统要求时，仅对本次使用的浏览器允许安装应用。
