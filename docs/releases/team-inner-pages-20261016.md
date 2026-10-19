# 球队内页修复候选

仅处理球队详情、成员、球员库、参赛管理，不改外层卡片。用户授权直接上传后，沿用1.1.30，于2026-10-16 20:07上传开发包，未递增版本号；体验版指向未代查，尚未提交正式审核。

球队详情由首页摘要改为已授权teamProfile读取负责人及完整度，未知不记零。参赛关系按有效记录/组别去重并与已验证账号参赛摘要核对，默认打开有内容的分类。球队视角跳转携带workspace/team/division，不能落到主办方视图。

成员接口补充账号nickname等显示字段，读取球队coaches稳定关联，呈现主教练、领队、队医、联络员职务。资料行标记已登记，实际账号按原成员状态显示；不授予权限或创建账号。重复历史联系人仅做展示去重，保留来源ID和姓名冲突。球队球员库改用中性邀请入队入口，人物照片aspectFit完整展示。

参赛管理移除取消/删除旧赛程，复用共享currentMatch、sideId和lifecycle-v1；完整读取，移除同名球队匹配。线上只读核对开封立洋球队截图：唯一已取消场次无日期时间，故旧页显示待定；不改写该场次。长赛事名完整换行，比赛改为时间、对手、轮次/场地和状态操作分层，不再挤在单行。

专项test-mini-team-inner-pages、原test-mini-player-library、数据中心回归、部署副本和治理检查通过，JS语法及相关diff空白通过。原生使用实际页面复制品和隔离传输层，不调用生产接口；390×844逻辑视口验证2场有效赛程、长赛事名16px字体/正常换行、3名模拟工作人员及5类筛选（兼任计入对应类别），实际PNG149×321。证据位于`.codex-artifacts/team-inner-pages-20261016/`。真实人员角色、赛程、名单和账号未写入。

getMiniWorkspace以刚下载线上包为基线，仅替换teamMembersForWorkspace、teamParticipationForWorkspace并新增teamMemberView.cjs；发布前核实线上CodeSha256未变。20:05:18更新后Active，Nodejs18.15/150秒/512MB、handler、role、VPC和环境配置保持。回下载index.js与teamMemberView.cjs逐字节一致；5898其他文件一致，node_modules/.package-lock.json只有13项license元数据变动，依赖集合/版本保持。目标源码SHA分别为fc04ce6d066596f0eac6c10af3cbc4f953a6768cc690a89f6d542abec2b8402e、fe8107643b7b889f595b2978af2b9e9c4913ca189b632604e3cfd431edad7941。未发布其他云函数、PC或H5。

官方工具上传回执：总包2450238、主包1686825、球队分包332852字节。上传描述包含工作人员、报名去重、取消赛程过滤及赛程排版；赛事详情标签改为只显示组别。上传不是体验版标记，真实手机仍待用户测试。
