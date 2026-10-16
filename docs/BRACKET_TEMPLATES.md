# 足球通用签表模板

版本：football-bracket-template/1。组件为所有赛事和组别共用，不创建赛事专属页面，不写死赛事ID、球队、队数、轮次或比分。

## 模板目录

| 模板ID | 自动识别条件 | 用途 |
|---|---|---|
| group_knockout | 有小组名次来源，无负者排位关系 | 小组赛结束后的淘汰赛 |
| single_elimination | 无小组名次和排位来源 | 直接淘汰赛 |
| ranked_knockout | 存在排位阶段或负者去向 | 淘汰赛与名次赛 |

模板只控制布局、列标题和节点尺寸。赛程来源始终是实际比赛的homeSource/awaySource，不因选择模板生成或修改对阵。正式结果、点球胜者、已取消记录、未知关系及重复场序遵循统一赛果与来源规则。

## 复用入口

通用组件web-admin-vue/src/components/tournament/TournamentBracket.vue接收matches，默认templateId=auto；传入任意已授权赛事的resultCenter.knockout即可生成该赛事各组别完整签表。date、keyword只筛下方对阵详情；open事件进入既有赛果页面。若业务已明确固定展示类型，可传上表templateId；默认无需赛事管理员设置。

模板注册表为utils/bracketTemplates.js；图关系和自适应轮次布局为utils/tournamentBracket.js。后续新赛事复用这三个文件，禁止按赛事名分支或复制整个组件。若增加新的赛制关系，扩展统一来源契约与模板目录，已有赛事使用同一个入口。

## 数据与权限

不保存球队个人资料、不中转登录凭据、不另算积分、不自动推进晋级、不修改真实比赛。读取通过既有赛事授权resultCenter；只使用已批准赛果判胜。队数、轮次、比分、胜负和线路由比赛数据变化自动更新。