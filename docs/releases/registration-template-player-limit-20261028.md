# 报名表球员栏位按组别上限生成

2026-10-28 下载球队报名表已按用户确认，按当前组别球员报名人数上限动态生成球员栏位；工作人员单独保留。读取rosterLimit，兼容maxPlayersPerTeam/maxPlayers，未配置的历史组别沿用既有35人兜底。1/2/18/23/35/100人栏位、原生控件唯一性、可选字段及23人填表导回回归通过；23人Word渲染3页并逐页检查。功能112b4cbc，预览源码b77a95be已构建发布/preview/admin/，入口/分包/原始Word模板HTTP与SHA-256核对一致，正式/admin/未改。未部署云函数或其他端口。见docs/releases/registration-template-player-limit-20261028.md。

用户确认“根据报名的人数上限来定”。本次只改变下载的空白报名表，不改长期球员库、正式参赛资格、比赛单场名单或后端导入权限。工作人员不占球员栏位；末组不足五人时清空多余栏位的姓名、字段、照片和控件，不产生额外运动员。

优先使用组别规则配置rosterLimit，再兼容maxPlayersPerTeam/maxPlayers；与比赛上场人数和球队报名支数独立。零、负数、小数及非法值报错，不静默截断或向下取整。保留既有姓名必填、勾选资料字段、队徽、服装颜色下拉和责任书。

修改范围：TeamRegistrationWordImporter.vue、registrationTemplate.js、test-registration-template-fields.mjs；本次不更改后端人数校验。

验证：node tools/test-registration-template-fields.mjs通过，动态23人表填写后重新解析为23名球员与3名工作人员，空图片不误作照片。LibreOffice通过documents/render_docx.py渲染三页并查看，人员区块未跨页拆散。PC预览2953模块构建通过，完整静态包上传并读回8项资源。入口SHA-256：a20795040e42f34ec066833340975ba94ccf31bd49e0695a37fb4441c549c994。正式入口摘要：b75b7ffc65cc10eb7cc35ea8999cf2d929706bc6a714d341c326c339bc124163。

证据：.codex-artifacts/registration-template-limit-20261028，含Word样表、三页PNG、PDF与HTTP摘要。上述为预览阶段记录；现已获用户授权正式发布，最终状态见下节。


## 正式发布与测试同步

2026-10-28 用户授权后，报名表按组别报名人数上限生成球员栏位已正式发布并同步测试：仅选择报名表3文件进入main（正式源码c1929cff），未将preview的同期登录、平板或转会功能带入正式。main合回preview（测试源码86e77db5）并按测试base重新构建发布，保留其原功能。两端入口、Word源模板及关键分包分别8项HTTP200且SHA-256与对应构建一致；1/2/18/23/35/100人数、可选字段、原生控件唯一性及23人填表导回回归通过。未部署后端、小程序或H5。见docs/releases/registration-template-player-limit-20261028.md。

正式源码：`c1929cffda37f38fcc17ad8b1766ee080433062c`，2945模块/41.46秒构建通过；测试源码：`86e77db524b90309cbb75d5fbd306593c853f4e8`。两端分别构建部署，不复用正式dist到测试路径。正式入口SHA-256：`a7b61309e5539379381a8749d84ee7a57b2de05534592631976185fffb17fb89`；测试入口SHA-256：`6a8c335c9ae62fe309d4db580f40e83824e7e7ae453b5898dc93b77e7c1c24f0`。读回明细为`.codex-artifacts/registration-template-limit-20261028/{formal,preview}-release-http.json`。
