# 我的球员卡 holo3 静态发布

日期：2026-11-01；用户明确要求仅发布三个 H5 静态文件，不更新云函数。

- 源码：feat/card-world-h5-stage1-2，fce17dd0a66b6b68861db678ba8eed9e63d0a6a5。
- 发布文件：service-account-h5/card-world/index.html、css/app.css、js/app.js。
- 正式与 preview/service-account-h5/card-world 同步发布，每端 3 文件。
- HTML 引用版本：v=20261101-holo3；未上传 api.js。
- 六次 HTTP 回读均为 200，原始字节 SHA-256 与本地相同。
- index.html：755b3e101bfb987b388fded28b44be0b8ef6a63e25224bbc96885de4a6b83427。
- css/app.css：1e124e4158f9a32e318f3e7e815d1ce0fca8460e77e18d05150c33533340eb18。
- js/app.js：fe1b3f1cff928d3b5ea5e297764060d551f215e12fbe5705851f2d15bea2ce8c。
- 静态边界回归、JS 语法及 git diff --check 通过。
- 云函数、数据库、运行配置均未变更。
- 正式：https://www.sxffootball.cn/service-account-h5/card-world/index.html
- 测试：https://www.sxffootball.cn/preview/service-account-h5/card-world/index.html
- 实机交互：按住卡面滑动查看倾斜、流光；轻点可触发按压高光。尚未以真实微信账号验证实际效果。
- 发布前六个文件备份：.codex-artifacts/holo3-static-20261101。
