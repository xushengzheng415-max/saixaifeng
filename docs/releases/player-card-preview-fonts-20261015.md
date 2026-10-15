# 平台动态卡预览字体加载修复

用户反馈24张历史重绘预览全部显示“A network error occurred.”。原因已核实：统一场景的字体地址仍为www.sxffootball.cn/admin/fonts/player-card/，该站四款字体响应均没有Access-Control-Allow-Origin；从独立平台pingtai.sxffootball.cn通过FontFace加载时被阻止。上轮遮罩测试没有带入真实字体清单，遗漏了跨域字体加载场景。

平台工程现包含独立的Noto Sans SC Regular/Bold、Ma Shan Zheng、Anton字体，逐一核对统一清单SHA-256。平台HTTP适配器在交给统一绘制器前，只将白名单内四个字体文件映射为平台同源路径；不改服务端协议、其他端URL或云端模板。失败提示为中文并提供重试预览。

验证：tools/test-platform-card-fonts.mjs检查嵌套场景、同源路径和四款字体摘要；发布后须在真实平台域名载入完整字体清单绘制24张卡，并同时验证遮罩。没有修改120张历史PNG、模板状态、球员资料或其他云函数。
