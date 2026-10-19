# 子账号本人工作空间引导修复

现象：共享赛事账号打开 organization-onboarding?createPersonalWorkspace=1 后，onboardingWorkspace.state 被 webLoginApi 的赛事子账号中转门禁拒绝，页面只剩业务标题，无法加载机构表单。

修复：本人工作空间的明确引导动作改用既有 onboardingWorkspace 独立鉴权和本人组织归属校验，不使用当前共享赛事的模块授权。state排除tournament_staff_invite成员关系；机构修改、业务开通保留本人机构管理检查。仅state、本人资料、机构创建/修改、业务选择、青训创建/咨询可走此路径；其他函数及未知动作不变。不增加赛事授权，不修改用户、机构、共享权限或业务数据。

已获用户明确批准该放行范围并正式部署webLoginApi；以刚下载现网包为基线，6551文件中仅index.js变化。线上回下载8项关键源码SHA-256全部匹配，裁判识别/分组保存/纸质报告签名、原staffRelayRights、动态卡和数据服务保持一致。

使用用户现有浏览器会话检查原 organization-onboarding?createPersonalWorkspace=1 入口：权限错误消失；识别已有机构后正常进入赛事空间，原立洋杯共享授权及十项模块仍可显示。未代用户创建机构或修改赛事授权。主分支与preview均已接入同一限定修复。
