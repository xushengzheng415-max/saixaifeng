import JSZip from 'jszip'

const WORD_TEXT = /<w:t\b[^>]*\/>|<w:t\b[^>]*>[\s\S]*?<\/w:t>/g
const WORD_TABLE = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g
const WORD_ROW = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
const WORD_CELL = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
const TEMPLATE_BASE = import.meta.env?.BASE_URL || '/admin/'
const TEMPLATE_PATH = `${TEMPLATE_BASE}templates/referee-match-sheet-template.docx`
const LOGO_PATH = `${TEMPLATE_BASE}logo-saixiaofeng.png`
const ROSTER_WIDTHS = [280, 1240, 280, 360, 360, 360, 360, 360, 360, 360, 360]
const ROSTER_LABELS = ['序号', '队员姓名', '号码', '首发', '替补', '身份', '换上', '换下', '进球', '黄牌', '红牌']
export const REFEREE_SHEET_LEGEND = [
  '说明：首发打√，替补打○，不上场标×；',
  '身份：队长标C，守门员标GK，停赛标S。',
  '换上、换下、进球、黄牌、红牌各栏填写发生分钟。'
]

function kitLine(colors) {
  return `球衣颜色：上衣${colors?.jersey || '____'}　短裤${colors?.shorts || '____'}　球袜${colors?.socks || '____'}`
}

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

function setTableGrid(tableXml, widths) {
  const grid = `<w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
  let result = /<w:tblGrid\b/.test(tableXml)
    ? tableXml.replace(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/, grid)
    : tableXml.replace('</w:tblPr>', `</w:tblPr>${grid}`)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  result = result.replace(/<w:tblW\b[^>]*\/>/, `<w:tblW w:w="${totalWidth}" w:type="dxa"/>`)
  result = result.replace(/(<w:tblPr\b[^>]*>)([\s\S]*?)(<\/w:tblPr>)/, (whole, open, properties, close) => {
    if (/<w:jc\b/.test(properties)) return whole
    const widthTag = properties.match(/<w:tblW\b[^>]*\/>/)?.[0]
    const centered = widthTag
      ? properties.replace(widthTag, `${widthTag}<w:jc w:val="center"/>`)
      : `<w:jc w:val="center"/>${properties}`
    return `${open}${centered}${close}`
  })
  result = result.replace(/(<w:tcW\b[^>]*\bw:w=")5200("[^>]*\/>)/g, (_, prefix, suffix) => `${prefix}4680${suffix}`)
  result = result.replace(/(<w:gridSpan\b[^>]*\bw:val=")8("\s*\/>)/g, (_, prefix, suffix) => `${prefix}11${suffix}`)
  result = result.replace(/(<w:gridSpan\b[^>]*\bw:val=")6("\s*\/>)/g, (_, prefix, suffix) => `${prefix}9${suffix}`)
  return result
}

function setTableWidthAndCenter(tableXml, width) {
  let result = tableXml.replace(/<w:tblW\b[^>]*\/>/, `<w:tblW w:w="${width}" w:type="dxa"/>`)
  return result.replace(/(<w:tblPr\b[^>]*>)([\s\S]*?)(<\/w:tblPr>)/, (whole, open, properties, close) => {
    const centered = /<w:jc\b/.test(properties)
      ? properties.replace(/<w:jc\b[^>]*\/>/, '<w:jc w:val="center"/>')
      : properties.replace(/(<w:tblW\b[^>]*\/>)/, '$1<w:jc w:val="center"/>')
    return `${open}${centered}${close}`
  })
}

function setExplicitTableGrid(tableXml, widths) {
  const grid = `<w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
  const withGrid = /<w:tblGrid\b/.test(tableXml)
    ? tableXml.replace(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/, grid)
    : tableXml.replace('</w:tblPr>', `</w:tblPr>${grid}`)
  return setTableWidthAndCenter(withGrid, widths.reduce((sum, width) => sum + width, 0))
}

function alignTeamTableRow(rowXml) {
  return rowXml
    .replace(/(<w:tcW\b[^>]*\bw:w=")5200("[^>]*\/>)/g, (_, prefix, suffix) => `${prefix}4680${suffix}`)
    .replace(/(<w:gridSpan\b[^>]*\bw:val=")8("\s*\/>)/g, (_, prefix, suffix) => `${prefix}11${suffix}`)
    .replace(/(<w:gridSpan\b[^>]*\bw:val=")6("\s*\/>)/g, (_, prefix, suffix) => `${prefix}9${suffix}`)
}

