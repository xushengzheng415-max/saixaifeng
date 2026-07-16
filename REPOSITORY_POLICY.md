# Repository Policy

## 唯一正式代码库

本项目唯一正式本地代码库是：

`E:\Documents\sxf-football`

所有代码修改、备份、提交、推送、构建和部署都必须以该目录为准。

## 不再作为代码源的目录

`E:\OneDrive\Desktop\足球赛事系统` 仅作为旧资料或旧备份，不作为开发、提交或部署来源。

`C:\Users\Frank\.codex\worktrees\...` 是 Codex 临时工作树，不能直接作为最终部署源；其中有效修改必须同步回正式代码库后再提交、构建和部署。

## PC 端部署

源码目录：

`E:\Documents\sxf-football\web-admin-vue`

构建并部署：

```powershell
npm run build
tcb hosting deploy dist/ admin -e cloud1-7g8ckb3c7815a011
```

部署上传必须使用正式代码库里的 `web-admin-vue\dist`。

## 远端仓库

默认主远端：`origin` = `https://gitee.com/saixiaofeng/saixiaofeng.git`

GitHub 远端：`github` = `https://github.com/xushengzheng415-max/saixaifeng.git`
