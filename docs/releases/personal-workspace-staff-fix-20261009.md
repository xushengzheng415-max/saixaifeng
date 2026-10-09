# 子账号本人工作空间引导修复

现象：共享赛事账号打开 organization-onboarding?createPersonalWorkspace=1 后，onboardingWorkspace.state 被 webLoginApi 的赛事子账号中转门禁拒绝，页面只剩业务标题，无法加载机构表单。

修复：本人工作空间的明确引导动作改用既有 onboardingWorkspace 独立鉴权和本人组织归属校验，不使用当前共享赛事的模块授权。state排除tournament_staff_invite成员关系；机构修改、业务开通保留本人机构管理检查。仅state、本人资料、机构创建/修改、业务选择、青训创建/咨询可走此路径；其他函数及未知动作不变。不增加赛事授权，不修改用户、机构、共享权限或业务数据。

生产部署与真实页面读回待补充。
