#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) result[argv[index].replace(/^--/, '')] = argv[index + 1]
  return result
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(value) {
  return escapeHtml(value).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#168a53;text-decoration:none;">$1</a>')
}

function imageHtml(placeholder, alt, margin = '22px 0 8px') {
  return `<p style="margin:${margin};text-align:center;text-indent:0;line-height:0;"><img src="${placeholder}" alt="${escapeHtml(alt)}" style="display:block;width:100%;height:auto;margin:0 auto;border-radius:4px;" /></p>`
}

function captionHtml(text) {
  return `<p style="margin:0 0 20px;color:#99aa9f;font-size:11.5px;line-height:1.6;text-align:center;text-indent:0;">${escapeHtml(text)}</p>`
}

function cardHtml(card) {
  const palette = {
    green: ['#f1faf5', '#a7d9be', '#1a5436', '#123f2b'],
    amber: ['#fffaf0', '#e3c878', '#8a6514', '#4b4027'],
    dark: ['#123f2b', '#123f2b', '#a9e6c4', '#ffffff']
  }[card.variant || 'green']
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:22px 0 20px;"><tr><td style="background:${palette[0]};border:1px solid ${palette[1]};border-radius:4px;padding:18px 20px;"><p style="margin:0 0 6px;color:${palette[2]};font-size:12px;font-weight:700;letter-spacing:1.5px;">${escapeHtml(card.label)}</p><p style="margin:0;color:${palette[3]};font-size:16px;font-weight:600;line-height:1.85;">${escapeHtml(card.text)}</p></td></tr></table>`
}

const args = parseArgs(process.argv.slice(2))
if (!args.config) throw new Error('缺少 --config')
const configFile = path.resolve(args.config)
const configDir = path.dirname(configFile)
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
const inputFile = path.resolve(configDir, config.input)
const outputFile = path.resolve(configDir, config.output || 'article.json')
const markdown = fs.readFileSync(inputFile, 'utf8')
const title = (markdown.match(/^#\s+(.+)$/m) || [])[1]
if (!title) throw new Error('文章缺少一级标题')
if (!config.digest || config.digest.length > 120) throw new Error('摘要缺失或超过120字符')

const blocks = markdown.split(/\r?\n\s*\r?\n/).map(item => item.trim()).filter(Boolean)
const output = ['<section style="margin:0 auto;color:#283b31;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">']
const usedNews = new Set()
const usedCards = new Set()
const contentImages = []
let heading = 0
let paragraph = 0
let inSources = false

for (const block of blocks) {
  if (block.startsWith('# ') || block === '---') continue
  if (block.startsWith('## ')) {
    heading += 1
    inSources = block === '## 资料来源'
    const separator = (config.separators || []).find(item => item.beforeHeading === heading)
    if (separator) {
      output.push(imageHtml(separator.placeholder, separator.alt || '赛小蜂足球分隔符', '28px 0'))
      contentImages.push(separator)
    }
    const sequence = (config.sequences || [])[heading - 1]
    if (!sequence) throw new Error(`缺少第${heading}个小标题的序号图`)
    contentImages.push(sequence)
    output.push(`<p style="margin:24px 0 14px;padding-bottom:8px;border-bottom:2px solid #20a96a;"><img src="${sequence.placeholder}" style="width:32px;height:auto;display:inline-block;vertical-align:middle;margin-right:10px;" alt="${String(heading).padStart(2, '0')}" /><span style="color:#123f2b;font-size:19px;font-weight:700;line-height:1.5;vertical-align:middle;">${inline(block.slice(3))}</span></p>`)
    continue
  }
  if (block.split(/\r?\n/).every(line => line.startsWith('- '))) {
    const items = block.split(/\r?\n/).map(line => `<li style="margin:9px 0;color:#53675b;font-size:14px;line-height:1.75;">${inline(line.slice(2))}</li>`).join('')
    output.push(`<ul style="margin:0 0 22px;padding-left:1.25em;">${items}</ul>`)
    continue
  }
  paragraph += 1
  const style = paragraph === 1
    ? 'margin:0 0 20px;padding:16px 17px;background:#f1faf5;border-left:4px solid #20a96a;color:#20553b;font-size:17px;font-weight:600;line-height:1.85;'
    : `margin:0 0 18px;color:${inSources ? '#53675b' : '#283b31'};font-size:${inSources ? '14px' : '17px'};line-height:${inSources ? '1.75' : '1.95'};letter-spacing:.2px;text-align:justify;text-indent:${inSources ? '0' : '2em'};`
  output.push(`<p style="${style}">${inline(block.replace(/\r?\n/g, ''))}</p>`)

  for (let index = 0; index < (config.newsImages || []).length; index += 1) {
    const item = config.newsImages[index]
    if (!usedNews.has(index) && block.includes(item.afterContains)) {
      output.push(imageHtml(item.placeholder, item.alt))
      output.push(captionHtml(item.caption))
      contentImages.push(item)
      usedNews.add(index)
    }
  }
  for (let index = 0; index < (config.cards || []).length; index += 1) {
    const item = config.cards[index]
    if (!usedCards.has(index) && block.includes(item.afterContains)) {
      output.push(cardHtml(item))
      usedCards.add(index)
    }
  }
}

if (usedNews.size !== (config.newsImages || []).length) throw new Error('有新闻图没有找到正文插入位置')
if (usedCards.size !== (config.cards || []).length) throw new Error('有话题卡片没有找到正文插入位置')
if (config.community) {
  output.push(imageHtml(config.community.placeholder, config.community.alt || '赛小蜂足球社群', '30px 0 18px'))
  contentImages.push(config.community)
}
output.push('<p style="margin:38px 0 6px;text-align:center;color:#99aa9f;font-size:12px;letter-spacing:1px;text-indent:0;">赛小蜂日记 · 蜂狂小编</p></section>')

const placeholders = contentImages.map(item => item.placeholder)
if (new Set(placeholders).size !== placeholders.length) throw new Error('图片占位符重复')
const article = {
  title,
  digest: config.digest,
  content_html: output.join('\n'),
  cover_path: config.cover,
  content_source_url: config.sourceUrl || '',
  content_images: contentImages.map(item => ({ placeholder: item.placeholder, file_path: item.file_path, alt: item.alt || '' })),
  need_open_comment: true,
  only_fans_can_comment: false
}

fs.writeFileSync(outputFile, JSON.stringify(article, null, 2), 'utf8')
console.log(JSON.stringify({ ok: true, output: outputFile, title, headings: heading, images: contentImages.length, cards: usedCards.size }, null, 2))
