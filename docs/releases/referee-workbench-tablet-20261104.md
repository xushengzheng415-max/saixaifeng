# 裁判管理页窄屏/平板横向裁切修复与二维码重生成（测试站）

2026-11-04，用户平板上打开“裁判管理”反馈表格右侧看不到、页面较乱，并询问裁判没扫码时能否再次生成二维码。本次在 `preview` 分支修复页面布局，并在邀请弹窗增加“重新生成二维码”，发布到测试站 `/preview/admin/`；未改动正式 `/admin/`、云函数、数据库与登录/权限链路。

## 布局问题与原因

原实现 `.table-panel{overflow:hidden}` + `table-layout:fixed`，同时 `.capabilities-cell{min-width:180px}` 在固定列宽内撑出内容，操作列三枚按钮 `white-space:nowrap` 又超出单元格，于是内容被面板直接裁掉且无法横向滚动。

隔离数据实测（1280×800，素材不含真实账号与赛事）：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 面板可视宽 / 内容宽 | 1178 / 1230（52px 被裁且不可滚动） | 1206 / 1206 |
| 操作列按钮可见 | 10/15 | 15/15 |
| 名单行高 | 93px（列内文字挤压） | 72px |

## 修改范围

仅 `web-admin-vue/src/views/referee/HeadRefereeManagement.vue`：

- 表格容器改 `overflow:auto` 并给表格 `min-width:1040px`，宽度不足时横向滚动而不是裁切。
- 列宽重排为 裁判13% / 等级14% / 执裁能力12% / 可用时间10% / 本届执裁7% / 当前状态9% / 操作22%。
- `.capabilities-cell` 去掉 `min-width:180px`，超长岗位标签省略号；操作列按钮紧凑化（`padding:6px 11px`）并允许换行。
- 去掉单元格固定 `height:62px`，行高随内容增长，避免按钮溢出到下一行。
- 新增 `≤1366px`、`≤1100px` 响应式：标题与操作按钮换行、工具栏与统计卡降为两列、行内按钮间距收口。

## 二维码能否重新生成

可以。后端 `tournamentRegistrationFlow` 的 `createRefereeFollowInvite` 每次调用都会新建一条 `referee_invitations` 与新的服务号关注闸门，并向微信申请新的临时场景码（`expireSeconds` 2592000，即约 30 天），不做次数限制、也不自动作废旧码。因此裁判未扫码或二维码已过期时，重复生成即可。

为避免“关掉弹窗再重开”才能换码，邀请弹窗新增：

- 页脚“重新生成二维码”按钮，复用同一生成接口，按当前邀请对象（指定裁判或通用邀请）重新出码，按钮带 loading 防重复点击。
- 提示“二维码为临时场景码，30 天内有效；本人未扫码或二维码已过期时，可点‘重新生成二维码’”。
- 未改行为：旧的“重新发送认领”“邀请扫码绑定”入口、认领状态与审核流程保持原样。

## 验证

- `VITE_APP_BASE=/preview/admin/ npm run build` 通过（19.56s）；产物 `HeadRefereeManagement-BO1LN9SO.css`、`HeadRefereeManagement-wXcYn1vC.js`。
- 隔离数据（拦截全部 CloudBase 请求、visualQa 样例、不写真实数据）三种视口：1280×800 与 1548×800 面板无横向溢出、15/15 按钮在可视区、行内溢出 0px；1024×700 表格 1040 > 面板 950，按设计出现横向滚动，行高 113px、按钮不越行。
- 邀请弹窗端到端：首次打开产生第 1 次 `createRefereeFollowInvite` 请求并展示二维码；点击“重新生成二维码”后产生第 2 次请求、二维码地址随 `ticket=qa-1 → qa-2` 变化，提示文案与两个按钮均可见，无页面错误。
- 线上读回 `https://www.sxffootball.cn/preview/admin/assets/HeadRefereeManagement-BO1LN9SO.css` 含 `min-width:1040px`、`width:22%`、`overscroll-behavior-x`、`padding:6px 11px`、`invite-expiry`；`HeadRefereeManagement-wXcYn1vC.js` 下载摘要与本地一致（`A8DC89F67DD9B7C777467E3D276C246658FBC579E1278098CFD9D3F0E6F7A4D7`）且含新增文案。本次 `/preview/admin/` 共 409 文件部署成功。
- 本地产物摘要：`index.html` `896941415593FEAC3357B9C0212CCF0EE86C84108B73A601E717D11A3C6A0592`，裁判页 CSS `00D6118BF21C718C0E726B049DD2A0BAB6D75499F235DC2FBE1BD87FD04C4D43`。证据见 `output/referee-table-layout-20261104/`（修复前后 `result-*.json`、三视口截图、`invite-modal-first.png`、`invite-modal-regenerated.png`、`invite-regenerate-check.json`）。

以上为浏览器隔离验证与线上读回，未在真机平板复验；最终确认需用户在平板内刷新后查看。

## 仍需处理

- 截图中仍有固定侧栏，说明用户端打开的是未含平板布局的正式 `/admin/`（或旧缓存）。平板布局与本次修复目前只在测试站；合入 `main` 并发布正式 `/admin/` 需单独授权。
- `VisualQaHub` 中“裁判管理”跳转仍写作 `/referee/head-referee?tournamentId=…`，实际路由为 `/tournaments/:id/referees`，点击会落到赛事空间；本次未改，可另行修正。
