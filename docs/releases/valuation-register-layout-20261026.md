# 身价自测登记引导排版（2026-10-26）

状态：本地候选，未部署正式或测试站，无后端、小程序、数据库变更。

## 范围

- `service-account-h5/valuation-self-test-next-step.js`：仅重排 register 视图。短标题、步骤提示、位置/年龄/身高/体重摘要、一个“验证手机号并登记”主操作。登记 URL 与自测 sid、身高/体重/位置传参保持。移除本步建队开放标签容器，避免未登记就跳建队；登记完成后仍由 self-register 链路查本人球队、搜索/新建。
- `service-account-h5/valuation-self-test-onboarding.css`：新增限定作用域样式，消除 main/next-stage 双重内边距，24px 页面边距、两列字段、统一按钮高度与底部操作区，无新增依赖或装饰素材。
- `service-account-h5/valuation-self-test.html`：登记样式和脚本缓存标记 `20261026-layout1`。
- 原本地原型 `work/wechat/2026-10-23-valuation/self-test-preview.html` 与文章 `preview.html` 未覆盖。截图对应的是正式候选 H5 的登记引导，不是文章页。

## 设计参考

参考 Flowbite 开源分步组件的信息层级：[仓库](https://github.com/themesberg/flowbite)、[Stepper](https://flowbite.com/docs/components/stepper/)。同时研究 shadcn 的移动底部步骤条模式，仅取结构，不安装 React/Tailwind 或替换既有原生 H5。页面延续品牌绿色，不复制第三方成套主题或代码。

步骤中的“邀请队友”仅指球队管理者后续已有邀请流程，不表示所有球员拥有邀请管理权限；后端授权不变。

## 验证

`node tools/test-valuation-register-layout.cjs`：320/390/430/1280px 的唯一主按钮、资料显示、真实登记链接参数、返回结果与横向溢出检查通过，无页面脚本异常。外部请求全部拦截，未产生生产互动或注册记录。

实际渲染截图：`work/wechat/2026-10-23-valuation/register-layout-20261026/register-mobile.png`。

发布前应按当前线上基线精确上传这三个前端文件并回读，另按已登记入口同步测试；本轮未执行发布，不将本地视觉通过等同微信真机注册完成。
