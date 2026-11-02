# PC正式基线对齐 2026-11-02

状态：正式/测试PC源码、线上版本身份及桌面客户端核验通过。用户确认以已上线正式版为基准，测试独有功能保存在独立开发分支，测试站与正式版一致。本轮不修改、上传或发布小程序、H5、APK及共享云函数。

## 已核定基线

主办方正式构建ee7e7d29，main5537e3c6包含文档记录；正式入口index摘要02d00d823ec0ef1dfc7e8e0fca24cc6af6eab4629e8ee4549bb9f77af6c3b902。证件类型、完整报名编辑、头像、逐人审核及通知修复均在正式基线内。

原preview2a1cba29有20个PC文件差异（含转会中心、平板导航、队徽图像处理、上传错误透传及名单列宽），已保存在GitHub分支codex/pc-preview-preserved-20261102，不强制重置历史、不部署这些测试功能到正式。原工作目录其他未提交PC/小程序/H5/后端草稿原样保留，不混入已上线代码。

平台后台独立分支codex/platform-ops保持独立：线上77c40d01对应平台源码，与当前远端7ef70aee之间平台及其共享绘制依赖无源码差异；现有平台dist的入口、版本标识及JS/CSS共14项HTTP/摘要匹配，无需重复部署或与main混合。

Windows0.2.8源码原未进入main，现将48个既有源文件/图标/测试/构建说明补入Git；16个实际打包运行文件与已安装app.asar逐字节一致，17项单元测试通过。既有安装包摘要ace817167db4e8b917f4d5d8cc6986af18f91cd1015b38e2a5bba61eacd67fbb与线上清单一致，app.asar摘要5844815af7fd927c324e86102912f0a6d1dd711cbe36965d0f606de91ccff9fe；不改版本、不重打同版本安装包。

## 版本证明

新增pc-release.json：分别记录通道、构建提交、正式基线、PC源码摘要、是否有未提交PC改动和构建时间。正式/测试的base、构建时间及合并提交可不同，PC源码摘要必须一致；小程序提交不改变PC源码身份。check-pc-alignment.mjs同时核对Git源码、线上两个标识及Windows清单版本，避免再按提交时间或客户端壳版本猜测页面新旧。版本标识测试仅使用隔离临时Git夹具。

正式构建eee0c24f，最终测试构建0305e951，PC源码摘要均为8cd64afe724a541183d9bb10376c357a63a58fb9d26c108ffadc583f4d3a0fe7，sourceDirty均false，两个版本标识均指向正式基线eee0c24f。main/preview的web-admin-vue、desktop-windows及既有PC共享模块Git身份完全一致；两站入口、版本文件及全部JS/CSS各209项HTTP200/SHA-256匹配本地。原测试20文件及8份专项测试保存在上述开发分支，不在正式/测试活动代码中。Windows两通道各8项通过，17项单测通过；Git中的16个已打包运行文件与安装版逐字节一致。平台正式45项静态文件HTTP/摘要全部匹配原构建，不重新部署。

本地main原e5bbe66a、preview原f91d1d79，在验证无独有提交且无worktree占用后，以CAS快进更新到远端对应正式/测试基线；当前工作区的platform-ops及其他未提交草稿未切换或覆盖。归一发布后记录提交不改变PC源码摘要。

核验命令：node tools/check-pc-alignment.mjs --live。完整记录见[读回](pc-formal-alignment-20261102.readback.json)。任务两份发布记录按白名单归档并摘要核验；全量知识库的既有人工镜像冲突保留，不覆盖旧规范。
