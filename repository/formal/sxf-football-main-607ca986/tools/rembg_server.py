#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rembg HTTP 服务 - 供前端调用的队徽抠图 API

启动：
  python rembg_server.py
  服务运行在 http://127.0.0.1:5566

API:
  POST /remove-bg   上传图片，返回抠图后的 PNG（透明背景）
  GET  /health      健康检查
  GET  /model-info  查看模型状态
"""

import os
import io
import base64
import secrets
from flask import Flask, request, jsonify, send_file, abort
from flask_cors import CORS
from PIL import Image
from pathlib import Path

app = Flask(__name__)
CORS(app)  # 允许跨域（前端 localhost:5174 调用）

# ========== 配置 ==========
PORT = int(os.environ.get('PORT', 5566))
HOST = '127.0.0.1'  # 只本地访问，避免安全风险
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.webp'}

# 从环境变量读取 token（可选，简单鉴权）
API_TOKEN = os.environ.get('REMBG_TOKEN', '')


# ========== 鉴权装饰器 ==========
def check_auth():
    """检查 Authorization header（如果设置了 API_TOKEN）"""
    if not API_TOKEN:
        return  # 未设置 token，不鉴权
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        abort(401, 'Missing Authorization header')
    token = auth_header[len('Bearer '):]
    if not secrets.compare_digest(token, API_TOKEN):
        abort(401, 'Invalid token')


# ========== 路由 ==========

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok', 'service': 'rembg-server'})


@app.route('/model-info', methods=['GET'])
def model_info():
    """查看 rembg 模型状态"""
    try:
        from rembg import remove
        # 检查模型文件是否存在
        model_dir = Path.home() / '.u2net'
        model_file = model_dir / 'u2net.onnx'
        if model_file.exists():
            size_mb = model_file.stat().st_size / (1024 * 1024)
            return jsonify({
                'status': 'ready',
                'model': 'u2net',
                'model_path': str(model_file),
                'model_size_mb': round(size_mb, 2)
            })
        else:
            return jsonify({
                'status': 'model-not-found',
                'model_path': str(model_file),
                'help': 'Please download u2net.onnx to the above path'
            }), 404
    except ImportError:
        return jsonify({'status': 'error', 'message': 'rembg not installed'}), 500


@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    """
    队徽抠图 API
    
    支持两种上传方式：
    1. multipart/form-data（文件上传，推荐）
       - 参数: image=文件对象
       - 返回: PNG 图片（透明背景）
    
    2. application/json（Base64）
       - 参数: {"image_base64": "data:image/png;base64,..."}
       - 返回: {"success": true, "image_base64": "..."}
    """
    check_auth()

    try:
        # ---- 方式1：文件上传 ----
        if 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({'success': False, 'message': '空文件'}), 400

            # 检查文件类型
            ext = Path(file.filename).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                return jsonify({
                    'success': False,
                    'message': f'不支持的文件类型: {ext}'
                }), 400

            # 读取图片
            img_bytes = file.read()
            if len(img_bytes) > MAX_FILE_SIZE:
                return jsonify({'success': False, 'message': '文件过大（最大10MB）'}), 400

            img = Image.open(io.BytesIO(img_bytes))

        # ---- 方式2：Base64 ----
        elif request.is_json:
            data = request.get_json()
            image_b64 = data.get('image_base64', '')
            if not image_b64:
                return jsonify({'success': False, 'message': '缺少 image_base64 参数'}), 400

            # 去掉 data:image/xxx;base64, 前缀
            if ',' in image_b64:
                image_b64 = image_b64.split(',', 1)[1]

            try:
                img_bytes = base64.b64decode(image_b64)
            except Exception:
                return jsonify({'success': False, 'message': 'Base64 解码失败'}), 400

            if len(img_bytes) > MAX_FILE_SIZE:
                return jsonify({'success': False, 'message': '文件过大（最大10MB）'}), 400

            img = Image.open(io.BytesIO(img_bytes))

        else:
            return jsonify({'success': False, 'message': '请上传图片文件或传入 Base64'}), 400

        # ---- rembg 抠图 ----
        from rembg import remove

        # 如果是 RGBA，先填充白色背景（rembg 对 RGB 更稳定）
        if img.mode == 'RGBA':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        print(f'[rembg-server] 处理图片: {img.size}, 模式: {img.mode}')
        output_img = remove(img)
        print(f'[rembg-server] 处理完成: {output_img.mode}, {output_img.size}')

        # ---- 返回结果 ----
        # 如果请求是 Base64 方式，返回 JSON
        if request.is_json:
            buf = io.BytesIO()
            output_img.save(buf, format='PNG')
            buf.seek(0)
            result_b64 = base64.b64encode(buf.read()).decode('utf-8')
            return jsonify({
                'success': True,
                'image_base64': f'data:image/png;base64,{result_b64}',
                'message': '抠图成功'
            })

        # 否则直接返回 PNG 图片
        buf = io.BytesIO()
        output_img.save(buf, format='PNG')
        buf.seek(0)
        return send_file(buf, mimetype='image/png', as_attachment=False)

    except ImportError:
        return jsonify({
            'success': False,
            'message': 'rembg 未安装，请运行: pip install "rembg[cpu]"'
        }), 500
    except Exception as e:
        print(f'[rembg-server] 错误: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


# ========== 启动 ==========
if __name__ == '__main__':
    print('=' * 50)
    print('  rembg 队徽抠图服务')
    print('=' * 50)
    print(f'  地址: http://{HOST}:{PORT}')
    print(f'  健康检查: http://{HOST}:{PORT}/health')
    print(f'  抠图 API: http://{HOST}:{PORT}/remove-bg')
    print(f'  模型状态: http://{HOST}:{PORT}/model-info')
    if API_TOKEN:
        print(f'  鉴权: Bearer token 已启用')
    else:
        print(f'  鉴权: 未启用（生产环境请设置 REBG_TOKEN 环境变量）')
    print('=' * 50)
    print()

    app.run(host=HOST, port=PORT, debug=False)