function setCellFontSize(cellXml, size) {
  return cellXml.replace(/(<w:sz(?:Cs)?\b[^>]*\bw:val=")\d+(")/g, (_, prefix, suffix) => `${prefix}${size}${suffix}`)
}

function expandRosterRow(rowXml) {
  const cells = [...rowXml.matchAll(WORD_CELL)].map(item => item[0])
  if (cells.length < 16) throw new Error('裁判名单表队员栏列数不完整')
  const expanded = []
  for (const offset of [0, 8]) expanded.push(...cells.slice(offset, offset + 5), cells[offset + 5], cells[offset + 6], cells[offset + 6], cells[offset + 7], cells[offset + 7], cells[offset + 7])
  const firstCell = rowXml.search(/<w:tc\b/)
  const lastCell = rowXml.lastIndexOf('</w:tc>')
  if (firstCell < 0 || lastCell < firstCell) throw new Error('裁判名单表队员栏结构不完整')
  return `${rowXml.slice(0, firstCell)}${expanded.join('')}${rowXml.slice(lastCell + '</w:tc>'.length)}`
}

function formatRosterRow(rowXml, isHeader = false) {
  let cellIndex = 0
  let result = rowXml.replace(WORD_CELL, cellXml => {
    const sideColumn = cellIndex % ROSTER_WIDTHS.length
    cellIndex += 1
    let next = cellXml
    next = setCellWidth(next, ROSTER_WIDTHS[sideColumn])
    if (!isHeader && sideColumn === 1) next = setCellFontSize(next, 18).replace(/<w:rPr\b[^>]*>/g, opening => `${opening}<w:b/>`)
    return next
  })
  if (!isHeader) result = result.replace(/(<w:trHeight\b[^>]*\bw:val=")\d+(")/, (_, prefix, suffix) => `${prefix}320${suffix}`)
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

function updateParagraphLines(xml, predicate, lines) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
    const text = [...paragraph.matchAll(WORD_TEXT)].map(([token]) => {
      const content = token.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/)?.[1] || ''
      return unescapeXml(content)
    }).join('')
    if (!predicate(text)) return paragraph
    let first = true
    return paragraph.replace(WORD_TEXT, token => {
      if (!first) return textTagWithContent(token, '')
      first = false
      return [textTagWithContent(token, lines[0]), ...lines.slice(1).flatMap(line => ['<w:br/>', textTagWithContent(token, line)])].join('')
    })
  })
}

function logoDrawingXml(relationshipId) {
  const width = 1230924
  const height = 457200
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="1" name="赛小蜂足球 Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo-saixiaofeng.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

function replaceAttributionWithLogo(xml, relationshipId) {
  let replaced = false
  let result = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, paragraph => {
    const text = [...paragraph.matchAll(WORD_TEXT)].map(([token]) => {
      const content = token.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/)?.[1] || ''
      return unescapeXml(content)
    }).join('')
    if (!text.includes('本名单由赛小蜂足球后台自动生成') && !text.includes('五人制比赛正式用表')) return paragraph
    replaced = true
    const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>'
    let properties = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] || '<w:pPr><w:spacing w:before="70" w:after="0"/></w:pPr>'
    if (/<w:jc\b[^>]*\/>/.test(properties)) properties = properties.replace(/<w:jc\b[^>]*\/>/, '<w:jc w:val="left"/>')
    else properties = properties.replace('</w:pPr>', '<w:jc w:val="left"/></w:pPr>')
    const statement = '<w:r><w:rPr><w:rFonts w:ascii="SimSun" w:eastAsia="宋体" w:hAnsi="SimSun"/><w:b/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t xml:space="preserve">  本名单由赛小蜂足球后台自动生成，最终解释权归赛事组委会所有！</w:t></w:r>'
    return `${open}${properties}${logoDrawingXml(relationshipId)}${statement}</w:p>`
  })
  if (!replaced) throw new Error('工作单页脚缺少版权说明位置')
  result = result.replace(/<w:document\b([^>]*)>/, (opening, attributes) => {
    let next = attributes
    if (!/xmlns:wp=/.test(next)) next += ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    if (!/xmlns:a=/.test(next)) next += ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    if (!/xmlns:pic=/.test(next)) next += ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    if (!/xmlns:r=/.test(next)) next += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    return `<w:document${next}>`
  })
  return result
}

function addImageRelationship(xml) {
  const ids = [...xml.matchAll(/\bId="rId(\d+)"/g)].map(([, value]) => Number(value))
  const relationshipId = `rId${Math.max(0, ...ids) + 1}`
  const relationship = `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-saixiaofeng.png"/>`
  return { relationshipId, xml: xml.replace('</Relationships>', `${relationship}</Relationships>`) }
}

