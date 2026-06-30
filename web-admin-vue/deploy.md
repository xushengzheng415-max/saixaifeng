# 云开发静态托管部署指南

## 方法一：通过微信开发者工具部署（推荐⭐）

### 步骤1：构建项目
在 PowerShell 中执行（使用绕过执行策略）：
```powershell
powershell -ExecutionPolicy Bypass -Command "cd 'C:\Users\Administrator\Desktop\足球赛事系统\referee-system\web-admin-vue'; npm run build"
```

### 步骤2：上传到云开发静态托管
1. 打开 **微信开发者工具**
2. 点击左上角的 **"云开发"** 按钮
3. 进入 **"静态网站"** 标签页
4. 点击 **"上传文件"** 或 **"部署网站"**
5. 选择 `web-admin-vue/dist` 文件夹
6. 等待上传完成

### 步骤3：获取访问地址
上传完成后，会获得类似这样的网址：
- `https://cloud1-7g8ckb3c7815a011-xxx.tcloudbaseapp.com`

---

## 方法二：使用云开发CLI（需要解决PowerShell权限）

### 步骤1：修改PowerShell执行策略（管理员权限）
以管理员身份运行 PowerShell，执行：
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 步骤2：安装云开发CLI
```bash
npm install -g @cloudbase/cli
```

### 步骤3：登录并部署
```bash
# 登录
tcb login

# 部署
cd web-admin-vue
tcb framework deploy
```

---

## 配置说明

已创建的配置文件：
- `cloudbaserc.json` - 云开发部署配置
- `.env.production` - 生产环境变量
- `vite.config.js` - 已添加构建配置

---

## 注意事项

1. **免费额度**：云开发静态托管有免费额度，一般够用
2. **HTTPS**：自动提供HTTPS，无需配置
3. **CDN加速**：自动启用CDN加速
4. **自定义域名**：如需自定义域名，可在云开发控制台配置

---

## 部署后访问

部署成功后，你可以通过以下方式访问：
- 云开发提供的默认域名
- 配置的自定义域名（如有）
