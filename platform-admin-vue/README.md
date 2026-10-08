# 平台运营后台

长期分支：`codex/platform-ops`。正式站：<https://pingtai.sxffootball.cn/>。

```powershell
cd E:\Documents\sxf-football\platform-admin-vue
npm ci
npm run dev
npm run build
npm run deploy
```

独立依赖、路由、素材和构建配置；不得引用 `web-admin-vue/`。统一球员卡绘制模块与字段协议从仓库公共目录引用。发布细则见 [平台发布规则](../docs/PLATFORM_OPS_RELEASE.md)。
