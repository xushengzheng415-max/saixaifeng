import JSZip from 'jszip'

const WORD_TEXT = /<w:t\b[^>]*\/>|<w:t\b[^>]*>[\s\S]*?<\/w:t>/g
const WORD_TABLE = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g
const WORD_ROW = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
const WORD_CELL = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
const TEMPLATE_BASE = import.meta.env?.BASE_URL || '/admin/'
const TEMPLATE_PATH = `${TEMPLATE_BASE}templates/referee-match-sheet-template.docx`

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character])
}

function unescapeXml(value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] === '#') {
      const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()] || entity
  })
}

function textTagWithContent(token, content) {
  const end = token.indexOf('>')
  const opening = token.slice(0, end + 1)
  let attributes = opening.replace(/^<w:t\b/i, '').replace(/>$/, '').replace(/\/\s*$/, '').trim()
  if (!/\bxml:space\s*=/.test(attributes)) attributes = `${attributes} xml:space="preserve"`.trim()
  return `<w:t${attributes ? ` ${attributes}` : ''}>${escapeXml(content)}</w:t>`
}

function setCellText(cellXml, value) {
  let wroteValue = false
  let result = cellXml.replace(WORD_TEXT, token => {
    if (wroteValue) return textTagWithContent(token, '')
    wroteValue = true
    return textTagWithContent(token, value)
  })

  if (!wroteValue) {
    const text = `<w:t xml:space="preserve">${escapeXml(value)}</w:t>`
    if (/<w:rPr\b[\s\S]*?<\/w:rPr>/.test(result)) {
      result = result.replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/, properties => `${properties}${text}`)
    } else if (/<w:r\b[^>]*>/.test(result)) {
      result = result.replace(/<w:r\b[^>]*>/, opening => `${opening}${text}`)
    } else {
      result = result.replace('</w:p>', `<w:r>${text}</w:r></w:p>`)
    }
  }
  return result
}

function setRowCells(rowXml, values) {
  let cellIndex = 0
  return rowXml.replace(WORD_CELL, cellXml => {
    const value = values[cellIndex]
    cellIndex += 1
    return value === undefined ? cellXml : setCellText(cellXml, value)
  })
}

function setCellWidth(cellXml, width) {
  return cellXml.replace(/(<w:tcW\b[^>]*\bw:w=")\d+(")/, (_, prefix, suffix) => `${prefix}${width}${suffix}`)
}

function setCellFontSize(cellXml, size) {
  return cellXml.replace(/(<w:sz(?:Cs)?\b[^>]*\bw:val=")\d+(")/g, (_, prefix, suffix) => `${prefix}${size}${suffix}`)
}

function expandRosterRow(rowXml) {
  const cells = [...rowXml.matchAll(WORD_CELL)].map(item => item[0])
  if (cells.length < 16) throw new Error('裁判名单表队员栏列数不完整')
  const expanded = []
  for (const offset of [0, 8]) expanded.push(...cells.slice(offset, offset + 5), cells[offset + 5], cells[offset + 5], cells[offset + 6], cells[offset + 7])
  let index = 0
  return rowXml.replace(WORD_CELL, () => expanded[index++] || '')
}

function formatRosterRow(rowXml, isHeader = false) {
  let cellIndex = 0
  let result = rowXml.replace(WORD_CELL, cellXml => {
    const sideColumn = cellIndex % 9
    cellIndex += 1
    let next = cellXml
    const widths = [300, 1050, 350, 280, 280, 450, 380, 1700, 460]
    next = setCellWidth(next, widths[sideColumn])
    if (!isHeader && sideColumn === 1) next = setCellFontSize(next, 20).replace(/<w:rPr\b[^>]*>/g, opening => `${opening}<w:b/>`)
    return next
  })
  if (!isHeader) result = result.replace(/(<w:trHeight\b[^>]*\bw:val=")\d+(")/, (_, prefix, suffix) => `${prefix}350${suffix}`)
  return result
}

function withRows(tableXml, rows) {
  const firstRow = tableXml.search(/<w:tr\b/)
  const lastRow = tableXml.lastIndexOf('</w:tr>')
  if (firstRow < 0 || lastRow < firstRow) throw new Error('裁判名单表模板结构不完整')
  return `${tableXml.slice(0, firstRow)}${rows.join('')}${tableXml.slice(lastRow + '</w:tr>'.length)}`
}

function replaceTableAt(xml, index, transform) {
  let current = -1
  let found = false
  const result = xml.replace(WORD_TABLE, tableXml => {
    current += 1
    if (current !== index) return tableXml
    found = true
    return transform(tableXml)
  })
  if (!found) throw new Error('裁判名单表模板缺少必要的表格')
  return result
}

