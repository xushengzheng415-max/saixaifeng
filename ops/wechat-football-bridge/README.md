# 赛小蜂足球微信接口固定出口中转

固定入口：`https://api.saixiaofeng.com/wechat/football/v1`
固定公网出口：`124.221.239.63`

该服务只允许三个受控动作：接口探测、生成服务号带参关注二维码、发送服务号模板消息。请求必须携带时间戳、随机数和 HMAC-SHA256 签名；用于获取普通 `access_token` 的服务号 AppSecret 保存在服务器环境变量中，不写入仓库。现有服务号网页 OAuth 链路仍按原配置运行，不在本中转的三个动作范围内。

运行前提：Ubuntu、Node.js 18 或更高版本、Nginx，以及 `api.saixiaofeng.com` 的现有有效 HTTPS 证书。

服务器环境变量文件 `/etc/sxf-wechat-football-bridge.env` 至少包含：

```text
SXF_BRIDGE_SHARED_SECRET=<独立随机密钥>
SXF_FOOTBALL_SERVICE_ACCOUNT_APPID=<服务号AppID>
SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET=<服务号AppSecret>
```

Nginx 的 `http` 级配置需先声明（部署包中的 `nginx-rate-zone.conf`）：

```nginx
limit_req_zone $binary_remote_addr zone=sxf_wechat_bridge:10m rate=5r/s;
```

再把 `nginx-location.conf` 中的 location 合并进 `api.saixiaofeng.com` 现有 HTTPS server，禁止覆盖其他 location。部署后先验证 `/health`，再将 `124.221.239.63` 加入“赛小蜂足球助手”API IP 白名单，最后验证 `probe` 和带参二维码。

CloudBase 中需要为调用方函数配置：

```text
SXF_FOOTBALL_WECHAT_BRIDGE_URL=https://api.saixiaofeng.com/wechat/football/v1
SXF_FOOTBALL_WECHAT_BRIDGE_SECRET=<与服务器 SXF_BRIDGE_SHARED_SECRET 相同>
```

部署顺序必须是：服务器进程与 Nginx 就绪 → `/health` 返回成功 → 服务号白名单加入 `124.221.239.63` → 签名 `probe` 成功 → 配置并部署 CloudBase 调用方 → 单条验收。报名服务端硬门禁必须最后上线，避免中转未就绪时阻断正式用户。

服务器侧签名探针：`sudo node /opt/sxf-wechat-football-bridge/probe.js`。脚本只输出 HTTP 状态与微信错误/成功结果，不输出 AppSecret 或中转共享密钥。

Windows 正式仓库部署两个调用方时，使用 `cloudbaserc.function-deploy.json` 明确限定 `cloudfunctions/`，避免 CloudBase CLI 在仓库根目录误打包 PC 依赖与其他工程文件。
