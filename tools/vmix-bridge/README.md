# vMix 直播桥接配置

本目录只放**不含真实凭据**的示例配置。真实配置包含 liveFeed 的 `token` 和生产 `matchId`，
必须放在仓库外，禁止提交。

## 真实配置放在哪里

固定位置（仓库外）：

```
%LOCALAPPDATA%\SxfVmix\vmix-bridge.json
```

默认示例见 [config.example.json](config.example.json)（`token` / `matchId` 为占位符）。

## 使用方法

1. 首次配置：把 `config.example.json` 复制到仓库外目标位置，再填入真实 `token` 与 `matchId`：

```powershell
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\SxfVmix"
Copy-Item tools\vmix-bridge\config.example.json "$env:LOCALAPPDATA\SxfVmix\vmix-bridge.json"
notepad "$env:LOCALAPPDATA\SxfVmix\vmix-bridge.json"
```

2. 启动桥接工具时用环境变量指到该文件：

```powershell
$env:VMIX_CONFIG_PATH = "$env:LOCALAPPDATA\SxfVmix\vmix-bridge.json"
node <桥接工具入口>
```

3. 兼容旧启动方式：如果本地桥接程序只认固定相对路径 `tools/vmix-bridge/config.json`，
   把仓库外配置复制回来即可（该文件已被 `.gitignore` 忽略，不会被提交）：

```powershell
Copy-Item "$env:LOCALAPPDATA\SxfVmix\vmix-bridge.json" tools\vmix-bridge\config.json
```

`config.json`、`state.json`、`cache/` 都在忽略清单内，`git status` 不应再看到它们。

## 说明

- 本仓库只保存配置样例，桥接程序本身不在本仓库内维护。
- 已提交历史中的旧 `config.json` 曾包含明文 token；删除文件不会清除历史，
  需要由用户决定是否在服务端轮换该 token。