function addPngContentType(xml) {
  if (/<Default\b[^>]*Extension="png"/.test(xml)) return xml
  return xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
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

function buildDocumentXml(templateXml, input, logoRelationshipId) {
  const match = input.match || {}
  const formatLabel = formatMatchLabel(input.matchFormat)
  const matchName = input.tournamentName
    ? `${input.tournamentName}${formatLabel ? `（${formatLabel}）` : ''}`
    : `足球比赛${formatLabel ? `（${formatLabel}）` : ''}`
  const dateTime = [formatLocalDate(match.matchDate), String(match.matchTime || '').trim()].filter(Boolean).join(' ')
  const place = [input.location, match.venue].filter((value, index, all) => value && all.indexOf(value) === index).join('　') || '待定'
  const sequence = match.matchSequence || match.matchNo || match.sequence || match.matchIndex || '待定'
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
      return templateRow.replace(WORD_CELL, () => {
        const current = index++
        if (current !== 0 && current !== 4) return ''
        const sourceCell = sourceCells[current]
        const label = labels[current === 0 ? 0 : 1]
        return setCellWidth(setCellText(sourceCell, `${label}  ____________`), 4680)
      })
    }
    return setExplicitTableGrid(withRows(tableXml, [
      makeRoleRow(['主裁判：', '第一助理裁判：']),
      makeRoleRow(['第二助理裁判：', '第四官员：']),
      makeRoleRow(['裁判监督：', '比赛监督：'])
    ]), [4680, 4680])
  })

  xml = replaceTableAt(xml, 3, () => '')

  xml = replaceTableAt(xml, 1, tableXml => {
    const rows = [...tableXml.matchAll(WORD_ROW)].map(item => item[0])
    if (rows.length < 7) throw new Error('裁判名单表模板的队员栏不完整')
    const headingRows = [rows[0], ...rows.slice(2, 5)].map(row => alignTeamTableRow(addRepeatingHeader(row)))
    headingRows[0] = setRowCells(headingRows[0], [`主队：${input.homeName || '主队'}`, `客队：${input.awayName || '客队'}`])
    const kitRow = setRowCells(headingRows[1], [kitLine(input.kitColors?.home), kitLine(input.kitColors?.away)])
    headingRows.splice(1, 0, kitRow)
    headingRows[4] = formatRosterRow(setRowCells(expandRosterRow(headingRows[4]), [...ROSTER_LABELS, ...ROSTER_LABELS]), true)
    const rosterTemplate = rows[5]
    const signatureRow = alignTeamTableRow(rows.at(-1)).replaceAll('球席', '球衣')
    const rowCount = Math.max(1, Number(input.rowCount) || 0, input.homePlayers.length, input.awayPlayers.length)
    const rosterRows = Array.from({ length: rowCount }, (_, index) => {
      const home = input.homePlayers[index] || {}
      const away = input.awayPlayers[index] || {}
      return formatRosterRow(setRowCells(expandRosterRow(rosterTemplate), [
        String(index + 1), home.name || '', home.number || '', '', '', home.note || '', '', '', '', '', '',
        String(index + 1), away.name || '', away.number || '', '', '', away.note || '', '', '', '', '', ''
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
      pageTables.push(withRows(setTableGrid(tableXml, [...ROSTER_WIDTHS, ...ROSTER_WIDTHS]), [...headingRows, ...chunk, ...(page === pageCount - 1 ? [signatureRow] : [])]))
    }
    return pageTables.join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
  })

  xml = updateTextNode(xml, value => value.includes('参赛队首发、替补队员名单及比赛记录表'), '裁判首发阵容信息表')
  xml = updateParagraphLines(xml, value => value.includes('说明：') && value.includes('停赛'), REFEREE_SHEET_LEGEND)
  xml = removeParagraphMatching(xml, value => value.replace(/\s/g, '') === '赛小蜂足球赛事')
  xml = replaceAttributionWithLogo(xml, logoRelationshipId)
  return xml
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[character])
}

export function createRefereeLineupPrintHtml(input) {
  const allWidths=[...ROSTER_WIDTHS,...ROSTER_WIDTHS]
  const rowCount=Math.max(Number(input.rowCount)||0,input.homePlayers.length,input.awayPlayers.length,1)
  const grid=`<colgroup>${allWidths.map(width=>`<col style="width:${(width/9360*100).toFixed(3)}%">`).join('')}</colgroup>`
  const labels=[...ROSTER_LABELS,...ROSTER_LABELS]
  const header=`<tr>${labels.map(label=>`<th>${label}</th>`).join('')}</tr>`
  const match=input.match||{}
  const date=String(match.matchDate||'').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/,'$1年$2月$3日')
  const sequence=match.matchSequence||match.matchNo||match.sequence||match.matchIndex||'待定'
  const format=String(input.matchFormat||'').replace('side','人制')
  const location=[input.location,match.venue].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join('　')
  const logo=new URL(LOGO_PATH,window.location.origin).href
  const pageCount=rowCount>20?Math.ceil(rowCount/20):1
  const rowsPerPage=Math.floor(rowCount/pageCount),extraRows=rowCount%pageCount
  const pages=[]
  let offset=0
  for(let page=0;page<pageCount;page+=1){
    const count=rowsPerPage+(page<extraRows?1:0)
    const rowHtml=Array.from({length:count},(_,row)=>{
      const index=offset+row,home=input.homePlayers[index]||{},away=input.awayPlayers[index]||{}
      const cells=[String(index+1),home.name||'',home.number||'','','',home.note||'','','','','','',String(index+1),away.name||'',away.number||'','','',away.note||'','','','','','']
      return `<tr>${cells.map((value,cell)=>`<td${cell%ROSTER_WIDTHS.length===1?' class="player-name"':''}>${escapeHtml(value)}</td>`).join('')}</tr>`
    }).join('')
    offset+=count
    const first=page===0,last=page===pageCount-1
    const title=first?`<h1>裁判首发阵容信息表</h1><div class="meta"><div><span>比赛名称：</span><b>${escapeHtml(`${input.tournamentName||'足球比赛'}（${format}）`)}</b></div><div><span>比赛时间：</span><b>${escapeHtml(`${date} ${match.matchTime||''}`)}</b></div><div><span>比赛地点：</span><b>${escapeHtml(`${location}　场序：第${sequence}场　组别：${input.divisionName||''}`)}</b></div></div>`:''
    const bottom=last?`<div class="team-sign"><span>主教练签名：________________</span><span>球衣　上 / 下</span><span>主教练签名：________________</span><span>球衣　上 / 下</span></div><p class="legend">${REFEREE_SHEET_LEGEND.map(line => '<span>'+escapeHtml(line)+'</span>').join('')}</p><p class="result">比赛结果：______:______　加时赛（点球决胜）结果：______:______　获胜队：____________________</p><div class="officials"><span>主裁判：____________</span><span>第一助理裁判：____________</span><span>第二助理裁判：____________</span><span>第四官员：____________</span><span>裁判监督：____________</span><span>比赛监督：____________</span></div><footer><img src="${logo}" alt="赛小蜂足球"><strong>本名单由赛小蜂足球后台自动生成，最终解释权归赛事组委会所有！</strong></footer>`:''
    pages.push(`<section class="sheet">${title}<table class="teams"><tbody><tr><td>主队：${escapeHtml(input.homeName)}</td><td>客队：${escapeHtml(input.awayName)}</td></tr><tr><td>${escapeHtml(kitLine(input.kitColors?.home))}</td><td>${escapeHtml(kitLine(input.kitColors?.away))}</td></tr><tr><td>领队/主教练：________________</td><td>领队/主教练：________________</td></tr><tr><td>工作人员/队医：____________</td><td>工作人员/队医：____________</td></tr></tbody></table><table class="roster">${grid}<thead>${header}</thead><tbody>${rowHtml}</tbody></table>${bottom}</section>`)
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>裁判工作单</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"SimSun","Songti SC",serif}.sheet{width:100%;page-break-after:always;break-after:page;display:flex;flex-direction:column}.sheet:last-child{page-break-after:auto;break-after:auto}h1{margin:0 0 4mm;text-align:center;font-size:18pt}.meta{margin:0 5mm 4mm;font-size:10pt}.meta div{display:grid;grid-template-columns:27mm 1fr;margin:2mm 0}.teams{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}.teams td{height:7.5mm;padding:1mm;border:.5pt solid #777}.roster{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}.roster th,.roster td{height:6mm;padding:1mm .4mm;border:.5pt solid #777;text-align:center;overflow-wrap:anywhere}.roster th{height:11mm;font-weight:400}.roster td.player-name{font-size:9pt;font-weight:bold}.team-sign{display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:1mm;padding:2mm 0;border:.5pt solid #777;font-size:8pt}.team-sign span{text-align:center}.legend,.result{margin:2mm 0;font-size:8pt}.legend span{display:block;white-space:nowrap;line-height:1.25}.officials{display:grid;grid-template-columns:1fr 1fr;gap:3mm 14mm;margin:3mm 14mm 0;font-size:10pt}.officials span{min-height:7mm}footer{display:flex;align-items:center;gap:4mm;margin:auto 0 0;padding-top:4mm;font-size:8pt}footer img{width:34mm;height:auto}footer strong{font-weight:bold}@media screen{body{background:#e9ecef}.sheet{width:186mm;min-height:273mm;margin:8mm auto;padding:0;background:#fff;box-shadow:0 2mm 8mm #0002}}</style></head><body>${pages}<script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(image=>image.decode?.().catch(()=>{})));setTimeout(()=>window.print(),300)})<\/script></body></html>`
}

export function createRefereePrintLoadingHtml(message='正在生成裁判工作单') {
  const logo=new URL(LOGO_PATH,window.location.origin).href
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>正在生成裁判工作单</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f5;color:#183a27;font-family:"Microsoft YaHei",sans-serif}.box{width:min(420px,calc(100vw - 48px));padding:32px;background:#fff;border:1px solid #dce5df;border-radius:10px;text-align:center;box-shadow:0 8px 32px #183a2712}.box img{width:150px;height:auto}.spin{width:28px;height:28px;margin:20px auto 12px;border:3px solid #d7e8dc;border-top-color:#078747;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.bar{height:8px;margin-top:16px;overflow:hidden;border-radius:8px;background:#edf2ee}.bar i{display:block;width:35%;height:100%;border-radius:8px;background:#078747;animation:progress 1.2s ease-in-out infinite}@keyframes progress{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}.msg{margin-top:12px;color:#6c7b71;font-size:13px}</style></head><body><main class="box"><img src="${logo}" alt="赛小蜂"><div class="spin"></div><strong>正在生成裁判工作单</strong><div class="bar"><i></i></div><p class="msg" id="referee-print-stage">${escapeHtml(message)}</p></main></body></html>`
}

export async function createRefereeLineupSheet(input, templateBytes = null, logoBytes = null) {
  let sourceBytes = templateBytes
  if (!sourceBytes) {
    const response = await fetch(TEMPLATE_PATH, { cache: 'force-cache' })
    if (!response.ok) throw new Error('名单表模板加载失败，请刷新页面后重试')
    sourceBytes = await response.arrayBuffer()
  }
  const zip = await JSZip.loadAsync(sourceBytes)
  const document = zip.file('word/document.xml')
  if (!document) throw new Error('名单表模板文件无法读取')
  let imageBytes = logoBytes
  if (!imageBytes) {
    const response = await fetch(LOGO_PATH, { cache: 'force-cache' })
    if (!response.ok) throw new Error('裁判工作单 Logo 加载失败，请刷新页面后重试')
    imageBytes = await response.arrayBuffer()
  }
  const relationships = zip.file('word/_rels/document.xml.rels')
  const contentTypes = zip.file('[Content_Types].xml')
  if (!relationships || !contentTypes) throw new Error('裁判工作单模板关系文件不完整')
  const { relationshipId, xml: relationshipXml } = addImageRelationship(await relationships.async('string'))
  const documentXml = await document.async('string')
  zip.file('word/document.xml', buildDocumentXml(documentXml, input, relationshipId))
  zip.file('word/_rels/document.xml.rels', relationshipXml)
  zip.file('[Content_Types].xml', addPngContentType(await contentTypes.async('string')))
  zip.file('word/media/logo-saixiaofeng.png', imageBytes)
  const coreProperties = zip.file('docProps/core.xml')
  if (coreProperties) zip.file('docProps/core.xml', formatCoreProperties(await coreProperties.async('string')))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

export function refereeLineupSheetFileName(match, homeName, awayName) {
  const safePart = value => String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-')
  const sequence = match?.matchSequence || match?.matchNo || match?.sequence || match?.matchIndex || ''
  const safeTime = safePart([match?.matchDate, match?.matchTime].filter(Boolean).join('-')) || '比赛时间待定'
  const safeSequence = safePart(sequence).replace(/[^\dA-Za-z-]/g, '')
  const safeHome = safePart(homeName || match?.homeTeamName || '主队')
  const safeAway = safePart(awayName || match?.awayTeamName || '客队')
  return `${safeTime}-${safeSequence ? `场序${safeSequence}` : '场序待定'}-${safeHome}-vs-${safeAway}.docx`
}
