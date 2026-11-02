#!/usr/bin/env python
# tools/check-invite-qr.py
"""用 Python qrcode 参考实现逐模块比对小程序端纯 JS QR 编码结果。

先跑 `node tools/test-invite-qr.cjs` 生成 work/invite-qr/*.json，再运行本脚本。
同版本 / 同纠错等级 M / 同掩码，模块矩阵必须完全一致，否则判为不可扫风险。
"""
import json
import pathlib
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_M

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'work' / 'invite-qr'


def reference(text, version, mask):
    qr = qrcode.QRCode(
        version=version,
        error_correction=ERROR_CORRECT_M,
        box_size=1,
        border=0,
        mask_pattern=mask,
    )
    qr.add_data(text, optimize=0)
    qr.make(fit=False)
    return [[bool(cell) for cell in row] for row in qr.modules]


def main():
    files = sorted(OUT_DIR.glob('*.json'))
    if not files:
        print('没有找到 work/invite-qr/*.json，请先运行 node tools/test-invite-qr.cjs')
        return 2
    total = 0
    failed = 0
    for path in files:
        payload = json.loads(path.read_text(encoding='utf-8'))
        total += 1
        expected = reference(payload['text'], payload['version'], payload['mask'])
        actual = payload['modules']
        if len(expected) != len(actual):
            failed += 1
            print(f'FAIL {path.name}: 尺寸不一致 js={len(actual)} ref={len(expected)}')
            continue
        diff = 0
        for r, row in enumerate(expected):
            for c, cell in enumerate(row):
                if cell != bool(actual[r][c]):
                    diff += 1
        if diff:
            failed += 1
            print(f'FAIL {path.name}: {diff} 个模块不一致 (version={payload["version"]} mask={payload["mask"]})')
        else:
            print(f'OK   {path.name}: {len(expected)}x{len(expected)} 完全一致 (version={payload["version"]} mask={payload["mask"]})')
    print(f'比对完成：{total - failed}/{total} 通过')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
