# 我的球员卡 H5：编辑卡面入口与 AI 定妆照提示（2026-11-03）

## 背景

线上正式页 `/service-account-h5/card-world/index.html`（title「我的球员卡 · 赛小蜂足球」）只有
「卡面设置」一个入口且位于主卡区，卡库里每张卡只有「设为主卡」；用户反馈看不到编辑卡面、
换背景，也没有被提醒可以合成自己的 AI 定妆照。

## 线上基线（核对后确认）

| 文件 | 线上实际来源 |
|---|---|
| `card-world/index.html`、`card-world/js/app.js` | 提交 `6db69827`（holo4 发布） |
| `card-world/js/api.js` | 提交 `1ab69b4f`（换回线上裁判回调、支持 H5 预览鉴权） |
| `card-world/css/app.css`、`css/holo-cosmos.css`、`js/holo.js` | 提交 `6db69827` |

仓库此前没有与线上一致的副本：`main` 甚至不含 `service-account-h5/card-world/` 目录，
当前工作分支（`codex/platform-ops`）里的同路径文件是另一套「赛小蜂足球世界」全量玩法页
（index.html 14,708 B）。因此本次改动基于线上真实基线，不做整包覆盖。

## 本次改动

分支 `codex/h5-card-world-edit-20261103`（基于 `6db69827`，并把 `api.js` 对齐到线上 `1ab69b4f`）：

1. 卡库每张卡新增「编辑卡面」，复用已有卡面设置（背景 + 照片构图），不新增解锁逻辑。
2. 主卡下方新增「对背景或形象照不满意？」提示卡，按钮直达服务号「球员登记 · 形象照」的
   AI 定妆照（`../registration-resume.html`）。
3. 卡面设置弹层顶部新增 AI 定妆照引导块。
4. 修正三处把换照片/照片合成指向小程序的旧文案：小程序只负责签约与组阵。
5. 资源版本号 `css/app.css`、`js/app.js` 更新为 `?v=20261103-ai1`。

页面不自判会员资格、背景解锁条件与蜂蜜消耗，全部沿用服务端返回。

## 发布状态

| 目标 | 路径 | 状态 |
|---|---|---|
| 测试（独立副本） | `/preview/service-account-h5/card-world-ai/` | 已发布，回下载字节一致（index 9,682 B、css 12,538 B、app.js 19,561 B） |
| 测试（依赖补齐） | `/preview/service-account-h5/registration-resume.html`、`.js` | 已发布（原 404，取正式字节） |
| 正式 | `/service-account-h5/card-world/` | **未发布，待授权** |

预览页：<https://www.sxffootball.cn/preview/service-account-h5/card-world-ai/index.html>

注意：`/preview/service-account-h5/card-world/` 上仍是另一套全量玩法页（在途未验收），
本次没有覆盖它，改动放在独立 `card-world-ai` 副本中，避免清除他人未验收内容。

## 验证

- `node --check` 通过：`card-world/js/app.js`、`js/api.js`
- 回下载字节级 SHA-256 一致：index.html / css/app.css / js/app.js
- 页面标记回读：`ai-panel`、`btn-ai-portrait`、`v=20261103-ai1` 均存在
- 待真机确认：卡库「编辑卡面」打开设置、AI 按钮跳到球员登记并能看到「智能生成」形象照
