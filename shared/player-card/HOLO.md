# Cosmos / Nebula 轻箔（主卡）

对标 [poke-holo Galaxy/Cosmos](https://poke-holo.simey.me/)，视觉源：`h5-final-pages` 与 Figma「我的主卡 · V2」。

| 文件 | 用途 |
| --- | --- |
| `holo.js` | 指针 / 陀螺仪 / 入场 showcase，写 CSS 变量 |
| `holo-cosmos.css` | 星云底 + 彩虹 `color-dodge`，空闲透明度约 `0.28`，`soft-light`，脸部遮罩 |
| `holo/cosmos/*.png` | 星云纹理（Galaxy Holo 素材归属 aschefield101） |

同步到 H5：`node tools/sync-dynamic-player-card.mjs`（含 `--check`）。

H5 入口页：`service-account-h5/my-main-card.html`。卡面成图仍走动态绘制 / 成卡 URL；箔光叠在整卡上，不改模板内部排版。分享图勿把箔光烘进静态 PNG。
