# 邀请海报手写与可读性

2026-10-16 23:24:08 邀请海报手写字/黑底/按钮居中已沿用1.1.30上传。下载的OFL MaShanZheng字体经fontTools转换为真实轮廓，十条留言及ASCII核心字形随球队分包，其余署名字形按Unicode分片经cloud.downloadFile只读获取；留言和署名直接通过Canvas2D路径绘制，替代此前loadFontFace及系统字体回退，因此不受手机字体替换影响。增加rgba(0,0,0,.56)黑底覆盖两行文字，保留浅金字；生成/保存/分享及码操作按钮display:flex、align-items/justify-content:center，去除line-height撑高。原生隔离项目以麦步Frank署名导出750×1200 PNG，已视觉核对真实中英文手写字及遮罩；按钮计算样式居中通过。字体字形下载、缓存、失败反馈和渲染专项通过，云端9e分片回下载SHA256一致。上传总2799048/主1689736/球队669111字节。无云函数发布或真实球员数据修改，H5已有球员认领缺口仍待处理，手机实际验收待用户测试。

字体来源及许可保留在assets/team-invite-v2与字形核心模块中。字形构建tools/build-invite-handwriting.py；运行时invite-handwriting.js。证据目录：.codex-artifacts/invite-handwriting-20261016（隔离QR无业务作用）。
