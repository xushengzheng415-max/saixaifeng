# 演示球队一键审核

用户要求仅在演示模式提供一键通过。报名列表与球队管理页显示一键审核通过，处理当前赛事/组别全部pending虚拟球队，无需勾选。真实数据模式隐藏，操作时再次核验模式与demo-范围。直接demoRequest调用浏览器独立方法，不用cloud请求；组别归属及全部目标记录先校验后更新，复用原演示审核与持久化回滚。球员身份认证及其他组别不由此快捷操作改变。

变更仅TournamentTeams.vue、demoWorkspace.mjs及入口登记；未修改生产函数、权限、业务数据。

构建正式和预览均通过，各上传390文件。预览入口/cloud/TournamentTeams JS/CSS 4项HTTP200且SHA-256一致；正式入口、cloud、主分包与TournamentTeams JS/CSS全部回读匹配。未运行额外测试或操作真实审批。main与preview包含同一功能提交4161220f，原共享工作区未提交改动保持原样。
