import json
import subprocess

def run(command, payload=None):
    return subprocess.run(['/usr/bin/sudo', '-n', '-u', 'wechat-drafts',
        '/usr/bin/sudo', '-n', '/usr/local/sbin/sxf-wechat-drafts', command],
        input=payload, capture_output=True, text=True)

checks = {}
checks['help'] = run('help').returncode == 0
checks['doctor'] = json.loads(run('doctor').stdout).get('ok') is True
checks['shell_rejected'] = run('sh').returncode != 0
checks['credential_read_command_rejected'] = run('cat /home/ubuntu/wechat-saixiaofeng-diary/.env.local').returncode != 0
checks['path_escape_rejected'] = run('upload ../escape', '{}').returncode != 0
checks['absolute_asset_rejected'] = run('upload security-check-invalid', json.dumps({'files': [{'path': '/etc/test', 'data': ''}]})).returncode != 0
direct = subprocess.run(['/usr/bin/sudo', '-n', '-u', 'wechat-drafts', '/usr/bin/test', '-r', '/home/ubuntu/wechat-saixiaofeng-diary/.env.local'])
checks['credentials_not_readable'] = direct.returncode != 0
shell = subprocess.run(['/usr/bin/sudo', '-n', '-u', 'wechat-drafts', '/usr/bin/sudo', '-n', '/bin/true'], capture_output=True)
checks['general_sudo_rejected'] = shell.returncode != 0
print(json.dumps(checks))
raise SystemExit(0 if all(checks.values()) else 1)
