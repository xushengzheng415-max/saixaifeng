#!/usr/bin/python3
"""Root-owned forced SSH command. No shell, forwarding, or credential access."""
import base64
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import sys
import grp

ROOT = Path('/var/lib/sxf-wechat-drafts')
CLI = '/home/ubuntu/wechat-saixiaofeng-diary/wechat-draft.js'
MAX_BYTES = 64 * 1024 * 1024

def emit(data):
    print(json.dumps(data, ensure_ascii=False))

def asset_path(value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError('Invalid asset path')
    p = PurePosixPath(value)
    if p.is_absolute() or any(x in ('..', '.') or x.startswith('.') for x in p.parts):
        raise ValueError('Asset paths must stay within package')
    return p.as_posix()

def package_dir(name):
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', name):
        raise ValueError('Package name must use letters, numbers, hyphens, underscores')
    return ROOT / name

def private_dir(p):
    p.mkdir(mode=0o750, parents=True, exist_ok=True)
    os.chown(p, 0, grp.getgrnam('ubuntu').gr_gid)
    os.chmod(p, 0o750)

def write_file(p, data):
    private_dir(p.parent)
    with p.open('xb') as out:
        out.write(data)
    os.chown(p, 0, grp.getgrnam('ubuntu').gr_gid)
    os.chmod(p, 0o640)

def preflight(p):
    article = json.loads((p / 'article.json').read_text('utf-8-sig'))
    values = []
    if article.get('cover_path'):
        values.append(article['cover_path'])
    for image in article.get('content_images', []):
        values.append(image['file_path'])
    for value in values:
        relative = asset_path(value)
        file = p / relative
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(p.resolve()):
            raise ValueError('Missing or invalid package asset')

def run_cli(command, p=None):
    args = ['/usr/bin/sudo', '-n', '-u', 'ubuntu', '/usr/bin/env', '-i',
            'PATH=/usr/bin:/bin', 'HOME=/home/ubuntu', 'NODE_NO_WARNINGS=1',
            '/usr/bin/node', CLI, command]
    if p:
        args += ['--input', str(p / 'article.json')]
    result = subprocess.run(args, capture_output=True, text=True, timeout=240)
    if result.returncode:
        # Do not return raw errors that may include network URLs or tokens.
        code = re.search(r'（(\d{4,6})）', result.stderr)
        raise ValueError('Tool failed' + ('; WeChat error ' + code[1] if code else '; contact administrator'))
    return json.loads(result.stdout)

def main():
    if os.geteuid() != 0:
        raise ValueError('Administrator-owned gateway required')
    words = shlex.split(sys.argv[1] if len(sys.argv) == 2 else '')
    if words == ['help'] or not words:
        emit({'commands': ['doctor', 'upload PACKAGE', 'validate PACKAGE', 'draft PACKAGE', 'receipt PACKAGE']})
        return
    if words == ['doctor']:
        emit(run_cli('doctor'))
        return
    if len(words) != 2 or words[0] not in ('upload', 'validate', 'draft', 'receipt'):
        raise ValueError('Unsupported command; use help')
    action, name = words
    p = package_dir(name)
    if action == 'upload':
        raw = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Upload exceeds 64MB')
        bundle = json.loads(raw)
        files = bundle['files']
        if not isinstance(files, list) or not 1 <= len(files) <= 100:
            raise ValueError('Invalid file count')
        decoded = {}
        for item in files:
            name = asset_path(item['path'])
            if name in decoded or (name != 'article.json' and Path(name).suffix.lower() not in ('.png', '.jpg', '.jpeg', '.gif')):
                raise ValueError('Only article.json and image files allowed')
            data = base64.b64decode(item['data'], validate=True)
            if len(data) > 10 * 1024 * 1024:
                raise ValueError('Individual file exceeds 10MB')
            decoded[name] = data
        if 'article.json' not in decoded:
            raise ValueError('Missing article.json')
        article = json.loads(decoded['article.json'].decode('utf-8-sig'))
        references = [i['file_path'] for i in article.get('content_images', [])]
        if article.get('cover_path'):
            references.append(article['cover_path'])
        for value in references:
            if asset_path(value) not in decoded:
                raise ValueError('Missing referenced asset')
        if p.exists():
            raise ValueError('Package already exists; use a new package name')
        private_dir(p)
        for relative, data in decoded.items():
            write_file(p / relative, data)
        preflight(p)
        emit({'ok': True, 'package': words[1], 'files': len(decoded)})
        return
    preflight(p)
    if action == 'receipt':
        r = p / 'receipt.json'
        emit(json.loads(r.read_text()) if r.exists() else {'status': 'not_created'})
        return
    if action == 'validate':
        emit(run_cli('validate', p))
        return
    # Global serialization plus persistent marker blocks retries after unknown outcome.
    with (ROOT / '.draft.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        receipt = p / 'receipt.json'
        if receipt.exists():
            emit(json.loads(receipt.read_text()))
            return
        run_cli('validate', p)
        marker = p / '.attempted'
        if marker.exists():
            raise ValueError('Previous attempt requires administrator reconciliation; do not retry')
        write_file(marker, b'attempt started')
        result = run_cli('draft', p)
        write_file(receipt, json.dumps(result, ensure_ascii=False).encode())
        emit(result)

try:
    main()
except Exception as error:
    emit({'ok': False, 'error': str(error) if isinstance(error, ValueError) else 'Operation failed; contact administrator'})
    sys.exit(1)
