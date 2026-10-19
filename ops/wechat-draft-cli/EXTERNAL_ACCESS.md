# 外部草稿账号

2026-10-07 已配置独立账号 `wechat-drafts@124.221.239.63`，SSH 端口22。

公钥备注：`dot-wechat-drafts-2026-10-07`。
公钥指纹：`SHA256:BVl9I6PgAhdu4W5dS8zJ7ucPPrlWgztM3gRp341RGPY`。

服务器 SSH 主机公钥（ED25519）指纹：`SHA256:6+nUWoV0PRBV170m3N5Bb/40n/Ad6plvQQl47xAw/D8`。
管理员于2026-10-07通过既有SSH连接从 `/etc/ssh/ssh_host_ed25519_key.pub` 重新读回核验。该指纹用于核对服务器身份；上面的客户端公钥指纹用于核对获准登录的客户端，两者不可混用。

当前状态：服务器账号和命令权限已配置，接收方的受支持远程任务环境尚未完成注册和端到端连接验证，不能标为“已连通”。当前助手只具备现有主机上的SSH访问能力，没有注册接收方远程环境的工具。受限草稿账号不提供普通终端，因此也不能直接替代需要普通SSH终端的远程开发主机。

远程任务环境接通后的第一次操作仅允许 `doctor`；此阶段不上传文章，不运行 `draft`，不创建草稿。

只支持 doctor、upload、validate、draft、receipt、help。SSH 公钥使用 restrict 和强制命令，禁止终端及端口转发。账号不具有普通 sudo 权限，不可读取公众号配置。网关由 root 管理，调用草稿工具时使用 ubuntu 身份。文章包保存在 `/var/lib/sxf-wechat-drafts/`，上传后由 root 保管。

测试连接：

```sh
ssh -i 私钥路径 -o IdentitiesOnly=yes wechat-drafts@124.221.239.63 doctor
```

上传使用本目录 `upload-package.py`，需要 Python 3 和 OpenSSH：

```sh
python upload-package.py --key 私钥路径 --name article-20261007 --dir 文章包目录
ssh -i 私钥路径 -o IdentitiesOnly=yes wechat-drafts@124.221.239.63 validate article-20261007
ssh -i 私钥路径 -o IdentitiesOnly=yes wechat-drafts@124.221.239.63 draft article-20261007
ssh -i 私钥路径 -o IdentitiesOnly=yes wechat-drafts@124.221.239.63 receipt article-20261007
```

文章包含 article.json 及其引用的封面、正文图片，相对路径必须限制在包内。不支持普通 SCP/SFTP 和交互终端。每包最多100个文件，单文件10MB，传输JSON最多64MB。重名上传拒绝；成功草稿重复执行返回已有回执；创建尝试中发生未知结果时阻止自动重试，由管理员核对微信草稿后处理。

服务器权限检查已验证：doctor可用，普通命令、跨目录路径、凭据读取和通用sudo被拒绝。本次未创建草稿；对方私钥未提供，因此需对方实测SSH公钥登录。
