# 会员标识徽章（昵称旁 / 会员卡 / 会员中心）与 H5 发布记录（2026-10-31）

> 起因：用户提出「会员徽章落点……需要补充！会员标识你给我个提示词我去生成」，随后提供自己生成的徽章原图并明确「这是徽章，你把旁边改成透明图层就行！可以加到昵称旁边！作为会员标识」。
> 授权：用户在 2026-10-31 回复「全部对齐发布吧」，授权范围为本文档列出的 H5 正式端与测试端（`/preview/service-account-h5/`）文件上传与回读。

## 一、素材处理（用户原图 → 透明 PNG）

- 用户原图为 24bpp RGB 的**棋盘格「假透明」**（亮格 R≈192-197、暗格 R≈120-137），无可用的 8 位 alpha，直接缩图会保留灰白格子。
- 新增 `tools/cutout-member-badge.py`：不对白色做全局阈值（会掏空足球白色与蜂翅薄荷色），而是先判定「中性灰像素」（通道极差 `<=12`、亮度 `95..235`），**只从画布四边向内做连通生长**，删掉与边缘连通的灰底；再对与背景相邻的一圈中性像素（极差 `<=20`、亮度 `95..245`）置 0，清掉抗锯齿灰边；最后正方形裁剪 + LANCZOS 重采样。
- 输出三档：`service-account-h5/assets/membership/member-badge-512.png`（374,085 B）、`member-badge-256.png`（109,421 B）、`member-badge-96.png`（19,838 B）。
- 校验：透明占比 32.96%，四角 alpha=0，中心 RGB `[211,158,31]`（金色保留），96px 缩略在手机尺寸下清晰。

## 二、代码改动

### 2.1 `service-account-h5/service-personal.js`（`PAGE_VERSION` `v2.13` → `v2.14`）

| 位置 | 改动 |
|---|---|
| 新增 `memberMarkImg(size)` | 统一徽章渲染：`<img class="me-member-mark" src="./assets/membership/member-badge-{size}.png" alt="赛小蜂会员" width height>` |
| 新增 `updateNameMark()` | 「我的」页昵称后的 `#homeNameMark` 容器，**仅当 `subscription.status==='active'`** 时渲染 96px 徽章，到期后自动清空（不做二次判定，仍以服务端 `subscription` 为准） |
| 首页昵称行 | `<h1>'+esc(name)+'<span class="me-name-mark" id="homeNameMark" aria-label="会员标识"></span></h1>` |
| 会员卡 `homeMemberCard()` | 档位胶囊内徽章 + 档位文字（`me-member-badge`） |
| 会员中心 `membershipCenterHtml()` | 头部 `mp-hero-title` 内徽章 + `档位 · 剩余 N 天` |
| `loadHomeAccount()` 成功 / catch 两支 | 在 `updateHomeWallet();updateHomeMember();` 后追加 `updateNameMark();` |

> 口径：徽章**纯展示**，不替代档位文字、不参与权益判定；资格一律来自服务端 `servicePrivateAccountData.membership.subscription`。

### 2.2 `service-account-h5/service-personal-polish.css`（+6 行）

```
.me-home-profile h1 .me-name-mark{display:inline-flex;align-items:center;margin-left:6px}
.me-home-profile h1 .me-name-mark .me-member-mark{width:18px;height:18px;display:block}
.me-member-badge .me-member-mark{width:14px;height:14px;margin-right:4px;vertical-align:-2px;display:inline-block}
.mp-hero-title .me-member-mark{width:20px;height:20px;margin-right:6px;vertical-align:-4px;display:inline-block}
.me-member-mark{object-fit:contain}
```

### 2.3 `me.html`

- 正式端：发布前线上 `me.html` **已是** `?v=20261031-badge1` 版本（1,223 B / `D06BD53D16AC7B719E6F8CDDF209389DEC104B5B424A190C24423C4340D57897`，另含 `i18n-fixed-en.js` / `i18n-runtime.js` 引用），但当时线上 JS/CSS/PNG 仍是旧版，属于「版本号先行」的半发布状态；本轮补齐 JS/CSS/PNG 后**未再改动正式 `me.html`**（发布前后哈希一致）。
- 测试端：线上 `preview/service-account-h5/me.html` 仍为 `?v=20261030-ins5`（1,097 B），本轮以其为基线只替换两处版本号 → 1,101 B / `BC20689DE9BA84A905D13BF047D8AB4B5604642E947BDED72F977F0FB0B0F0E6`。**未带入正式端专属的 `i18n-*` 脚本引用**：实测 `preview/service-account-h5/i18n-fixed-en.js` 与 `i18n-runtime.js` 均 404（正式端为 200 / 6,012 B、10,552 B），若照搬会引入 404 依赖。

### 2.4 自检

- `tools/test-membership.cjs`：新增 `PAGE_VERSION='v2.14'`、`memberMarkImg`、`id="homeNameMark"`、`member-badge-96.png` 存在性与 `?v=2026103x-…` 版本号断言。
- `tools/test-membership-h5-render.cjs`：新增「会员卡内显示徽章」「已开通会员中心头部显示徽章」两条（7 项）。
- `tools/test-h5-pay-result.cjs`：版本串断言放宽为 `/2026103\d-(?:payresult|badge|ins)\d*/`，避免版本号推进导致误报。

## 三、验证

