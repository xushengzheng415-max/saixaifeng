# PC 端部署说明

PC 端代码固定使用本仓库中的 `web-admin-vue` 目录。

## 正确路径

- 源码目录：`web-admin-vue`
- 构建产物：`web-admin-vue/dist`
- CloudBase 环境：`cloud1-7g8ckb3c7815a011`
- 静态托管目标路径：`admin`
- 线上访问前缀：`/admin/`

`vite.config.js` 中已配置：

```js
base: '/admin/'
```

因此部署时必须把 `web-admin-vue/dist` 上传到 CloudBase 静态托管的 `admin` 目录，不能上传仓库根目录、旧本地目录或其他 dist。

## 推荐部署命令

在仓库内执行：

```powershell
cd web-admin-vue
npm run build
tcb hosting deploy dist/ admin -e cloud1-7g8ckb3c7815a011
```

或者直接执行：

```powershell
cd web-admin-vue
npm run deploy
```

`npm run deploy` 会先构建当前仓库代码，再上传 `dist/` 到 `admin` 路径。

## 部署前检查

```powershell
git status --short
cd web-admin-vue
npm run build
```

确认构建产物来自当前仓库代码后，再执行上传。