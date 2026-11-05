'use strict'
// 生成「只含小程序本体」的上传暂存目录，并打印可直接执行的上传命令
// 用法：node tools/prepare-miniprogram-upload.cjs [--dir <目标目录>]
//
// 为什么需要它：直接用仓库根目录上传时，开发者工具会扫描整个仓库（desktop-windows、
// cloudfunctions、web-admin-vue 等），容易触发 EMFILE（too many open files）而卡在
// 「- Upload」不动。暂存目录只放 project.config.json + project.miniapp.json + miniprogram/，
// packOptions.ignore 仍然生效（其 value 相对 miniprogramRoot），包体口径与仓库根上传一致。
//
// 注意：project.config.json 的 ignore 必须整页忽略或整页保留（.js/.json/.wxml/.wxss），
// 只忽略其中一部分会让开发者工具报「WXML file not found」。上传前先跑
// node tools/check-miniprogram-package-size.cjs。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const REPO = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const dirIndex = args.indexOf('--dir')
const TARGET = dirIndex >= 0
  ? path.resolve(args[dirIndex + 1])
  : path.join(os.tmpdir(), 'sxf-miniprogram-upload')

const CONFIG_FILES = ['project.config.json', 'project.miniapp.json']

function copyDir (from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else if (entry.isFile()) fs.copyFileSync(src, dst)
  }
}

function sizeOf (dir) {
  let bytes = 0
  let files = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const inner = sizeOf(full)
      bytes += inner.bytes
      files += inner.files
    } else if (entry.isFile()) {
      bytes += fs.statSync(full).size
      files += 1
    }
  }
  return { bytes, files }
}

if (TARGET === REPO || REPO.startsWith(TARGET + path.sep)) {
  console.error('目标目录不能是仓库根目录或其上级：' + TARGET)
  process.exit(1)
}
if (TARGET === path.join(REPO, 'miniprogram') || TARGET.startsWith(path.join(REPO, 'miniprogram') + path.sep)) {
  console.error('目标目录不能位于 miniprogram/ 内：' + TARGET)
  process.exit(1)
}

fs.rmSync(TARGET, { recursive: true, force: true })
fs.mkdirSync(TARGET, { recursive: true })
for (const name of CONFIG_FILES) {
  const src = path.join(REPO, name)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TARGET, name))
}
copyDir(path.join(REPO, 'miniprogram'), path.join(TARGET, 'miniprogram'))

const info = sizeOf(TARGET)
console.log('暂存目录：' + TARGET)
console.log(`文件 ${info.files} 个 / ${(info.bytes / 1024 / 1024).toFixed(1)} MB（未扣除 packOptions.ignore）`)
console.log('上传命令：')
console.log(`  & 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat' upload --project '${TARGET}' --version <版本号> --desc '<描述>'`)
