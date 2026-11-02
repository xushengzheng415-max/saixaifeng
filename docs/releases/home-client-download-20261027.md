# 官网顶部客户端下载入口

2026-10-27，用户要求将客户端下载上线官网，并在顶部菜单添加「客户端下载」。

- 修改范围仅根目录`index.html`：桌面顶部增加「客户端下载」，手机顶部增加「Windows 下载」。沿用现有导航样式，不新增页面或调整登录。
- 默认链接指向已上线v0.2.3安装包，公开读取`/desktop/windows/latest.json`后切换到最新版本。只接受官方HTTPS域名及与合法版本号匹配的安装包地址；超时或失败时保留现有可用链接。未增加CloudBase浏览器SDK。
- 修改前，本地`index.html`与线上首页SHA-256一致；本次仅上传隔离目录内一个`index.html`到托管根目录。没有上传工作区其他修改，也没有修改后台、小程序、H5、云函数或客户端安装包。
- 静态脚本解析和JSON-LD解析、`git diff --check`通过。本地及线上分别按1440px桌面、390px手机验证可见文案、导航边界、最新清单解析和实际下载请求。下载请求触发后主动取消，未反复保存完整安装包。
- 官网HTTP200，线上首页与本地SHA-256均为`19348ff1e6ae2a00f228d4d689cd30ffb640ac89f7ecf25432374255b1e8c90f`。实际解析版本0.2.3，链接为`https://www.sxffootball.cn/desktop/windows/SxfFootball-Setup-0.2.3-x64.exe`。
- `/admin/`和`/preview/admin/`均HTTP200。根首页目前没有登记独立测试入口，本次未猜测或新建测试目标；PC后台未修改，因此未重复构建或上传其测试工程。

线上入口：`https://www.sxffootball.cn/`。真实页面1440/390导航截图与验证记录位于`desktop-windows/test-output/home-live-*.png`和`home-live-navigation.json`。源码尚未提交或推送，保留其他任务未提交改动。
