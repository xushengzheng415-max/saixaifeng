# 腾讯云 COS CORS 配置指南

## 问题现象

Web 管理端点击"查看"竞赛规程时，弹窗显示"无法在线预览"，浏览器控制台报错：
```
Access to fetch at 'https://...' from origin 'http://localhost:5174' has been blocked by CORS policy
```

这是因为腾讯云 COS（云存储）的文件下载链接默认不允许跨域访问，浏览器出于安全考虑阻止了前端 `fetch` 请求。

---

## 解决方案：配置 COS 存储桶 CORS 规则

### 步骤 1：进入腾讯云 COS 控制台

1. 打开 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入「对象存储」→「存储桶列表」
3. 找到你的云开发环境对应的存储桶
   - 环境 ID：`cloud1-7g8ckb3c7815a011`
   - 存储桶名称通常格式：`cloud1-7g8ckb3c7815a011-1xxxxxx`

### 步骤 2：配置 CORS 规则

1. 点击存储桶名称进入详情页
2. 左侧菜单选择「安全管理」→「跨域访问 CORS 设置」
3. 点击「添加规则」，填写以下内容：

| 字段 | 值 |
|---|---|
| **来源 Origin** | `*`（允许所有域名访问）<br>或分别填写：<br>`http://localhost:5174`（本地开发）<br>`https://你的线上域名`（生产环境） |
| **操作 Methods** | 勾选 `GET`、`HEAD`、`PUT`、`POST`、`DELETE` |
| **Allow-Headers** | `*`（允许所有请求头） |
| **Expose-Headers** | `Content-Length`、`ETag`、`x-cos-request-id` |
| **缓存时间** | `3600`（秒） |
| **AllowCredentials** | **不勾选**（因为 `regulationsUrl` 是临时签名 URL，不需要携带 Cookie） |

4. 点击「保存」

### 步骤 3：验证配置

1. 回到 Web 管理端，刷新页面（F5 或 Ctrl+R）
2. 进入赛事详情页，点击「查看」竞赛规程
3. 如果弹窗正常显示文档内容，说明 CORS 配置成功 ✅

---

## 补充说明

### 为什么用 `*` 而不是指定域名？

- 竞赛规程文件通过临时签名 URL 访问，每次 URL 都会变化
- 使用 `*` 是最简单可靠的方案，不会带来安全风险（文件本身有签名保护）
- 如果担心安全，可以只填你的线上域名 + `http://localhost:5174`

### 配置后还是失败？

1. **清除浏览器缓存**：按 `Ctrl+Shift+R` 强制刷新
2. **检查 URL**：确认 `regulationsUrl` 字段有值，且格式正确
3. **检查存储桶**：确保配置的是正确的存储桶（可能有多个）
4. **等待生效**：CORS 配置通常几秒到几分钟生效

---

## 替代方案（不需要改 CORS）

如果暂时不方便配置 CORS，可以：

1. **下载后查看**：点击「下载原文档」按钮，用本地 Word/WPS 打开
2. **导出为 PDF**：弹窗打开后点击「导出为 PDF」，浏览器会打开新窗口，选择"另存为 PDF"即可
