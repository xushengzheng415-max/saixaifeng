# 球员卡文字样式

本地候选，未上线。平台后台逐字段配置号码、位置、姓名、球衣名、身高、体重的外观；球员 H5 仅调整人物，不开放事实或文字排版修改。

配置扩展保持 x/y/size/weight/color，增加 font、fontStyle、letterSpacing、fillMode，以及 gradient/start/middle/end/middleEnabled/angle、stroke/width/color、shadow/enabled/color/opacity/x/y/blur。渐变方向 0° 为从左向右、90° 为从上向下，支持两色或三色。每个字段独立设置，提供金色和银色预设及清除效果。字距 -2 到 20；描边 0 到 5；阴影偏移 -10 到 10、模糊 0 到 6、透明度 0 到 1。输入颜色仅接受六位十六进制。旧模板不含新字段时保持纯色、标准黑体、无描边阴影。

合同：cloudfunctions/webLoginApi/player-card-text-styles.json；校验：playerCardTextStyle.cjs；正式 PNG：playerCardRender.cjs。后台、发布更新与 H5 专属卡预览／保存使用同一渲染器（resvg/2-text-styles）。后台排版预览用于拖动，最终大图以同源渲染为准。

## 字体来源

- 标准黑体：既有 Noto Sans SC，保留 fonts/OFL.txt。
- 毛笔楷体：Ma Shan Zheng；原文件 https://github.com/google/fonts/blob/main/ofl/mashanzheng/MaShanZheng-Regular.ttf ，许可证 https://github.com/google/fonts/blob/main/ofl/mashanzheng/OFL.txt 。
- 运动数字：Anton；原文件 https://github.com/google/fonts/blob/main/ofl/anton/Anton-Regular.ttf ，许可证 https://github.com/google/fonts/blob/main/ofl/anton/OFL.txt 。中文缺字回退 Noto Sans SC。

两款新增字体的原文件及各自 OFL 许可证随服务端和后台字体资源一同保存，不依赖用户设备系统字体或外链加载。参考卡的纹理、金属边框和背景仍是模板素材；文字渐变和描边不代表自动生成该图片的完整卡面。


排版方案可同时保存上述文字样式、人物构图及徽标位置。应用时深拷贝到另一张卡的草稿，不携带背景、遮罩、卡级、预装范围或任何球员事实。命名方案保存在 player_card_layout_presets；后续单卡修改不改已保存方案或其他卡。
