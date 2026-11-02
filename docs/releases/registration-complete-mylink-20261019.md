# 球员登记完成页排版与「我的」入口（2026-10-19）

## 变更（仅 H5）

`service-account-h5/service-entry.js`：

- **结论移到卡片下方**：完成态原来标题「登记成功 / 已提交球队确认」压在球员卡上方，现用 `insertBefore(title, stage.nextSibling)` 把标题节点移到 `.card-stage` 之后，整页顺序变为「球员卡 → 结论 → 说明 → 入口 → 登记其他球员」。
- **页头状态条不再重复**：完成态 `say(completed ? '' : '球员资料已保存')`，页面上只保留卡片下方一处结论，不再出现「页面顶部 + 卡片上方」两处同句。
- **新增「我的」入口**：`#viewMyCards` → `./me.html`（服务号「我的」，线上 200），文案「前往赛事中心「我的」查看球员卡与积分玩法」；该页再进「我的球员卡」可看基础卡/限定卡与积分明细·计分规则。
- **待确认不给入口**：`pendingConfirm`（档案 `teamId` 为空、卡未生成）时不显示该入口，避免点进去看不到任何东西。
- 缓存标记 `service-entry.js?v=20261019-mylink1`（`join-player.html`、`claim-team.html`）。

## 发布

只上传 3 个改动文件到 hosting 目录 `service-account-h5`，未整目录覆盖（避免带出其他任务未完成改动）：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy <本地文件> service-account-h5/<同名文件>
```

回读（`Cache-Control: no-cache`，原始字节 `Get-FileHash -Algorithm MD5`）：

| 文件 | 线上 md5 | 本地 md5 | 结果 |
|---|---|---|---|
| `service-entry.js` | `F5F2A7A6C1820D3AEADA7BA8490BC2D5` | 同左 | MATCH |
| `join-player.html` | `D431AD5075D110A3B7C61BCD9A9C8211` | 同左 | MATCH |
| `claim-team.html` | `0FE0843513B6128E0E5806C19B9C8807` | 同左 | MATCH |

内容检查：`viewMyCards` ×2、`insertBefore(title` ×1、完成态清空状态条 ×1 均在线；两入口页引用均为 `v=20261019-mylink1`。

> 注意：第一次用 `Invoke-WebRequest -UseBasicParsing` 取 `$r.Content` 再算 md5 会因响应无 charset 被按 ISO-8859-1 解码而与本地不符；须 `-OutFile` 落盘后对原始字节取哈希。

## 测试端同步

`preview/service-account-h5/` 线上只有 `me.html`（个人中心预览），没有 `join-player.html` / `claim-team.html`（实测 404），本次改动无对应测试端可同步。

## 回归

```
node --check service-account-h5/service-entry.js                    通过
node tools/test-service-entry-registration.cjs                      20/20 通过
```

## 真机验收

1. 认领已入队球员 → 完成页：卡在上，「登记成功」在卡下方，其下有「前往赛事中心「我的」查看球员卡与积分玩法」；页头不再重复「登记成功」。
2. 点该入口 → 微信授权后进入 `/service-account-h5/me.html` → 「我的球员卡」→ 基础卡/限定卡与积分明细·计分规则。
3. 新登记待球队确认 → 只有「已提交球队确认」+ 等待确认提示，无「我的」入口。

## 未变更

- 云函数（`webLoginApi` / `getMiniWorkspace` / `tournamentRegistrationFlow`）、小程序本轮未改、未上传。
- 未写生产数据；未提交、未推送 Git。
