# 球员登记「确认恢复入队」报「未知操作：serviceEntryConfirmRestore」修复（共享后端差量发布）

- 日期：2026-10-31，Asia/Shanghai。
- 授权：用户反馈截图后指令「你需要修复」。
- 目标：共享正式后端 `webLoginApi`（环境 `cloud1-7g8ckb3c7815a011`，运行时 `Nodejs18.15`）。
- 结果：差量发布成功（COS），线上探针已不再返回「未知操作」。

## 现象

服务号球员登记 H5（`www.sxffootball.cn`）走到「确认恢复入队」表单，填写球衣号码、勾选授权后点提交，页头红字：

```
未知操作: serviceEntryConfirmRestore
```

## 根因

该文案只来自 `cloudfunctions/webLoginApi/index.js` 顶层 `switch` 的 `default` 分支（`'未知操作：' + action`）。

链路排查结果：

| 环节 | 状态 |
|---|---|
| H5 `service-account-h5/service-entry.js:271` 提交时调 `serviceEntryConfirmRestore` | 已发布（线上回读 HTTP 200 / 93,893 字符，含该调用） |
| `webLoginApi/service-entry.js:294` 的 action 处理器 | 已存在，线上与本地逐字节相同（25,028 B / `CF3A6338BDEAE9B8A94BC91DB2E59C2F2776AA934E1CB3497464FBB6F12AC66B`） |
| `getMiniWorkspace/playerRegistration.cjs:199` 的 `confirm_restore` 业务逻辑 | 已实现且已上线（同一次「恢复入队」搜索能在线上返回 `restorable`，说明该文件版本在线） |
| `webLoginApi/index.js` 的 `case 'serviceEntryConfirmRestore'` | **缺失**（本地与线上都缺，见下） |

即：前端和业务模块都已就绪，**只差 index.js 里的一行路由 case**，请求进不到模块就返回了「未知操作」。

系统性比对：`service-entry.js` 共 17 个 `serviceEntry*` 处理器，修复前路由覆盖 16/17，唯一缺口就是 `serviceEntryConfirmRestore`；修复后 17/17。

## 修复

`cloudfunctions/webLoginApi/index.js` 在 serviceEntry 分支补一行（另加 2 行说明注释）：

```js
case 'serviceEntryCheckPlayerId':
// 递卡确认：恢复/转入本队（H5 restoreForm 提交）。service-entry.js 已实现该操作，
// 缺此 case 时请求会落到 default 返回「未知操作：serviceEntryConfirmRestore」。
case 'serviceEntryConfirmRestore':
```

只补路由，不改业务逻辑、不改 H5、不改 `getMiniWorkspace`。

## 发布与验证

1. 基线：`fn code download webLoginApi` → `work/webLoginApi-online-20261031`（6,701 文件），线上 `index.js` 425,525 B / `D3521157…`，确认确实没有该 case。
2. 暂存：`work/webLoginApi-publish-20261031` 为线上包全量副本，只对 `index.js` 插入 3 行；`git diff --no-index` 与线上基线对比为 **1 个文件、3 行新增、0 删除**（`work/patch-webLoginApi-confirm-restore.mjs`）。
3. `node --check` 暂存 `index.js` 通过。
4. 发布前强制检查：`node tools/check-referee-backend-package.cjs work/webLoginApi-publish-20261031` → PASS（含报名 Word 上传范围与裁判表完整性检查）。
5. 上传：`fn code update webLoginApi --dir work/webLoginApi-publish-20261031 --deployMode cos` → `✔ Function code updated successfully`。
6. 回下载 `work/webLoginApi-after-20261031`（6,701 文件）：`index.js` 425,786 B / `CE01F64E1DC5CE360713285EC9990CCD0D218480B1FA40A40AF0D799888B79AF` 与上传包完全一致；`service-entry.js` 仍 `CF3A6338…`（未变）。
7. 回下载包再次执行 `check-referee-backend-package` → PASS。
8. `fn list --json --limit 100` 回读：`webLoginApi` `Status=Active`、`DeployMode=code`、`Runtime=Nodejs18.15`、`ModTime=2026-10-31 13:23:57`。
9. 线上探针（无会话 POST `{"action":"serviceEntryConfirmRestore"}`）返回：

```
{"success":false,"code":"SERVICE_ENTRY_FAILED","error":"登记会话已失效，请从服务号重新打开"}
```

而不是之前的「未知操作」，证明路由已在线、鉴权在前。

## 边界

- 只发布代码，未改运行配置、环境变量、内存、超时、依赖安装方式。
- 未改数据库、未创建业务数据；探针不带会话，不写库。
- H5 与小程序本轮未改，无测试端需要同步；`webLoginApi` 为共享正式后端，无独立测试副本。
- 正式文件 `cloudfunctions/webLoginApi/index.js` 仍与其他会话的未发布改动处于同一工作区（工作区未提交），本轮发布包以线上包为基线，**没有夹带本地其他改动**。
- 真实微信端到端：**2026-10-31 用户回读确认该球员已成功入队**（球员库可见），恢复入队链路端到端通过；未再要求重新邀请或另建档案。
