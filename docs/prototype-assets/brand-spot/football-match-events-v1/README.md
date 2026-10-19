# Football match-event icons V1

- Status: accepted for the service-account H5 timeline on 2026-09-27.
- Generator: `oil-icon` using the confirmed `football-brand-v1` construction system.
- Source sheet: `../../icon-source/oil-icon/football-match-events-v1/raw/football-match-events-v1-sheet.png`.
- Cutout mode: floodfill on uniform `#808080` background, threshold `30`, 4 × 4 grid, first four cells only.
- QA: `qa-magenta.png` composites every transparent cutout on magenta; no grey background or neighbouring-cell bleed accepted.

| Cell | Semantic | Runtime asset | H5 target |
| --- | --- | --- | --- |
| 01 | 进球 | `service-account-h5/assets/match-events/goal.png` | 比赛事件时间轴 |
| 02 | 换人 | `service-account-h5/assets/match-events/substitution.png` | 比赛事件时间轴 |
| 03 | 黄牌 | `service-account-h5/assets/match-events/yellow-card.png` | 比赛事件时间轴 |
| 04 | 红牌 | `service-account-h5/assets/match-events/red-card.png` | 比赛事件时间轴 |

## Frozen style spec

- Palette: `#087A48` deep emerald outline, `#EAF7EE` pale mint fill, `#F6A019` amber highlight, `#DF5045` red-card semantic accent, `#808080` source-sheet background.
- Construction: 24-unit keyline, front-facing flat geometry, rounded green outline, consistent optical padding, 45-degree arrows, football/pitch motif, no shadows outside the mark.
- Production boundary: these transparent PNGs are named shared assets for the H5 event timeline only. They are not for bottom navigation or dense generic controls.

## Generation prompt

Professional youth-football brand spot icons in the confirmed Saixiaofeng palette and construction system; four first-row marks are football scoring into goal, substitution with green incoming and red outgoing arrows, yellow card, red card; remaining twelve 4 × 4 cells are empty `#808080`; no text, numbers, labels, frames, shadows, or watermarks.
