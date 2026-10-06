import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '..')
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createRefereeLineupSheet, createRefereeLineupPrintHtml, REFEREE_SHEET_LEGEND } = await server.ssrLoadModule('/src/utils/refereeLineupSheet.js')
  const players = Array.from({ length: 18 }, (_, index) => ({ name: `测试球员${index + 1}`, number: String(index + 1) }))
  const input = {
    match: { matchDate: '2026-10-04', matchTime: '09:00', matchSequence: 17, venue: '1号场地' },
    matchFormat: '8side', tournamentName: '测试足球赛', divisionName: '老年组', location: '开封',
    homeName: '测试主队', awayName: '测试客队', homePlayers: players, awayPlayers: players,
    kitColors: { home: { jersey: '红', shorts: '白', socks: '红' }, away: { jersey: '蓝', shorts: '蓝', socks: '白' } },
    rowCount: 18
  }
  const template = await readFile(resolve(root, 'public/templates/referee-match-sheet-template.docx'))
  const logo = await readFile(resolve(root, 'public/logo-saixiaofeng.png'))
  const blob = await createRefereeLineupSheet(input, template, logo)
  const bytes = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('word/document.xml').async('string')
  for (const value of ['上衣红', '短裤白', '球袜红', '上衣蓝', '身份', '进球', '黄牌', '红牌', '球衣']) assert.ok(xml.includes(value), value)
  assert.ok(!xml.includes('球席'))
  assert.equal((xml.match(/<w:gridCol /g) || []).length >= 22, true)
  const rosterGrid = [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)]
    .map(([, grid]) => [...grid.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(([, width]) => Number(width)))
    .find(widths => widths.length === 22)
  assert.ok(rosterGrid, '主客队各应有 11 列')
  assert.deepEqual(rosterGrid.slice(3, 11), Array(8).fill(360))
  assert.deepEqual(rosterGrid.slice(14, 22), Array(8).fill(360))
  const legendXml = xml.slice(xml.indexOf('说明：首发打√'), xml.indexOf('说明：首发打√') + 500)
  assert.equal((legendXml.match(/<w:br\/>/g) || []).length, 2)
  for (const line of REFEREE_SHEET_LEGEND) assert.ok(legendXml.includes(line), line)
  globalThis.window = { location: { origin: 'https://example.test' } }
  const html = createRefereeLineupPrintHtml(input)
  for (const value of ['上衣红', '球袜白', '身份', '进球', '黄牌', '红牌']) assert.ok(html.includes(value), value)
  assert.equal((html.match(/<col style=/g) || []).length, 22)
  assert.ok(html.includes(`<p class="legend">${REFEREE_SHEET_LEGEND.map(line => `<span>${line}</span>`).join('')}</p>`))
  if (process.env.REFEREE_SHEET_SAMPLE) await writeFile(process.env.REFEREE_SHEET_SAMPLE, bytes)
  if (process.env.REFEREE_PRINT_SAMPLE) {
    const printable = html.replace(/<script>[\s\S]*?<\/script>/, '').replace('https://example.test/admin/logo-saixiaofeng.png', `data:image/png;base64,${logo.toString('base64')}`)
    await writeFile(process.env.REFEREE_PRINT_SAMPLE, printable)
  }
  console.log('Word 和单场打印结构校验通过')
} finally {
  await server.close()
}
