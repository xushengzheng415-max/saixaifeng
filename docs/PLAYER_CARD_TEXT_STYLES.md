# 球员卡文字样式

## 2026-10-28 字体与描边扩展

平台字体列表分为中文字体与球衣号码。新增用户提供的阿里妈妈数黑体、微软简综艺、微软简粗黑、汉仪雅库黑；新增 GitHub Google Fonts 的 Graduate、Jersey 25、Black Ops One 三款号码字体，随资产保留各自 OFL 许可证及来源。旧 GBK 综艺/粗黑转换为 Unicode cmap，补规范字体名称记录，保留字形与原嵌入标志；原始文件不覆盖。来源摘要及处理见 fonts/ADDED-FONTS.json。

描边沿用原 width/color 合同与 0–5 宽度，增加独立开关及黑/白/金快捷色，不新增授予或权限规则。铜色渐变采用 #ffe0b5 → #cd7f46 → #703718，90°，描边 #542b17/0.6；金银铜渐变快捷操作保留用户选定字体、字号、坐标和字距。前端预览、服务端 PNG、动态 scene 的字体 family 来自相同合同；平台资源定位不再只有四个文件白名单。

验证：11 个字体文件浏览器实际解码成功；10 个字体选项的实际 PNG 均有独立像素结果；字体/描边/铜色渐变经过隔离保存、切档重读。平台正式页面、共享云函数和H5共享绘制已发布，未修改生产模板或发放记录；旧客户端新字体卡通过服务端完整PNG兼容。实际发布、测试同步及读回边界见 [本次记录](releases/player-card-fonts-stroke-20261028.md)。

以下为早期接入说明，实际上线状态以上节及发布记录为准。平台后台逐字段配置号码、位置、姓名、球衣名、身高、体重的外观；球员 H5 仅调整人物，不开放事实或文字排版修改。

配置扩展保持 x/y/size/weight/color，增加 font、fontStyle、letterSpacing、fillMode，以及 gradient/start/middle/end/middleEnabled/angle、stroke/width/color、shadow/enabled/color/opacity/x/y/blur。渐变方向 0° 为从左向右、90° 为从上向下，支持两色或三色。每个字段独立设置，提供金色和银色预设及清除效果。字距 -2 到 20；描边 0 到 5；阴影偏移 -10 到 10、模糊 0 到 6、透明度 0 到 1。输入颜色仅接受六位十六进制。旧模板不含新字段时保持纯色、标准黑体、无描边阴影。

合同：cloudfunctions/webLoginApi/player-card-text-styles.json；校验：playerCardTextStyle.cjs；正式 PNG：playerCardRender.cjs。后台、发布更新与 H5 专属卡预览／保存使用同一渲染器（resvg/2-text-styles）。后台排版预览用于拖动，最终大图以同源渲染为准。

## 字体来源

- 标准黑体：既有 Noto Sans SC，保留 fonts/OFL.txt。
- 毛笔楷体：Ma Shan Zheng；原文件 https://github.com/google/fonts/blob/main/ofl/mashanzheng/MaShanZheng-Regular.ttf ，许可证 https://github.com/google/fonts/blob/main/ofl/mashanzheng/OFL.txt 。
- 运动数字：Anton；原文件 https://github.com/google/fonts/blob/main/ofl/anton/Anton-Regular.ttf ，许可证 https://github.com/google/fonts/blob/main/ofl/anton/OFL.txt 。中文缺字回退 Noto Sans SC。

两款新增字体的原文件及各自 OFL 许可证随服务端和后台字体资源一同保存，不依赖用户设备系统字体或外链加载。参考卡的纹理、金属边框和背景仍是模板素材；文字渐变和描边不代表自动生成该图片的完整卡面。


排版方案可同时保存上述文字样式、人物构图及徽标位置。应用时深拷贝到另一张卡的草稿，不携带背景、遮罩、卡级、预装范围或任何球员事实。命名方案保存在 player_card_layout_presets；后续单卡修改不改已保存方案或其他卡。
