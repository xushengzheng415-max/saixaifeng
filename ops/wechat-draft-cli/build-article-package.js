#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function args(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) result[argv[index].replace(/^--/, '')] = argv[index + 1]
  return result
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(value) {
  const escaped = escapeHtml(value)
  return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#168a53;text-decoration:none;">$1</a>')
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/)
  const output = ['<section style="margin:0 auto;color:#283b31;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">']
  let paragraph = []
  let bullets = []
  let section = 0
  let firstParagraph = true

  function flushParagraph() {
    if (!paragraph.length) return
    const value = inline(paragraph.join(''))
    if (firstParagraph) {
      output.push(`<section style="margin:0 0 22px;padding:16px 17px;background:#f1faf5;border-left:4px solid #20a96a;"><p style="margin:0;color:#20553b;font-size:17px;font-weight:600;line-height:1.85;">${value}</p></section>`)
      firstParagraph = false
    } else {
      output.push(`<p style="margin:0 0 18px;color:#283b31;font-size:17px;line-height:1.95;letter-spacing:.2px;text-align:justify;text-indent:2em;">${value}</p>`)
    }
    paragraph = []
  }

  function flushBullets() {
    if (!bullets.length) return
    const items = bullets.map((item) => `<li style="margin:9px 0;color:#2a4e3a;font-size:16px;line-height:1.8;">${inline(item)}</li>`).join('')
    output.push(`<section style="margin:4px 0 23px;padding:10px 16px 8px;background:#f7faf8;"><ul style="margin:0;padding-left:1.25em;">${items}</ul></section>`)
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushParagraph()
      flushBullets()
      continue
    }
    if (line.startsWith('# ')) continue
    if (line === '---') {
      flushParagraph()
      flushBullets()
      output.push('<p style="margin:30px 0;border-top:1px solid #dcece3;line-height:0;">&nbsp;</p>')
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph()
      flushBullets()
      section += 1
      output.push(`<section style="margin:38px 0 16px;border-bottom:1px solid #dcece3;padding-bottom:8px;"><span style="margin-right:12px;color:#16a566;font-size:13px;font-weight:700;">${String(section).padStart(2, '0')}</span><span style="color:#123f2b;font-size:20px;font-weight:700;line-height:1.45;">${inline(line.slice(3))}</span></section>`)
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph()
      bullets.push(line.slice(2))
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()
  flushBullets()
  output.push('<p style="margin:38px 0 6px;text-align:center;color:#99aa9f;font-size:12px;letter-spacing:1px;text-indent:0;">赛小蜂日记 · 记录足球现场里值得追问的事</p></section>')
  return output.join('\n')
}

const options = args(process.argv.slice(2))
for (const required of ['input', 'output', 'digest', 'cover']) {
  if (!options[required]) throw new Error(`缺少 --${required}`)
}
const input = path.resolve(options.input)
const output = path.resolve(options.output)
const markdown = fs.readFileSync(input, 'utf8')
const title = (markdown.match(/^#\s+(.+)$/m) || [])[1]
if (!title) throw new Error('文章缺少一级标题')
const packageData = {
  title,
  digest: options.digest,
  content_html: markdownToHtml(markdown),
  cover_path: options.cover,
  content_source_url: options.source || '',
  content_images: [],
  need_open_comment: true,
  only_fans_can_comment: false
}
fs.writeFileSync(output, JSON.stringify(packageData, null, 2), 'utf8')
console.log(JSON.stringify({ ok: true, output, title }, null, 2))
