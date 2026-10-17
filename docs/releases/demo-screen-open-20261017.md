# Demo draw screen opening fix — 2026-10-17

- Formal source: 7ce64f87. Preview source: 68caa910.
- Native anchor links replace scripted popup opening in quick grouping and hybrid draw consoles. Publish local state before navigation, retain noopener/noreferrer.
- Demo-only screen route accepts both /admin/ and /preview/admin/ deployment bases; real tournament IDs remain excluded.
- Browser inspection with isolated synthetic demo: clicking the actual component opens a new screen tab; subsequent grouping changes appear live through browser-local state synchronization.
- Formal build and deployment completed. HTTP 200 and SHA-256 exact readback: 377/377 files at https://www.sxffootball.cn/admin/ (2026-10-17T10:08:14Z).
- Preview build and deployment completed. HTTP 200 and SHA-256 exact readback: 390/390 files at https://www.sxffootball.cn/preview/admin/ (2026-10-17T10:07:07Z). Preserved existing preview tutorials.
- No cloud functions or mini-program uploaded. No production match records changed.
