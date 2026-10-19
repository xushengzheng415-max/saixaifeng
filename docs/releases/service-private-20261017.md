# 服务号“我的”接口修复（2026-10-17）

状态：已归档，个人静态目录首版已由同日[球员与裁判个人数据v2](service-personal-data-20261017.md)替代。以下保留首版发布事实，不能作为当前页面或数据范围说明。

## 原因与范围

正式与预览 `me.html` 均调用 `servicePrivateOAuthUrl`、`servicePrivateOAuth`、`servicePrivateOverview`，但实际线上 `webLoginApi` 没有这些分发入口；无会话和已有会话两条链路均断开。线上无身份探针复现“未知操作：servicePrivateOverview”。

新增 `cloudfunctions/webLoginApi/servicePrivate.cjs`，在原 HTTP 入口注册三个 action，复用既有服务号配置、微信身份会话和数据中心分页读取器。固定回跳正式/预览个人页；一次性 OAuth state 区分用途及有效期。前端更新缓存标识为 `20261017-private1`，保留两份入口各自原有脚本依赖。

## 数据与权限

- 从有效服务号会话取得官方 OpenID，再解析既有自然人绑定；不信任客户端 userId、手机号、机构或角色。关注标志只用于消息投递，不使有效账号绑定失效；撤销、替换、解绑、禁用的绑定不允许通过旧裁判身份回退。
- 无账号绑定且无撤销记录时，兼容已有服务号身份中明确验证过的手机号；必须唯一命中自然人账号。兼容 `phone`/`phoneNumber`，重复或冲突阻断，不按姓名、组织名称或未验证电话关联。
- 只返回本人/监护球员、直接拥有或有效成员关系的球队、直接拥有或有效赛事共享授权及球队参赛关联的赛事、本人手机号对应裁判展示资料。共享授权校验赛事机构、有效期和允许的权限；不返回整队球员库、证件、手机号原文或机构私有经营数据。
- 复用数据中心 `readAll/readByIds` 分页、上限报错和 `synthetic` 来源过滤；不新增统计算法。此修复提供上述关系摘要；比赛统计/相关比赛尚未在此接口聚合，不能把空数组解释成已确认零场。缺失人数、场次不再由页面显示成0。
- 无安全绑定显示既有业务绑定指引，不从通用菜单新建/合并账号。不迁移或改写真实球队、球员、名单、赛果；OAuth仅使用原状态/会话集合。

## 验证与发布

`tools/test-service-private.cjs` 15项通过：合法关系与页面渲染、无会话/伪造/过期会话、重复手机号、绑定冲突、旧关注标记、撤销绑定、裁判兼容、数据库失败、签名图片范围、OAuth固定回跳/用途/一次性及丢失state。夹具不读写生产业务数据。数据中心同步检查、核心回归、13组球员卡回归与治理检查通过。

以刚下载线上包 `df3e3bc29fa8abf0bd7803d706e142cf712401fbdcf5696b3ef832c734747603` 为基准，代码差量仅 `index.js` 路由与新增 `servicePrivate.cjs`；发布前逐次核对线上摘要，执行相对依赖扫描及实际上传目录裁判表防回退检查。最终代码包摘要 `21ca1ddfbb11d6aed671c73dd3a30981b3d217e74a57f6a9157123f12451ceb7`。完整回下载逐文件核对；唯一允许差异是npm隐藏锁文件的license/workspaces描述元数据，依赖内容保持一致。原环境变量、运行时、内存、超时、Handler、角色与VPC保持。

正式/预览各2个页面文件已上传：`service-private.js` SHA-256 `cb9100d878cc34f5cb90e0f1feeb0ddd0cc5668781442069715ec9bcc2ac3072`；正式 `me.html` `4631d8d884627540221cbce17a7e237a9eebf7e2f3807c35d1f6c62ff7ef6918`；预览 `me.html` `d6fc0211dd79aef5987ad25b4ee2884af73ab67045b2598414aec56628506437`。

证据：`.codex-artifacts/service-private-20261017/verification.json`；真实HTTP检查无/伪造会话返回 `SERVICE_PRIVATE_AUTH_REQUIRED`，无效授权返回 `SERVICE_PRIVATE_OAUTH_INVALID`，OAuth地址正常且固定回跳个人页。个人真实微信授权和完整业务数据展示仍需手机验收；本轮不冒充已通过真实用户登录。不上传小程序、不发布PC、不推送Git。
