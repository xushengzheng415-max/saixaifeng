# Cosmos 箔光 H5 静态发布

日期：2026-11-01。用户指定八个静态文件；源提交 6db69827c6a79ec8a21751c3fd06ef65e6c4e229，分支 feat/card-world-h5-stage1-2。

正式 service-account-h5/card-world/ 与测试 preview/service-account-h5/card-world/ 各发布 index.html、css/app.css、css/holo-cosmos.css、js/app.js、js/holo.js，以及 assets/cosmos/ 下 cosmos-bottom.png、cosmos-middle-trans.png、cosmos-top-trans.png。

HTML 资源引用版本 v=20261101-holo4。两端共16个文件均 HTTP 200，原始字节 SHA-256 与指定提交本地文件一致。静态验收、两份 JS 语法与 diff --check 通过。云函数、数据库和 api.js 未修改。未使用真实微信账号验证实际卡面触摸效果。

关键摘要：

- index.html：dc8306a667a7fd862ae603f97752f7030cfe9b2d733a7052d835bc647be7b557
- holo-cosmos.css：480f6f9b89214b7ce12bac1e1f3931178fc4ae3a92dd8ad754ab7ccdb6dc61e6
- holo.js：ef86dcfa828f89cabb8c01fc8d3cf272109063b7490a3d0b06108fd9d629d362

发布前已有文件备份：.codex-artifacts/holo4-static-20261101。新增资源无旧版备份。

正式：https://www.sxffootball.cn/service-account-h5/card-world/index.html

测试：https://www.sxffootball.cn/preview/service-account-h5/card-world/index.html
