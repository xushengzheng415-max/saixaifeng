# 赛小蜂统一微信客服分流

统一承接“赛小蜂客户分流”应用的回调，同时保留既有企业微信外部联系人功能，并为三个微信客服账号提供四项业务路由：

- `football`：赛小蜂足球客服；
- `basketball`：赛小蜂篮球客服；
- `event_service`：赛小蜂赛事客服的赛事服务；
- `software_development`：赛小蜂赛事客服的软件定制。

生产回调继续使用 `https://api.saixiaofeng.com/wecom/customer`，只能由这一套服务消费。不得为足球、篮球或赛事应用再配置竞争回调。

## 安全模式

首次部署固定使用：

```text
WECOM_KF_ENABLED=true
WECOM_KF_DRY_RUN=true
WECOM_KF_SEND_ENABLED=false
```

该模式只完成回调验签、事件识别和本地路由计划，不调用 `sync_msg`，不读取真实客服消息，也不发送欢迎语。现有外部联系人处理继续由 `WECOM_ROUTER_ENABLED` 独立控制。

四条首次欢迎语保存在 `welcome-rules.json`，生产通过 `WECOM_KF_WELCOME_RULES_JSON` 加载。只有进入会话事件同时带有 `welcome_code` 且 `WECOM_KF_SEND_ENABLED=true` 时才允许调用事件响应消息接口；发送关闭时仅产生 `welcomeStatus=planned` 的路由摘要。

真实 Token、EncodingAESKey、Secret 和其他凭据只能存在于服务器私密环境文件中，不得写入仓库、测试输出或日志。旧 Token 和 EncodingAESKey 已因截图暴露，必须在本服务部署成功后由管理员重新生成并与服务器同步更新。

管理员在企业微信页面生成新值但尚未保存时，在本机运行 `rotate-wecom-callback.ps1`。脚本使用隐藏输入并通过 SSH 标准输入更新服务器，不在命令行、控制台或日志中输出凭据；服务器显示健康后，管理员立即回到企业微信页面保存。

## 四路配置格式

`WECOM_KF_ACCOUNT_ROUTES_JSON` 使用以下结构，真实 `openKfId` 仅写入服务器配置：

```json
[
  {"openKfId":"<football>","account":"football","defaultRoute":"football","scenes":{"football":"football"}},
  {"openKfId":"<basketball>","account":"basketball","defaultRoute":"basketball","scenes":{"basketball":"basketball"}},
  {"openKfId":"<event>","account":"event","defaultRoute":"event_service","requireChoiceWhenUnknown":true,"scenes":{"event_service":"event_service","software_development":"software_development"}}
]
```

赛事客服从无场景的旧入口进入时标记为 `needsChoice`，后续启用发送能力后应先提供“赛事服务 / 软件定制”二选一，不得擅自归入软件定制。

## 验证

```powershell
node --check core.js
node --check index.js
node --check server.js
npm test
```

健康检查只返回开关、账号数量和业务路由名称，不返回任何账号标识、客户消息或凭据。