function updateTextNode(xml, predicate, value) {
  let updated = false
  return xml.replace(WORD_TEXT, token => {
    if (updated) return token
    const content = token.startsWith('<w:t')
      ? (token.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/)?.[1] || '')
      : ''
    if (!predicate(unescapeXml(content))) return token
    updated = true
    return textTagWithContent(token, value)
  })
}

function removeParagraphMatching(xml, predicate) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
    const text = [...paragraph.matchAll(new RegExp(WORD_TEXT.source, 'g'))]
      .map(([token]) => token.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/)?.[1] || '')
      .map(unescapeXml)
      .join('')
    return predicate(text) ? '' : paragraph
  })
}

function addRepeatingHeader(rowXml) {
  if (/<w:tblHeader\b/.test(rowXml)) return rowXml
  if (/<w:trPr\b[^>]*>[\s\S]*?<\/w:trPr>/.test(rowXml)) {
    return rowXml.replace(/(<w:trPr\b[^>]*>)/, '$1<w:tblHeader w:val="true"/>')
  }
  if (/<w:trPr\b[^>]*\/>/.test(rowXml)) {
    return rowXml.replace(/<w:trPr\b[^>]*\/>/, '<w:trPr><w:tblHeader w:val="true"/></w:trPr>')
  }
  return rowXml.replace(/^(<w:tr\b[^>]*>)/, '$1<w:trPr><w:tblHeader w:val="true"/></w:trPr>')
}

function formatMatchLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const number = raw.match(/(11|9|8|7|5)/)?.[1]
  return number ? `${number}人制` : raw
}

function formatLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : String(value || '待定')
}

function formatCoreProperties(xml) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return xml
    .replace(/<dc:creator(?:\s[^>]*)?>[\s\S]*?<\/dc:creator>/, '<dc:creator>赛小蜂足球赛事</dc:creator>')
    .replace(/<cp:lastModifiedBy(?:\s[^>]*)?>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>赛小蜂足球赛事</cp:lastModifiedBy>')
    .replace(/(<dcterms:created\b[^>]*>)[\s\S]*?(<\/dcterms:created>)/, `$1${now}$2`)
    .replace(/(<dcterms:modified\b[^>]*>)[\s\S]*?(<\/dcterms:modified>)/, `$1${now}$2`)
}