| 检查 | 结果 |
|---|---|
| `node --check service-personal.js`（拟发布包） | 通过 |
| `node tools/test-membership.cjs` | 32/32 通过 |
| `node tools/test-membership-h5-render.cjs` | 7/7 通过 |
| `node tools/test-h5-pay-result.cjs` | 9/9 通过 |
| 发布包与线上逐行比对 | `service-personal.js` 仅 7 处（8 增 5 删）；CSS 仅 +6 行；无其他会话改动夹带 |

## 四、发布（2026-10-31）

- 基线：发布前重新回读线上 `service-account-h5/` 与 `preview/service-account-h5/` 各 3 个文件，两端 `service-personal.js` 均为 99,737 B / `4F413FAB30F6582F722D20B518AFE3EE98595FE20FE37D2CCECAED77B8801832`、`service-personal-polish.css` 均为 38,859 B / `EC6BE05964F246FF15BC0D231D2E185FEFC89281C4717088CE838D70267B9404`。
- 上传：`hosting deploy` 单文件上传，正式 5 个文件（`service-personal.js`、`service-personal-polish.css`、3 个 PNG）+ 测试端 6 个文件（再加 `me.html`），全部返回「文件上传完成」。

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `service-personal.js` | 100,411 B | `94FC39F4CFD17D6EF0C785B02161C678CEC3CB121780DF3B5B414D49F2DAC0E4` |
| `service-personal-polish.css` | 39,393 B | `BF555AE0D24A7E0297485D76B743DB69A9C0156DFE9D1C7D7138884B0BBCB1CC` |
| `member-badge-512.png` | 374,085 B | `04A54C4BB3DCA3830FE80B2A169AC3B352CE608E820C77B296585945A12C8586` |
| `member-badge-256.png` | 109,421 B | `7A52EF328FF29C1F3CF4D417A7CF8CE5A32FEE84C6ADCD4CE4525386232311D2` |
| `member-badge-96.png` | 19,838 B | `0331ED87987E43C14280A1C14680282F9276034402AD647BF0871E6EE849C26B` |
| 正式 `me.html`（未改动） | 1,223 B | `D06BD53D16AC7B719E6F8CDDF209389DEC104B5B424A190C24423C4340D57897` |
| 测试端 `me.html` | 1,101 B | `BC20689DE9BA84A905D13BF047D8AB4B5604642E947BDED72F977F0FB0B0F0E6` |

- 回读（`Cache-Control: no-cache` + `?v=20261031-badge1`，以字节 SHA-256 一致为判据）：**12/12 全部 MATCH**

| 地址 | 结果 |
|---|---|
| `https://www.sxffootball.cn/service-account-h5/me.html` | 200 / 1,223 B / `D06BD53D…` MATCH（与发布前一致） |
| `https://www.sxffootball.cn/service-account-h5/service-personal.js` | 200 / 100,411 B / `94FC39F4…` MATCH |
| `https://www.sxffootball.cn/service-account-h5/service-personal-polish.css` | 200 / 39,393 B / `BF555AE0…` MATCH |
| `https://www.sxffootball.cn/service-account-h5/assets/membership/member-badge-512.png` | 200 / 374,085 B / `04A54C4B…` MATCH |
| `…/member-badge-256.png` | 200 / 109,421 B / `7A52EF32…` MATCH |
| `…/member-badge-96.png` | 200 / 19,838 B / `0331ED87…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/me.html` | 200 / 1,101 B / `BC20689D…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/service-personal.js` | 200 / 100,411 B / `94FC39F4…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/service-personal-polish.css` | 200 / 39,393 B / `BF555AE0…` MATCH |
| `https://www.sxffootball.cn/preview/service-account-h5/assets/membership/member-badge-512.png` | 200 / 374,085 B / `04A54C4B…` MATCH |
| `…/member-badge-256.png` | 200 / 109,421 B / `7A52EF32…` MATCH |
| `…/member-badge-96.png` | 200 / 19,838 B / `0331ED87…` MATCH |

- 发布前两端 `member-badge-96.png` 均为 404，本轮首次上线；未改云函数、数据库、平台后台、小程序与其他端口。

## 五、遗留与待确认

1. **徽章发放范围冲突待用户裁决**：`docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md` 的权益矩阵写「专属卡框/徽章 仅专业/家庭」，而 `docs/MEMBERSHIP_SUBSCRIPTION_DESIGN_2026-10-28.md` 与本次实现按「任意档位在有效期内即显示」。本次按用户原话「作为会员标识」按有效期内显示，未按档位区分；若确认只给专业/家庭，需要在前端加 `levelCode` 判定，并统一改两处文档。
2. **小程序端未接**：球队端 `miniprogram/`（AppID `wx57164cca8676f411`）本轮未改动；球员端「赛小蜂足球世界」（AppID `wxa0ac7d45bcabd140`）**不在本仓库**，需用户提供工程路径才能接同一 PNG。
3. **到期提醒**仍是页面内「即将到期」（`expiresSoon`，≤3 天），未做主动推送：渠道（服务号模板消息 / 小程序订阅消息）、模板 ID 与发送时点需用户确认后另做。
4. **会员二期权益**（卡面背景库、多套卡面保存、数据长图导出、赛季报告）在会员中心仍如实标「即将开放」，需用户确认先做哪几项。
5. 仓库工作区 `service-account-h5/service-personal.js` 另含其他会话尚未发布的两处改动（`my-main-card.html` 路由、FAQ 裁判任务文案），本次发布包��从线上基线差量构建（`work/h5-publish-20261031`），**未**上传工作区整文件，线上与仓库工作区因此存在已知差异。
