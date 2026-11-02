# 赛小蜂 · 球员玩法 H5 高保真原型

路径：`/workspace/h5-final-pages/`  
气质：深色玻璃页 + FUT 熔金框主卡 + **Cosmos / Nebula 星云箔光**（跟手倾斜）。

## 如何打开

1. **推荐**：本地静态服务（避免个别浏览器对 `file://` 字体/陀螺仪限制）
   ```bash
   cd /workspace/h5-final-pages
   python3 -m http.server 8765
   ```
   浏览器打开 `http://127.0.0.1:8765/`
2. **也可**：直接双击 / 用浏览器打开 `index.html`（箔光跟手仍可用）。

手机宽优先（`max-width: 430px`），桌面居中。

## 三页可玩闭环（V1）

```
我的主卡 ──快捷入口──► 去签约 / 去组阵
     │                      │
     │                      ▼
     │              卡册·签约（每日每日免费签约 mock）
     │                      │ 签约成功 →「去组阵」横幅
     │                      ▼
     └──────────────► 组阵（填满 5 人含门将）
                            │
                            ▼
                     发起轻挑战（非排位）
                            │
                            ▼
                     结果面板：完成度 + 徽章 mock + 分享阵容
                     （弱化胜负 · 无排行榜 · 无支付）
```

| Tab | 说明 |
| --- | --- |
| **我的主卡** | 大卡 Cosmos 动效；中性数据；成长印记；**快捷入口「去组阵 / 去签约」**一键跳 Tab |
| **卡册 / 签约** | 网格小卡；每日每日免费签约；**签约成功后明确「去组阵」引导**；空态 / 样卡图例说明 |
| **组阵** | 5 人阵（1GK+4）；填满后可点 **「发起轻挑战」**；结果面板展示完成度、徽章奖励 mock、分享阵容；**无胜负、无排行榜** |

样例球员：铁栋泽 / TIE D.Z. / 前锋 / 10（卡面图：`assets/tie-dongze-card.png`）。

## 试用路径（建议）

1. 打开主卡页 → 点 **去签约** → 点「每日免费签约」→ 出现「去组阵」横幅。
2. 点 **去组阵**（或底部 Tab）→ 点空位选人，凑齐 5 人（含门将）。
3. 「发起轻挑战」亮起 → 点下 → 看结果面板（完成度 100%、三枚徽章、分享阵容）。
4. 也可从主卡直接点 **去组阵** 跳过签约。

## 特效怎么触发

- **默认 auto-holo**：静止时 CSS 循环星云彩光扫带（一眼可见）。
- **指针 / 触摸**：晃鼠标/手指 → 倾斜更强、箔光更亮。
- **入场 showcase**：主卡加载后约 4.2s 醒目扫光，随后交给 auto-holo。
- **陀螺仪**：主卡页点「陀螺仪」（iOS 需授权；建议 HTTPS）。
- **实现**：`css/holo-cosmos.css` + `js/holo.js`。参考 [cards-css cosmos/Nebula](https://kongyo2.github.io/cards-css/)，**纯 CSS 箔光，勿用整页截图假箔光**。

## 目录

```
h5-final-pages/
  index.html
  README.md
  css/app.css
  css/holo-cosmos.css
  js/holo.js
  js/app.js
  assets/tie-dongze-card.png
  assets/logo-saixiaofeng.png
  assets/cosmos/…
```

无构建依赖；字体走 Google Fonts CDN（离线时可忽略）。

## 给 Cursor 落地的注意（建议抽组件）

落到仓库 `service-account-h5` / `shared/player-card` 时建议：

1. **组件边界**
   - `PlayerHoloCard`：卡面 DOM（front / shine / glare）+ mask
   - `useHoloPointer`：指针 / 陀螺仪写 CSS 变量
   - `CosmosFoil`：仅样式与纹理变量，可换 `gold` / `holo` 等 effect
2. **卡面造型**用现有绘制/PNG 管线；箔光层叠在卡上并用卡图 alpha 做 `mask-image`。
3. **禁止**把箔光烘进静态海报再当「动效」；分享图可另导出无动画帧。
4. 数据：出场/进球等中性字段；无支付、无排行榜入口。
5. 本原型路径可作为视觉与交互对照：`/workspace/h5-final-pages/`。

## 合规（V1）

全免费；无支付；无排行榜；签约为免费 mock；轻挑战只记完成度与徽章，不比胜负。

## 特效参考与素材归属
- 层结构对照 [poke-holo.simey.me Galaxy/Cosmos Holofoil](https://poke-holo.simey.me/)（simeydotme/pokemon-cards-css）
- 星云纹理图来自该演示的 `cosmos-*.png`（Galaxy Holo 原归属 aschefield101）
- 实现为自有 FUT 卡面 + CSS 复刻层叠，非整站抄袭
