import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../', import.meta.url))
const repo = path.resolve(app, '..')
const git = process.platform === 'win32' ? 'C:/Program Files/Git/mingw64/bin/git.exe' : 'git'
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: app, encoding: 'utf8', ...options })
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `${command} failed`)
  return (result.stdout || '').trim()
}
const branch = run(git, ['branch', '--show-current'])
if (branch !== 'codex/platform-ops') throw new Error('正式平台发布只允许 codex/platform-ops 分支')
const dirty = run(git, ['status', '--porcelain', '--', 'platform-admin-vue', 'shared/player-card/draw.js', 'cloudfunctions/webLoginApi/player-card-text-styles.json', 'cloudfunctions/dataCenter/shared/match-events.mjs'], { cwd: repo })
if (dirty) throw new Error('请先提交平台源码及其统一卡片依赖，再发布')
run('npm', ['run', 'build'], { shell: process.platform === 'win32', stdio: 'inherit' })
const commit = run(git, ['rev-parse', 'HEAD'])
const release = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + commit.slice(0, 8)
const dist = path.join(app, 'dist')
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'platform-ops.html'))
fs.writeFileSync(path.join(dist, 'release.json'), JSON.stringify({ app: 'sxf-platform-ops', branch, commit, release, source: 'platform-admin-vue' }, null, 2))
const archive = path.join(repo, 'work', `platform-${release}.tar.gz`)
fs.mkdirSync(path.dirname(archive), { recursive: true })
run('tar', ['-czf', archive, '-C', dist, '.'])
const host = 'ubuntu@124.221.239.63'
const key = process.env.SXF_PLATFORM_SSH_KEY || path.join(os.homedir(), '.ssh', 'codex_wechat_saixiaofeng_ed25519')
const options = ['-i', key, '-o', 'BatchMode=yes']
const remoteArchive = `/tmp/sxf-platform-${release}.tar.gz`
run('scp', [...options, archive, `${host}:${remoteArchive}`])
const remoteScript = `set -euo pipefail
exec 9>/tmp/sxf-pingtai-deploy.lock
flock -n 9
release="$1"
archive="$2"
[[ "$release" =~ ^[0-9]{14}-[0-9a-f]{8}$ ]]
target="/var/www/pingtai/releases/$release"
test ! -e "$target"
sudo mkdir -p "$target"
sudo tar -xzf "$archive" -C "$target"
sudo chmod -R a+rX "$target"
config=/etc/nginx/sites-enabled/pingtai.sxffootball.cn
backup="/etc/nginx/sites-available/pingtai.sxffootball.cn.before-$release"
sudo cp "$config" "$backup"
sudo python3 - "$config" "$target" <<'PY'
import re, sys
p, target = sys.argv[1:]
s = open(p).read()
assert 'server_name pingtai.sxffootball.cn;' in s
s, count = re.subn(r'root /var/www/pingtai/releases/[a-zA-Z0-9_-]+;', 'root ' + target + ';', s)
assert count == 1, 'Unexpected platform root; abort'
open(p, 'w').write(s)
PY
if ! sudo nginx -t || ! sudo systemctl reload nginx; then
  sudo cp "$backup" "$config"
  sudo nginx -t && sudo systemctl reload nginx
  exit 1
fi
printf '%s\\n' "$target"
`
console.log(run('ssh', [...options, host, `bash -s -- '${release}' '${remoteArchive}'`], { input: remoteScript }))
const files = []
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(file)
    else files.push(file)
  }
}
visit(dist)
for (const file of files) {
  const name = path.relative(dist, file).replaceAll('\\', '/')
  const digest = value => crypto.createHash('sha256').update(value).digest('hex')
  const expected = digest(fs.readFileSync(file))
  let verified = false
  // Nginx reload is graceful; allow old workers to drain before final readback.
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`https://pingtai.sxffootball.cn/${name}?release=${release}`, { headers: { Connection: 'close' } })
    const actual = digest(Buffer.from(await response.arrayBuffer()))
    if (response.ok && expected === actual) { verified = true; break }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!verified) throw new Error(`${name}: 发布内容不一致，请检查站点后重新回读`)
}
console.log(`平台正式发布已回读：${release}，${files.length} 个文件摘要一致`)
