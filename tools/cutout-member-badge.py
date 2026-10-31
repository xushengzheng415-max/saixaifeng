#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""会员徽章抠图：把生成图里的「棋盘格假透明背景」换成真正的透明通道。

为什么单独写一个：
- 生成工具常在 24 位 RGB PNG 里把棋盘格画成像素，直接当透明图用会露出灰格；
- 徽章内部本身有白色足球，不能用「去白底」阈值整片抠，必须从四边连通生长，
  只把与画布边缘连通的灰底去掉，封闭在金色描边内的白色一律保留。

用法：
  python tools/cutout-member-badge.py <输入PNG> <输出目录> [--sizes 512,256,96]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

NEUTRAL_TOLERANCE = 12   # R/G/B 最大差值不超过该值视为「灰」（棋盘格是中性灰）
LUMA_MIN = 95            # 棋盘格暗格约为 120~135
LUMA_MAX = 235           # 棋盘格亮格约为 190~200；留出余量但避开纯白
PAD = 10                 # 裁剪后四周留白（原始像素）


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """从四边向内的连通生长：只有与边缘连通的灰像素才算背景。"""
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    luma = rgb.mean(axis=2)
    neutral = ((high - low) <= NEUTRAL_TOLERANCE) & (luma >= LUMA_MIN) & (luma <= LUMA_MAX)

    seed = np.zeros_like(neutral)
    seed[0, :] = neutral[0, :]
    seed[-1, :] = neutral[-1, :]
    seed[:, 0] = neutral[:, 0]
    seed[:, -1] = neutral[:, -1]

    mask = seed.copy()
    while True:
        grown = mask.copy()
        grown[1:, :] |= mask[:-1, :]
        grown[:-1, :] |= mask[1:, :]
        grown[:, 1:] |= mask[:, :-1]
        grown[:, :-1] |= mask[:, 1:]
        grown &= neutral
        if np.array_equal(grown, mask):
            return mask
        mask = grown


def cutout(source: Path, target_dir: Path, sizes) -> list:
    image = Image.open(source).convert('RGB')
    rgb = np.asarray(image).astype(np.int16)
    mask = background_mask(rgb)

    alpha = np.where(mask, 0, 255).astype(np.uint8)
    # 描边外侧的抗锯齿残留：与背景相邻且仍是中性灰的像素一并清掉，避免出现灰边
    ring = np.zeros_like(mask)
    ring[1:, :] |= mask[:-1, :]
    ring[:-1, :] |= mask[1:, :]
    ring[:, 1:] |= mask[:, :-1]
    ring[:, :-1] |= mask[:, 1:]
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    luma = rgb.mean(axis=2)
    fringe = ring & (~mask) & ((high - low) <= NEUTRAL_TOLERANCE + 8) & (luma >= LUMA_MIN) & (luma <= 245)
    alpha[fringe] = 0

    rgba = np.dstack([np.asarray(image), alpha])
    out = Image.fromarray(rgba, 'RGBA')

    rows = np.where(alpha.max(axis=1) > 0)[0]
    cols = np.where(alpha.max(axis=0) > 0)[0]
    if not rows.size or not cols.size:
        raise SystemExit('抠图失败：没有识别到前景像素')
    box = (
        max(0, int(cols[0]) - PAD),
        max(0, int(rows[0]) - PAD),
        min(out.width, int(cols[-1]) + 1 + PAD),
        min(out.height, int(rows[-1]) + 1 + PAD),
    )
    square = max(box[2] - box[0], box[3] - box[1])
    cx = (box[0] + box[2]) // 2
    cy = (box[1] + box[3]) // 2
    box = (cx - square // 2, cy - square // 2, cx + square // 2, cy + square // 2)
    cropped = out.crop(box)

    target_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for size in sizes:
        path = target_dir / f'member-badge-{size}.png'
        cropped.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
        written.append(path)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description='会员徽章抠图：假透明棋盘格 -> 真透明 PNG')
    parser.add_argument('source', help='输入 PNG')
    parser.add_argument('target_dir', help='输出目录')
    parser.add_argument('--sizes', default='512,256,96', help='输出尺寸，逗号分隔')
    args = parser.parse_args()

    sizes = [int(item) for item in args.sizes.split(',') if item.strip()]
    for path in cutout(Path(args.source), Path(args.target_dir), sizes):
        print(f'{path}  {path.stat().st_size} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
