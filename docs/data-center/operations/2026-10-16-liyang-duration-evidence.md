# 立洋杯历史时长补齐（2026-10-16）

## 授权与目标

用户已明确确认立洋杯每半场30分钟、两个半场、全场60分钟，并要求不再逐场重复核实。目标赛事 `22dda3756aa93fd70002a29257a61fe6`；三个组别已锁定的规程一致。

## 实际执行

- 读取37场已结束比赛：26场已有60分钟时长依据，11场缺少依据。
- 保存原记录备份；SHA-256：`2d548408232cabc69d19c881894db7183bef04c7ec116609a817a44fb606a1f6`。
- 仅对以下11场执行精确ID、赛事、组别、已结束状态以及原时长依据不存在的条件更新；每场 matched=1、modified=1，无upsert。
- 仅补durationVerification，写入30×2=60、用户授权来源、锁定规程版本、操作人、原因、时间与修订号。
- 37场回读经统一resolveMatchDurationEvidence确认全部ready且totalMinutes=60；其他读取字段一致。未写比分、阵容、事件、球员或赛前规程快照。

| 比赛ID | 核实修订号 |
|---|---|
| 22dda3756aadf4bf017112cd22b7e531 | 74980fde-9f3a-4dae-8c88-2e837cf71fce |
| 22dda3756aadfe80017437b436c23e04 | 20b10e32-e1f9-48ff-aff8-308b0fbedea9 |
| 22dda3756aafcc7802015a643fb38235 | ff779b11-e506-4d6b-9e63-0a0aa565028d |
| 6d00d0e56aadfe8000621f2915df2c15 | 34fa84ef-000e-4e24-bbdd-c457b96d4cff |
| 6d00d0e56aafcc780085b7f86a1c49b4 | 27221faf-fb23-4924-b0cf-a0f371136b1b |
| 92994ce06aadfe80009dbf422a0441bf | f6570347-7c22-4bda-9cb2-d328a590b816 |
| 92994ce06aafcc7800d0c79b3c39acf2 | ea1fa8dc-f357-4353-aee0-fdc738f6c624 |
| d7580c016aadf4bf017d8c7c6ca9652d | b3620d36-0365-41ab-a5d6-a9c5dfe4ccc0 |
| d7580c016aadf4bf017d8c7d3b3161f0 | 93f7aad0-f819-451f-ace0-564983d5b2bb |
| d7580c016aadfe80018084f023e24c9a | d52801e7-9f77-4de9-8f72-0e0d54b5978e |
| d7580c016aafcc78020814a13dcee07c | 4dc471d0-87fb-4f26-9387-9871e896d256 |

本地证据：work/player-card-preflight-20261016/{duration-before,duration-plan,duration-after}.json。原始备份不提交仓库。

## 后续边界

缺阵容、缺事件及球员档案关联问题仍需原始报告或准确身份依据；本次没有猜测或批量补造这些数据。
