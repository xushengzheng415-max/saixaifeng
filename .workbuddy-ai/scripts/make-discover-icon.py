"""生成「发现」tab 图标：罗盘造型，对齐 brand-v1-tab-* 系列尺寸与配色。

纯标准库实现（zlib + struct），4x 超采样抗锯齿。
输出：miniprogram/images/runtime/icons/brand-v1-tab-discover.png
"""
import math
import os
import struct
import zlib

OUT_W, OUT_H = 240, 240
SS = 4  # 超采样倍数
W, H = OUT_W * SS, OUT_H * SS

# 品牌绿（与 brand-v1 系列一致）
GREEN = (8, 122, 72)

CX, CY = W / 2.0, H / 2.0
R_OUTER = W * 0.345          # 圆环外半径
RING_W = W * 0.075           # 圆环线宽
R_INNER = R_OUTER - RING_W   # 圆环内半径

# 指针：上下两个三角，构成罗盘针
NEEDLE_LEN = R_INNER * 0.74
NEEDLE_HALF = W * 0.062


def in_ring(x, y):
    d = math.hypot(x - CX, y - CY)
    return R_INNER <= d <= R_OUTER


def in_needle(x, y):
    """罗盘针：以中心为原点，上三角尖朝上、下三角尖朝下。"""
    dx = x - CX
    dy = y - CY
    # 旋转 45 度，让指针斜向更有动感
    ang = math.radians(45)
    rx = dx * math.cos(ang) - dy * math.sin(ang)
    ry = dx * math.sin(ang) + dy * math.cos(ang)
    # 上针：从中心到 (0,-NEEDLE_LEN)，底宽 NEEDLE_HALF
    if -NEEDLE_LEN <= ry <= 0:
        t = -ry / NEEDLE_LEN           # 0 在中心，1 在尖端
        half = NEEDLE_HALF * (1 - t)
        return abs(rx) <= half
    # 下针：略短，形成对比
    if 0 <= ry <= NEEDLE_LEN * 0.62:
        t = ry / (NEEDLE_LEN * 0.62)
        half = NEEDLE_HALF * 0.72 * (1 - t)
        return abs(rx) <= half
    return False


def in_dot(x, y):
    d = math.hypot(x - CX, y - CY)
    return d <= W * 0.036


rows = []
for py in range(H):
    row = bytearray()
    y = py + 0.5
    for px in range(W):
        x = px + 0.5
        hit = in_ring(x, y) or in_needle(x, y) or in_dot(x, y)
        if hit:
            row += bytes((GREEN[0], GREEN[1], GREEN[2], 255))
        else:
            row += bytes((0, 0, 0, 0))
    rows.append(bytes(row))

# 4x 降采样
out_rows = []
for oy in range(OUT_H):
    row = bytearray()
    for ox in range(OUT_W):
        r = g = b = a = 0
        for sy in range(SS):
            base = rows[oy * SS + sy]
            for sx in range(SS):
                i = (ox * SS + sx) * 4
                r += base[i]
                g += base[i + 1]
                b += base[i + 2]
                a += base[i + 3]
        n = SS * SS
        row += bytes((r // n, g // n, b // n, a // n))
    out_rows.append(bytes(row))


def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)


raw = b''.join(b'\x00' + r for r in out_rows)
png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', OUT_W, OUT_H, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')

out = os.path.join('miniprogram', 'images', 'runtime', 'icons', 'brand-v1-tab-discover.png')
with open(out, 'wb') as f:
    f.write(png)
print('written', out, len(png), 'bytes', OUT_W, 'x', OUT_H)
