'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve(__dirname, '../test-output', process.argv.includes('--preview') ? 'preview' : 'production');
fs.mkdirSync(output, { recursive: true });
const reportPath = path.join(output, 'result.json');
fs.rmSync(reportPath, { force: true });
const packaged = process.argv.includes('--packaged');
const executable = packaged ? path.resolve(__dirname, '../release/win-unpacked/SxfFootball.exe') : require('electron');
const args = packaged ? [] : [path.resolve(__dirname, '..')];
if (process.argv.includes('--preview')) args.push('--preview');
const env = { ...process.env, SXF_DESKTOP_SMOKE_DIR: output };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, args, { env, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => { child.kill(); console.error('Smoke test timed out'); process.exitCode = 1; }, 120000);
child.on('error', error => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  clearTimeout(timeout);
  try {
    if (code !== 0) throw new Error(`Application exited with code ${code}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report.status !== 'passed' || report.checks.length !== 8) throw new Error('Runtime report is missing or incomplete');
    report.packaged = packaged;
    report.executableSha256 = require('node:crypto').createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    process.exitCode = 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
