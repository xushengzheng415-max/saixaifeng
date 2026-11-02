# -*- coding: utf-8 -*-
"""抠图 v2：识别棋盘格背景（AI 生成图常见），把属于棋盘格的像素改透明。
思路：
1) 从四边采样，收集背景色集合（通常 2 种灰白）。
2) 若发现两色交替、且饱和度低 -> 判定为棋盘格背景。
3) 从四边缘 flood-fill，只在与背景色相近的像素上扩散，结果设透明。
"""
import os, sys
from collections import deque
from PIL import Image

def dist(a, b):
    return abs(a[0]-b[0]) + abs(a[1]-b[1]) + abs(a[2]-b[2])

def sat(c):
    mx, mn = max(c), min(c)
    return mx - mn

def collect_bg_colors(img):
    """沿四边采样，返回出现频率高的低饱和度颜色集合。"""
    w, h = img.size
    px = img.load()
    counter = {}
    step = 2
    for x in range(0, w, step):
        for y in (0, 1, h-2, h-1):
            c = px[x, y][:3]
            if sat(c) < 30:
                key = (c[0]//12*12, c[1]//12*12, c[2]//12*12)
                counter[key] = counter.get(key, 0) + 1
    for y in range(0, h, step):
        for x in (0, 1, w-2, w-1):
            c = px[x, y][:3]
            if sat(c) < 30:
                key = (c[0]//12*12, c[1]//12*12, c[2]//12*12)
                counter[key] = counter.get(key, 0) + 1
    tops = sorted(counter.items(), key=lambda kv: -kv[1])[:4]
    return [k for k, v in tops if v >= 8]

def is_bg(c, bg_set, tol=45):
    for b in bg_set:
        if dist(c, b) <= tol:
            return True
    return False

def cutout(src, dst):
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    px = img.load()

    bg_set = collect_bg_colors(img)
    if not bg_set:
        print(f"[skip] {os.path.basename(src)} 未识别到棋盘格背景")
        return False

    visited = bytearray(w*h)
    q = deque()
    def try_seed(x, y):
        idx = y*w+x
        if visited[idx]: return
        if is_bg(px[x, y][:3], bg_set):
            visited[idx] = 1; q.append((x, y))
    for x in range(w):
        try_seed(x, 0); try_seed(x, 1); try_seed(x, h-2); try_seed(x, h-1)
    for y in range(h):
        try_seed(0, y); try_seed(1, y); try_seed(w-2, y); try_seed(w-1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<w and 0<=ny<h:
                idx = ny*w+nx
                if visited[idx]: continue
                if is_bg(px[nx, ny][:3], bg_set):
                    visited[idx] = 1; q.append((nx, ny))

    n_clear = 0
    for y in range(h):
        for x in range(w):
            if visited[y*w+x]:
                R,G,B,A = px[x, y]
                px[x, y] = (R, G, B, 0)
                n_clear += 1

    ratio = n_clear / (w*h)
    if ratio < 0.05:
        print(f"[skip] {os.path.basename(src)} 清除比例 {ratio:.1%} 过低，可能误识别")
        return False

    bbox = img.getbbox()
    if bbox:
        l, t, r, b = bbox
        mx = int((r-l)*0.03); my = int((b-t)*0.03)
        img = img.crop((max(0,l-mx), max(0,t-my), min(w,r+mx), min(h,b+my)))

    img.save(dst, "PNG", optimize=True)
    print(f"[ok] {os.path.basename(src)} 清透明 {ratio:.0%} -> {img.size}")
    return True

def main():
    root = r"E:\Documents\sxf-football\service-account-h5\assets\game"
    out = os.path.join(root, "_cutout")
    os.makedirs(out, exist_ok=True)

    skip_full = {"全景地图.png","空地图.png","室内场景.png","游戏内页背景.png","PK对战.png","球员卡卡片背景模板.png","对话气泡.png"}
    targets = []
    for name in os.listdir(root):
        p = os.path.join(root, name)
        if os.path.isfile(p) and name.endswith(".png") and name not in skip_full:
            targets.append(p)
    fg = os.path.join(root, "fengge")
    for name in os.listdir(fg):
        if name.endswith(".png"):
            targets.append(os.path.join(fg, name))

    for src in targets:
        rel = os.path.relpath(src, root)
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            cutout(src, dst)
        except Exception as e:
            print(f"[err] {rel}: {e}")

if __name__ == "__main__":
    main()
