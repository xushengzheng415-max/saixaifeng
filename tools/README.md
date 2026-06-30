# 队徽抠图工具

## 问题背景

队徽图片通常是这样的结构：

```
+----------------------------+
|  白色/纯色背景              |  <- 要去掉
|   +--------------------+   |
|   |  队徽图案          |   |
|   |    [白色元素]      |   |  <- 要保留！
|   |    [蓝色/红色]     |   |
|   +--------------------+   |
+----------------------------+
```

**普通去白底方法**（如 PS 魔棒、颜色阈值）会把所有白色像素删掉，包括队徽内部的白色足球、文字等。

**rembg AI 抠图** 使用深度学习模型（U2-Net）识别前景物体，能智能区分"背景白"和"图案内的白"，只去掉背景。

---

## 安装

### 1. 安装 Python 依赖

```bash
pip install rembg[cpu] Pillow
```

> 如果已经有 GPU（NVIDIA + CUDA），可以用 `pip install rembg[gpu]` 加速处理。

### 2. 下载 AI 模型（重要！首次使用必须）

模型文件 `u2net.onnx`（约 170MB）需要下载到本地：

**方式一：自动下载（需要能访问 GitHub）**
第一次运行脚本时会自动下载，但国内网络可能失败。

**方式二：手动下载（推荐）**

浏览器打开以下任一链接下载：
- 官方地址：https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
- 国内镜像：https://gh.api.99988866.xyz/https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx

下载后放到这个目录：
```
C:\Users\你的用户名\.u2net\u2net.onnx
```

比如用户 `Administrator` 就放到：
```
C:\Users\Administrator\.u2net\u2net.onnx
```

---

## 使用

### 单张处理

```bash
python remove_logo_bg.py logo.png
# 输出: logo_nobg.png

# 指定输出文件名
python remove_logo_bg.py logo.png -o output.png
```

### 批量处理

```bash
# 批量处理 logos/ 目录下所有图片，输出到 logos/output/
python remove_logo_bg.py -d ./logos/

# 指定输出目录
python remove_logo_bg.py -d ./logos/ ./output/
```

支持的格式：`.png` `.jpg` `.jpeg` `.webp` `.bmp`

---

## 集成到上传流程（已完成）

前端已集成，上传队徽时自动调用 rembg 抠图：

```
用户上传队徽 → 前端调用 http://127.0.0.1:5566/remove-bg
                ↓
                                rembg AI 抠图（U2-Net）
                ↓
                                返回透明背景 PNG
                ↓
                                上传到 COS 云存储
```

### 启动服务（每次上传前）

**方式一：双击 bat 脚本（推荐）**
```
双击运行：tools\start_rembg.bat
```

**方式二：命令行**
```bash
cd "C:\Users\Administrator\Desktop\足球赛事系统\referee-system\tools"
python rembg_server.py
```

启动成功会显示：
```
==================================================
  rembg 队徽抠图服务
==================================================
  地址: <ADDRESS_REMOVED>
  健康检查: <ADDRESS_REMOVED>
  抠图 API: <ADDRESS_REMOVED>
==================================================
```

### 前端行为

上传队徽时，前端会：
1. **优先**调用本地 rembg 服务（`127.0.0.1:5566`）
2. 如果服务未启动，**自动回退**到 Canvas 去白底方案
3. 在预览区显示使用的方案（AI 智能抠图 / Canvas 简单去白底）

### 验证服务是否在线

浏览器访问：<ADDRESS_REMOVED>

返回 `{"status": "ok", "service": "rembg-server"}` 表示正常。

---

## 注意事项

1. **每次上传前需启动服务**：`start_rembg.bat` 双击运行，保持窗口打开
2. **端口占用**：默认 5566 端口，如果被占用请修改 `rembg_server.py` 中的 `PORT` 变量
3. **服务仅本地访问**：`HOST=127.0.0.1`，只允许本机调用，安全
4. **生产环境**：建议部署到服务器，并修改前端 `REMBG_SERVICE_URL` 指向服务器地址
5. **模型只需下载一次**：`C:\Users\Administrator\.u2net\u2net.onnx`（168MB）

---

## 效果对比

| 方法 | 背景白色 | 图案内白色 |
|------|---------|-----------|
| Canvas 去白底 | ✅ 去掉 | ❌ 也去掉 |
| rembg AI 抠图 | ✅ 去掉 | ✅ 保留 |

---

## 文件清单

| 文件 | 作用 |
|------|------|
| `tools/rembg_server.py` | Python Flask 服务，封装 rembg |
| `tools/start_rembg.bat` | Windows 一键启动脚本 |
| `tools/remove_logo_bg.py` | 命令行批量处理工具 |
| `tools/README.md` | 本文档 |
| `web-admin-vue/src/utils/logoRemoveBg.js` | 前端工具函数（改） |
| `web-admin-vue/src/components/common/RemoveBgProcessor.vue` | 上传组件（改） |


---

## 效果对比

| 方法 | 背景白色 | 图案内白色 |
|------|---------|-----------|
| PS 魔棒/颜色阈值 | ❌ 去掉 | ❌ 也去掉 |
| rembg AI 抠图 | ✅ 去掉 | ✅ 保留 |

---

## 注意事项

1. **输出是 PNG 格式**，带透明通道（RGBA），小程序和 Web 端都能直接显示
2. 如果原图已经是透明底（RGBA），工具会先填充白底再处理，避免处理异常
3. 处理速度：CPU 模式下一张图约 2-5 秒，取决于图片大小
4. 模型只需下载一次，之后永久使用
