# 报名表球员栏位按组别上限生成

2026-10-28 下载球队报名表已按用户确认，按当前组别球员报名人数上限动态生成球员栏位；工作人员单独保留。读取rosterLimit，兼容maxPlayersPerTeam/maxPlayers，未配置的历史组别沿用既有35人兜底。1/2/18/23/35/100人栏位、原生控件唯一性、可选字段及23人填表导回回归通过；23人Word渲染3页并逐页检查。功能112b4cbc，预览源码b77a95be已构建发布/preview/admin/，入口/分包/原始Word模板HTTP与SHA-256核对一致，正式/admin/未改。未部署云函数或其他端口。见docs/releases/registration-template-player-limit-20261028.md。

用户确认“根据报名的人数上限来定”。本次只改变下载的空白报名表，不改长期球员库、正式参赛资格、比赛单场名单或后端导入权限。工作人员不占球员栏位；末组不足五人时清空多余栏位的姓名、字段、照片和控件，不产生额外运动员。

优先使用组别规则配置rosterLimit，再兼容maxPlayersPerTeam/maxPlayers；与比赛上场人数和球队报名支数独立。零、负数、小数及非法值报错，不静默截断或向下取整。保留既有姓名必填、勾选资料字段、队徽、服装颜色下拉和责任书。

修改范围：TeamRegistrationWordImporter.vue、registrationTemplate.js、test-registration-template-fields.mjs；本次不更改后端人数校验。

验证：node tools/test-registration-template-fields.mjs通过，动态23人表填写后重新解析为23名球员与3名工作人员，空图片不误作照片。LibreOffice通过documents/render_docx.py渲染三页并查看，人员区块未跨页拆散。PC预览2953模块构建通过，完整静态包上传并读回8项资源。入口SHA-256：a20795040e42f34ec066833340975ba94ccf31bd49e0695a37fb4441c549c994。正式入口摘要：b75b7ffc65cc10eb7cc35ea8999cf2d929706bc6a714d341c326c339bc124163。

证据：.codex-artifacts/registration-template-limit-20261028，含Word样表、三页PNG、PDF与HTTP摘要。本次仅预览，正式发布等待用户验收。