function buildDocumentXml(templateXml, input) {
  const match = input.match || {}
  const formatLabel = formatMatchLabel(input.matchFormat)
  const matchName = input.tournamentName
    ? `${input.tournamentName}${formatLabel ? `（${formatLabel}）` : ''}`
    : `足球比赛${formatLabel ? `（${formatLabel}）` : ''}`
  const dateTime = [formatLocalDate(match.matchDate), String(match.matchTime || '').trim()].filter(Boolean).join(' ')
  const place = [input.location, match.venue].filter((value, index, all) => value && all.indexOf(value) === index).join('　') || '待定'
  const sequence = match.matchSequence || match.sequence || '待定'
  const divisionName = input.divisionName || '未设置'

  let xml = replaceTableAt(templateXml, 0, tableXml => {
    const rows = [...tableXml.matchAll(WORD_ROW)].map(item => item[0])
    if (rows.length < 2) throw new Error('裁判名单表模板的比赛信息栏不完整')
    const titleRow = setRowCells(rows[0], ['比赛名称：', matchName])
    const dateRow = setRowCells(rows[1], ['比赛时间：', dateTime])
    const placeRow = setRowCells(rows[1], ['比赛地点：', `${place}　场序：第${sequence}场　组别：${divisionName}`])
    return withRows(tableXml, [titleRow, dateRow, placeRow])
  })

  xml = replaceTableAt(xml, 2, tableXml => {
    const rows = [...tableXml.matchAll(WORD_ROW)].map(item => item[0])
    if (!rows.length) return tableXml
    const templateRow = rows[0]
    const sourceCells = [...templateRow.matchAll(WORD_CELL)].map(item => item[0])
    const makeRoleRow = labels => {
      let index = 0
      let roleIndex = 0
      return templateRow.replace(WORD_CELL, () => {
        const sourceCell = sourceCells[index]
        const current = index++
        if (current % 4) return ''
        let cell = setCellText(sourceCell, `${labels[roleIndex++]}  ____________`)
        cell = setCellWidth(cell, 10400)
        return cell.replace(/<w:tcPr\b[^>]*>([\s\S]*?)<\/w:tcPr>/, '<w:tcPr>$1<w:gridSpan w:val="4"/></w:tcPr>')
      })
    }
    return withRows(tableXml, [
      makeRoleRow(['主裁判：', '第一助理裁判：']),
      makeRoleRow(['第二助理裁判：', '第四官员：'])
    ])
  })

  xml = replaceTableAt(xml, 1, tableXml => {
    const rows = [...tableXml.matchAll(WORD_ROW)].map(item => item[0])
    if (rows.length < 7) throw new Error('裁判名单表模板的队员栏不完整')
    const headingRows = [rows[0], ...rows.slice(2, 5)].map(addRepeatingHeader)
    headingRows[0] = setRowCells(headingRows[0], [`主队：${input.homeName || '主队'}`, `客队：${input.awayName || '客队'}`])
    headingRows[3] = formatRosterRow(setRowCells(expandRosterRow(headingRows[3]), [
      '序号', '队员姓名', '号码', '首发', '替补', '说明', '换上 min', '比赛记录（进球/黄牌/红牌及时间）', '换下 min',
      '序号', '队员姓名', '号码', '首发', '替补', '说明', '换上 min', '比赛记录（进球/黄牌/红牌及时间）', '换下 min'
    ]), true)
    const rosterTemplate = rows[5]
    const signatureRow = rows.at(-1)
    const rowCount = Math.max(1, Number(input.rowCount) || 0, input.homePlayers.length, input.awayPlayers.length)
    const rosterRows = Array.from({ length: rowCount }, (_, index) => {
      const home = input.homePlayers[index] || {}
      const away = input.awayPlayers[index] || {}
      return formatRosterRow(setRowCells(expandRosterRow(rosterTemplate), [
        String(index + 1), home.name || '', home.number || '', '', '', home.note || '', '', '', '',
        String(index + 1), away.name || '', away.number || '', '', '', away.note || '', '', '', ''
      ]))
    })
    const pageCount = rowCount > 20 ? Math.ceil(rowCount / 20) : 1
    const rowsPerPage = Math.floor(rowCount / pageCount)
    const extraRows = rowCount % pageCount
    const pageTables = []
    let offset = 0
    for (let page = 0; page < pageCount; page += 1) {
      const pageRows = rowsPerPage + (page < extraRows ? 1 : 0)
      const chunk = rosterRows.slice(offset, offset + pageRows)
      offset += pageRows
      pageTables.push(withRows(tableXml, [...headingRows, ...chunk, ...(page === pageCount - 1 ? [signatureRow] : [])]))
    }
    return pageTables.join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
  })

  xml = updateTextNode(xml, value => value.includes('参赛队首发、替补队员名单及比赛记录表'), '裁判首发阵容信息表')
  xml = removeParagraphMatching(xml, value => value.replace(/\s/g, '') === '赛小蜂足球赛事')
  xml = updateTextNode(xml, value => value.includes('五人制比赛正式用表'), '本名单由赛小蜂足球后台自动生成，最终解释权归赛事组委会所有！')
  return xml
}

export async function createRefereeLineupSheet(input, templateBytes = null) {
  let sourceBytes = templateBytes
  if (!sourceBytes) {
    const response = await fetch(TEMPLATE_PATH, { cache: 'force-cache' })
    if (!response.ok) throw new Error('名单表模板加载失败，请刷新页面后重试')
    sourceBytes = await response.arrayBuffer()
  }
  const zip = await JSZip.loadAsync(sourceBytes)
  const document = zip.file('word/document.xml')
  if (!document) throw new Error('名单表模板文件无法读取')
  const documentXml = await document.async('string')
  zip.file('word/document.xml', buildDocumentXml(documentXml, input))
  const coreProperties = zip.file('docProps/core.xml')
  if (coreProperties) zip.file('docProps/core.xml', formatCoreProperties(await coreProperties.async('string')))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

export function refereeLineupSheetFileName(match, homeName, awayName) {
  const safePart = value => String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-')
  const sequence = match?.matchSequence || match?.sequence || ''
  const safeTime = safePart([match?.matchDate, match?.matchTime].filter(Boolean).join('-')) || '比赛时间待定'
  const safeSequence = safePart(sequence).replace(/[^\dA-Za-z-]/g, '')
  const safeHome = safePart(homeName || match?.homeTeamName || '主队')
  const safeAway = safePart(awayName || match?.awayTeamName || '客队')
  return `${safeTime}-${safeSequence ? `场序${safeSequence}` : '场序待定'}-${safeHome}-vs-${safeAway}.docx`
}
