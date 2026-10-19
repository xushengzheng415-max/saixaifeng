#!/usr/bin/env python3
"""Portable upload helper; requires Python 3 and OpenSSH on the client."""
import argparse
import base64
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--key', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--dir', required=True)
opts = parser.parse_args()
root = Path(opts.dir).resolve()
article = json.loads((root / 'article.json').read_text(encoding='utf-8-sig'))
names = {'article.json'}
if article.get('cover_path'):
    names.add(article['cover_path'])
names.update(i['file_path'] for i in article.get('content_images', []))
files = []
for name in sorted(names):
    file = (root / name).resolve()
    if not file.is_relative_to(root):
        raise ValueError('Asset is outside package')
    files.append({'path': name.replace('\\', '/'), 'data': base64.b64encode(file.read_bytes()).decode('ascii')})
result = subprocess.run(['ssh', '-i', str(Path(opts.key).expanduser()), '-o', 'IdentitiesOnly=yes',
                         'wechat-drafts@124.221.239.63', 'upload ' + opts.name],
                        input=json.dumps({'files': files}, ensure_ascii=False).encode('utf-8'))
raise SystemExit(result.returncode)
