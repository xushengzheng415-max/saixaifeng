# 赛小蜂公众号 SSH 草稿工具

这是一个只允许“检查凭据、上传图片、创建草稿”的 Node.js 18+ 命令行工具。它不包含群发、发布、删除或更新已有草稿的接口。

## 账号隔离

“赛小蜂日记”的服务器目录固定为：

```text
/home/ubuntu/wechat-saixiaofeng-diary/
```

每个公众号必须使用独立目录、`.env.local`、`.cache/` 和 `receipts/`，不得共用 AppID、AppSecret 或 access token 缓存。

## 配置

将 `.env.example` 复制为 `.env.local`，由服务器管理员在服务器终端中录入凭据。不要通过聊天、Git 或文章包传递凭据。

```text
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
ARTICLE_AUTHOR=蜂狂小编
WECHAT_THUMB_MEDIA_ID=
```

服务器权限：

```bash
chmod 700 /home/ubuntu/wechat-saixiaofeng-diary
chmod 600 /home/ubuntu/wechat-saixiaofeng-diary/.env.local
```

## 命令

只验证文章包，不请求微信：

```bash
node wechat-draft.js validate --input article.json
```

验证凭据、IP 白名单和草稿接口权限：

```bash
node wechat-draft.js doctor
```

创建新草稿：

```bash
node wechat-draft.js draft --input article.json
```

成功后仅输出草稿 `media_id`，并把不含凭据的回执写入 `receipts/`。

## 文章 JSON

```json
{
  "title": "文章标题",
  "digest": "120 字内摘要",
  "content_html": "<p style=\"text-indent:2em;\">...</p>",
  "cover_path": "assets/cover.jpg",
  "content_source_url": "",
  "content_images": [
    {
      "placeholder": "__IMAGE_1__",
      "file_path": "assets/image-1.jpg",
      "alt": "图片说明"
    }
  ]
}
```

`content_html` 中的图片使用 `<img src="__IMAGE_1__">` 占位。工具会先把本地图片上传到微信，再替换为微信返回的 URL。
