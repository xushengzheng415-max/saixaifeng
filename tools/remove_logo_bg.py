#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
队徽抠图工具 - 使用 rembg AI 模型去除背景

功能：
1. 去除队徽图片的白色/纯色背景
2. 保留队徽图案内部的白色元素（如足球、文字等）
3. 支持单张处理和批量处理
4. 输出 PNG 格式（带透明通道）

原理：
  rembg 使用 U2-Net 深度学习模型进行前景/背景分割，
  不是简单的颜色阈值去白底，因此能正确保留图案内部的白色。

用法：
  python remove_logo_bg.py input.png                    # 单张处理
  python remove_logo_bg.py -d input_dir/ output_dir/    # 批量处理
  python remove_logo_bg.py -d input_dir/                # 批量处理，输出到 input_dir/output/
"""

import os
import sys
import argparse
from pathlib import Path

# 检查 rembg 是否安装
try:
    from rembg import remove
    from PIL import Image
except ImportError:
    print("错误：缺少依赖包。请先安装：")
    print("  pip install rembg[cpu] Pillow")
    sys.exit(1)


def remove_background(input_path: str, output_path: str = None) -> str:
    """
    去除单张图片背景

    Args:
        input_path: 输入图片路径
        output_path: 输出图片路径（默认在原文件名后加 _nobg）

    Returns:
        输出图片路径
    """
    input_path = Path(input_path)

    if not input_path.exists():
        raise FileNotFoundError(f"找不到文件: {input_path}")

    if output_path is None:
        output_path = input_path.parent / f"{input_path.stem}_nobg.png"
    else:
        output_path = Path(output_path)

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"处理: {input_path.name}")

    # 打开图片
    input_image = Image.open(input_path)

    # 如果图片是 RGBA 模式，先转成 RGB（rembg 处理 RGB 更稳定）
    if input_image.mode == 'RGBA':
        # 创建白底背景，把透明部分填充为白色
        background = Image.new('RGB', input_image.size, (255, 255, 255))
        background.paste(input_image, mask=input_image.split()[3])
        input_image = background
    elif input_image.mode != 'RGB':
        input_image = input_image.convert('RGB')

    # 使用 rembg 去除背景
    output_image = remove(input_image)

    # 保存为 PNG（保留透明通道）
    output_image.save(output_path, 'PNG')

    print(f"  -> 已保存: {output_path}")
    return str(output_path)


def batch_process(input_dir: str, output_dir: str = None):
    """
    批量处理目录中的所有图片
    """
    input_dir = Path(input_dir)

    if not input_dir.exists():
        raise FileNotFoundError(f"找不到目录: {input_dir}")

    if output_dir is None:
        output_dir = input_dir / "output"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # 支持的图片格式
    extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}

    image_files = [f for f in input_dir.iterdir()
                   if f.is_file() and f.suffix.lower() in extensions]

    if not image_files:
        print(f"目录 {input_dir} 中没有找到支持的图片文件")
        return

    print(f"找到 {len(image_files)} 张图片，开始批量处理...")
    print("-" * 50)

    success_count = 0
    fail_count = 0

    for img_file in image_files:
        try:
            output_path = output_dir / f"{img_file.stem}_nobg.png"
            remove_background(str(img_file), str(output_path))
            success_count += 1
        except Exception as e:
            print(f"  [失败] {img_file.name}: {e}")
            fail_count += 1

    print("-" * 50)
    print(f"处理完成: 成功 {success_count} 张, 失败 {fail_count} 张")
    print(f"输出目录: {output_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="队徽抠图工具 - 智能去除背景，保留图案内部白色",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s logo.png                              # 处理单张图片
  %(prog)s logo.png -o result.png                # 指定输出路径
  %(prog)s -d ./logos/                           # 批量处理，输出到 ./logos/output/
  %(prog)s -d ./logos/ ./output/                 # 批量处理，指定输出目录
        """
    )

    parser.add_argument("input", nargs="?",
                        help="输入图片路径（单张模式）或输入目录（批量模式）")
    parser.add_argument("-o", "--output",
                        help="输出图片路径（单张模式）")
    parser.add_argument("-d", "--directory", action="store_true",
                        help="批量处理模式，input 参数为输入目录")
    parser.add_argument("output_dir", nargs="?",
                        help="批量模式下的输出目录（可选，默认在输入目录下创建 output/）")

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        sys.exit(0)

    try:
        if args.directory:
            # 批量模式
            batch_process(args.input, args.output_dir)
        else:
            # 单张模式
            result = remove_background(args.input, args.output)
            print(f"\n抠图完成！输出文件: {result}")
    except FileNotFoundError as e:
        print(f"错误: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"处理出错: {e}")
        # 如果是模型未下载的错误，给出更友好的提示
        if "u2net" in str(e).lower() or "model" in str(e).lower():
            print("\n提示: 首次使用需要下载 AI 模型文件（约170MB）")
            print("由于网络原因自动下载失败，请手动下载：")
            print("  1. 浏览器访问: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx")
            print("  2. 将下载的文件放到: C:\\Users\\你的用户名\\.u2net\\u2net.onnx")
            print("\n或使用镜像下载：")
            print("  https://gh.api.99988866.xyz/https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx")
        sys.exit(1)


if __name__ == "__main__":
    main()
