# Public backup credential redaction

The local backup keeps the original CloudBase packages unchanged. This public snapshot replaces hardcoded credential literals in three downloaded function files with environment-variable reads:

- `online/formal/cloudfunctions/baiduRemoveBg/index.js`: `BAIDU_API_KEY`, `BAIDU_SECRET_KEY`
- `online/formal/cloudfunctions/removeLogoBg/index.js`: `BAIDU_API_KEY`, `BAIDU_SECRET_KEY`
- `online/formal/cloudfunctions/generateAIImage/test-hunyuan-v3.js`: `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`

The values are not included in this public backup. The local exact downloads remain at `E:\Documents\sxf-football-backups\20261006-pre-1.1\cloudfunctions\formal\`.
