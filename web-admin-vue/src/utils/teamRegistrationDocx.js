import { provincesData, cityMapData } from '../views/team/areaData.js'
import { generateJerseyName } from './jerseyName.js'
import { parseRegistrationKitColors } from './registrationKitColors.js'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const ROLE_TYPE_MAP = {
  '领队': 'team_leader',
  '领队(联络员)': 'team_leader',
  '领队（联络员）': 'team_leader',
  '联络员': 'team_leader',
  '主教练': 'head_coach',
  '教练': 'head_coach',
  '队医': 'doctor',
  '运动员': 'player',
  '球员': 'player',
  '队员': 'player'
}

const ROLE_LABEL_MAP = {
  team_leader: '领队',
  head_coach: '主教练',
  doctor: '队医',
  player: '球员'
}

function localName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').pop()
}

function elementChildren(node, name) {
  return Array.from(node?.childNodes || []).filter(child => child.nodeType === 1 && (!name || localName(child) === name))
}

function descendants(node, name) {
  return Array.from(node?.getElementsByTagName?.('*') || []).filter(child => localName(child) === name)
}

function attributeByLocalName(node, name) {
  const direct = node?.getAttributeNS?.(WORD_NS, name) || node?.getAttributeNS?.(REL_NS, name)
  if (direct) return direct
  return Array.from(node?.attributes || []).find(attribute => localName(attribute) === name)?.value || ''
}

function normalizeText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

function cellText(cellNode) {
  const paragraphs = descendants(cellNode, 'p')
  const lines = paragraphs.map(paragraph => descendants(paragraph, 't').map(node => node.textContent || '').join('')).filter(Boolean)
  return normalizeText(lines.join('\n'))
}

function parseRow(rowNode) {
  let column = 0
  return {
    cells: elementChildren(rowNode, 'tc').map(cellNode => {
      const properties = elementChildren(cellNode, 'tcPr')[0]
      const spanNode = properties ? elementChildren(properties, 'gridSpan')[0] : null
      const span = Math.max(1, Number(attributeByLocalName(spanNode, 'val') || 1))
      // 现代图形：<a:blip r:embed="rIdN">
      const blipImages = descendants(cellNode, 'blip').map(node => node.getAttributeNS?.(REL_NS, 'embed') || attributeByLocalName(node, 'embed')).filter(Boolean)
      // 旧式 VML 图片：<v:imagedata r:id="rIdN">。WPS 与早期 Word 另存出的图片走这种形式，
      // 属性名是 r:id 而不是 r:embed，此前完全识别不到，导致照片被判为缺失。
      const vmlImages = descendants(cellNode, 'imagedata').map(node => node.getAttributeNS?.(REL_NS, 'id') || attributeByLocalName(node, 'id')).filter(Boolean)
      const images = [...blipImages, ...vmlImages]
      const cell = { column, span, text: cellText(cellNode), imageIds: images }
      column += span
      return cell
    })
  }
}

function parseTable(tableNode) {
  return { rows: elementChildren(tableNode, 'tr').map(parseRow) }
}

function cellAt(row, column) {
  return row?.cells?.find(cell => column >= cell.column && column < cell.column + cell.span) || null
}

const NAME_CELL_PATTERN = /姓名/
const IDENTITY_CELL_PATTERN = /身份证号|身份证/
const JERSEY_CELL_PATTERN = /球服号码|球衣号码|球员号码|号码/

function cellsMatching(row, pattern) {
  return (row?.cells || []).filter(cell => pattern.test(cell.text || ''))
}

// 同一人物块跨页时，Word/WPS 可能把号码行拆到下一张表；部分文档还会在角色行保留
// 额外的网格跨度，导致“同一 column”在号码行向后偏一格。人数一致时按从左到右的人员
// 顺序配对最可靠；人数不一致时才回退到网格列，兼容旧模板的合并单元格。
export function registrationCellsForPeople(row, roleCells, pattern) {
  const candidates = cellsMatching(row, pattern)
  return roleCells.map((roleCell, personIndex) => {
    if (candidates.length === roleCells.length) return candidates[personIndex] || null
    const direct = cellAt(row, roleCell.column)
    if (direct && pattern.test(direct.text || '')) return direct
    return candidates[personIndex] || direct || null
  })
}

// 不再假定人物块固定为“角色、照片、姓名、身份证、号码”连续 5 行。以姓名行为锚点，
// 在相邻人物块边界内寻找身份证与号码行；表格因分页被拆开、两表之间插入空行时仍可配对。
export function findRegistrationPersonBlocks(rows) {
  const sourceRows = Array.isArray(rows) ? rows : []
  const nameIndexes = sourceRows
    .map((row, index) => cellsMatching(row, NAME_CELL_PATTERN).length ? index : -1)
    .filter(index => index >= 0)

  return nameIndexes.map((nameIndex, blockIndex) => {
    const previousNameIndex = blockIndex > 0 ? nameIndexes[blockIndex - 1] : -1
    const nextNameIndex = blockIndex + 1 < nameIndexes.length ? nameIndexes[blockIndex + 1] : sourceRows.length
    let roleIndex = -1
    for (let index = nameIndex - 1; index > previousNameIndex; index -= 1) {
      if ((sourceRows[index]?.cells || []).some(cell => roleType(cell.text))) {
        roleIndex = index
        break
      }
    }
    if (roleIndex < 0) return null

    let identityIndex = -1
    let numberIndex = -1
    for (let index = nameIndex + 1; index < nextNameIndex; index += 1) {
      if (identityIndex < 0 && cellsMatching(sourceRows[index], IDENTITY_CELL_PATTERN).length) identityIndex = index
      if (numberIndex < 0 && cellsMatching(sourceRows[index], JERSEY_CELL_PATTERN).length) numberIndex = index
    }

    return {
      roleRow: sourceRows[roleIndex],
      nameRow: sourceRows[nameIndex],
      identityRow: identityIndex >= 0 ? sourceRows[identityIndex] : null,
      numberRow: numberIndex >= 0 ? sourceRows[numberIndex] : null,
      personRows: sourceRows.slice(roleIndex, nextNameIndex)
    }
  }).filter(Boolean)
}

// 照片按模板约定应位于「角色行 +1」且与本人角色同列，但真实报名表常把照片插到该人物块的其他行，
// 或整块行序与模板不一致（多插/少插一行就会整体错位）。此处按「本人所在的 5 行人物块、同一列」
// 依次查找：位于约定位置的单元格优先级最高，因此既有能正常识别的文件结果完全不变。
function firstImageInColumn(rows, column) {
  for (const row of rows) {
    const ids = cellAt(row, column)?.imageIds
    if (ids && ids.length) return ids[0]
  }
  return ''
}

function cleanValue(value, labels) {
  let result = normalizeText(value).replace(/\n/g, ' ')
  for (const label of labels) {
    result = result.replace(new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]?\\s*`), '')
  }
  return result.trim()
}

// 真实报名表的号码写法五花八门：「8」「8号」「第8号」「No.8」「#8」「8 号」，甚至全角「８」。
// 原实现只接受纯数字，导致「8号」被误判为未填写球服号码。
// 这里取第一段 1~3 位数字（连续 4 位以上视为年份等其它内容，不当作号码），并归一化前导零。
function jerseyNumberFromText(value) {
  const normalized = String(value || '')
    // 全角数字 → 半角
    .replace(/[\uFF10-\uFF19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
  const runs = normalized.match(/\d+/g) || []
  const candidate = runs.find(run => run.length <= 3)
  return candidate ? String(Number(candidate)) : ''
}

function firstPhone(value) {
  return (String(value || '').replace(/[\s-]/g, '').match(/1[3-9]\d{9}/) || [])[0] || ''
}

function normalizeIdentity(value) {
  return String(value || '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 18)
}

function parseIdentity(identityNumber) {
  if (!/^\d{17}[0-9X]$/.test(identityNumber)) return { birthDate: '', gender: '', nativePlace: '' }
  const year = identityNumber.slice(6, 10)
  const month = identityNumber.slice(10, 12)
  const day = identityNumber.slice(12, 14)
  const date = new Date(`${year}-${month}-${day}T00:00:00`)
  const validDate = !Number.isNaN(date.getTime()) && date.getFullYear() === Number(year) && date.getMonth() + 1 === Number(month) && date.getDate() === Number(day)
  const nativePlaceCode = identityNumber.slice(0, 6)
  const provinceCode = `${nativePlaceCode.slice(0, 2)}0000`
  const cityCode = `${nativePlaceCode.slice(0, 4)}00`
  const provinceName = provincesData.find(item => item.code === provinceCode)?.name || ''
  const cityName = (cityMapData[provinceCode] || []).find(item => item.code === cityCode)?.name || ''
  const locationNames = [provinceName, cityName].filter(Boolean)
  const nativePlaceBase = locationNames.filter((name, index) => index === 0 || name !== locationNames[index - 1]).join('')
  const nativePlace = nativePlaceBase || '待核验'
  return {
    birthDate: validDate ? `${year}-${month}-${day}` : '',
    gender: Number(identityNumber.charAt(16)) % 2 === 1 ? 'male' : 'female',
    nativePlace
  }
}

function relationshipMap(xmlDocument) {
  const map = new Map()
  descendants(xmlDocument, 'Relationship').forEach(node => {
    const id = node.getAttribute('Id') || attributeByLocalName(node, 'Id')
    const target = node.getAttribute('Target') || attributeByLocalName(node, 'Target')
    if (id && target && !/^https?:/i.test(target)) map.set(id, target)
  })
  return map
}

function normalizeWordTarget(target) {
  const parts = `word/${String(target || '')}`.replace(/\\/g, '/').split('/')
  const normalized = []
  parts.forEach(part => {
    if (!part || part === '.') return
    if (part === '..') normalized.pop()
    else normalized.push(part)
  })
  return normalized.join('/')
}

function imageMimeType(path) {
  const extension = String(path || '').split('.').pop()?.toLowerCase()
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif'
  }[extension] || 'image/png'
}

async function imageFileFromRelationship(zip, relationships, relationshipId, baseName) {
  const target = relationships.get(relationshipId)
  if (!target) return null
  const path = normalizeWordTarget(target)
  const entry = zip.file(path)
  if (!entry) return null
  const mimeType = imageMimeType(path)
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]
  const blob = await entry.async('blob')
  return new File([blob], `${baseName}.${extension}`, { type: mimeType, lastModified: Date.now() })
}

function roleType(value) {
  const normalized = String(value || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
  return ROLE_TYPE_MAP[normalized] || (normalized.includes('领队') || normalized.includes('联络员') ? 'team_leader' : (normalized.includes('教练') ? 'head_coach' : (normalized.includes('队医') ? 'doctor' : (normalized.includes('运动员') || normalized.includes('球员') || normalized.includes('队员') ? 'player' : ''))))
}

function uniqueWarnings(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

export function parseRegistrationJerseyNumber(value) {
  return jerseyNumberFromText(value)
}

function personNameKey(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase()
}

function dualRoleMeta(person) {
  const label = ROLE_LABEL_MAP[person.roleType] || person.roleLabel || '工作人员'
  return { type:`${person.roleType}_player`, staffLabel:`${label}兼球员`, playerLabel:`兼${label}` }
}

function mergeDuplicatePlayer(target, source) {
  for (const field of ['jerseyNumber','jerseyName','birthDate','gender','nativePlace','photoFile','photoFileId','photoOriginalFileId','photoProcessingStatus']) {
    if ((target[field] == null || target[field] === '') && source[field] != null && source[field] !== '') target[field] = source[field]
  }
}

export async function parseTeamRegistrationDocx(file, options = {}) {
  const rawFile = file?.raw || file
  if (!rawFile || !String(rawFile.name || '').toLowerCase().endsWith('.docx')) throw new Error('请选择 .docx 格式的球队报名表')
  if (rawFile.size > 20 * 1024 * 1024) throw new Error('单份报名表不能超过 20MB')

  const JSZipModule = await import('jszip')
  const JSZip = JSZipModule.default || JSZipModule
  const zip = await JSZip.loadAsync(await rawFile.arrayBuffer())
  const documentEntry = zip.file('word/document.xml')
  const relationshipEntry = zip.file('word/_rels/document.xml.rels')
  if (!documentEntry || !relationshipEntry) throw new Error('报名表不是有效的 Word 文档')

  const parser = new DOMParser()
  const documentXml = parser.parseFromString(await documentEntry.async('text'), 'application/xml')
  const relationshipsXml = parser.parseFromString(await relationshipEntry.async('text'), 'application/xml')
  if (descendants(documentXml, 'parsererror').length || descendants(relationshipsXml, 'parsererror').length) throw new Error('报名表内部结构无法读取')

  const body = descendants(documentXml, 'body')[0]
  const tables = elementChildren(body, 'tbl').map(parseTable)
  if (!tables.length) throw new Error('未找到人员名单表格，请使用报名表模板')

  const relationships = relationshipMap(relationshipsXml)
  const documentText = normalizeText(descendants(body, 'p').map(paragraph => descendants(paragraph, 't').map(node => node.textContent || '').join('')).filter(Boolean).join('\n'))
  const headerTable = tables.find(table => table.rows.some(row => row.cells.some(cell => /球队名称|队名/.test(cell.text)))) || null
  const headerRow = headerTable ? (headerTable.rows.find(row => row.cells.some(cell => /球队名称|队名/.test(cell.text))) || headerTable.rows[0]) : { cells:[] }
  const teamLabelIndex = headerRow.cells.findIndex(cell => /球队名称|队名/.test(cell.text))
  const teamLabel = teamLabelIndex >= 0 ? headerRow.cells[teamLabelIndex] : null
  const teamValueCell = teamLabelIndex >= 0 ? headerRow.cells.slice(teamLabelIndex + 1).find(cell => !/队徽/.test(cell.text)) : null
  const paragraphTeamName = (documentText.match(/球队名称\s*[：:]\s*([^\n]+)/) || documentText.match(/队名\s*[：:]\s*([^\n]+)/) || [])[1] || ''
  const teamName = cleanValue(teamValueCell?.text || teamLabel?.text || paragraphTeamName, ['球队名称', '队名']).slice(0, 50)
  const logoCell = headerRow.cells.find((cell, index) => index > headerRow.cells.findIndex(item => /队徽/.test(item.text)) && cell.imageIds.length)
    || headerRow.cells.find(cell => cell.imageIds.length)
  const skipImages = options.skipImages === true
  const logoFile = !skipImages && logoCell?.imageIds?.[0]
    ? await imageFileFromRelationship(zip, relationships, logoCell.imageIds[0], `team-logo-${Date.now()}`)
    : null

  // Word/WPS 可能在分页处把一张视觉名单拆成连续多个 <w:tbl>。续表有时只有号码行，
  // 因而不能要求每个片段同时含“角色 + 姓名/身份证”；从首个完整名单表开始，把连续且
  // 含角色或名单字段的片段合并，既保留 main 的续表识别，也覆盖号码行单独跨页的情况。
  const rosterFieldPattern = /姓名|身份证|球服号码|球衣号码|球员号码/
  const rosterStartIndex = tables.findIndex(table => (
    table.rows.some(row => row.cells.some(cell => roleType(cell.text)))
    && table.rows.some(row => row.cells.some(cell => rosterFieldPattern.test(cell.text)))
  ))
  const fallbackRosterIndex = tables.findIndex(table => table.rows.some(row => row.cells.some(cell => /身份证|球服号码/.test(cell.text))))
  const resolvedRosterStartIndex = rosterStartIndex >= 0
    ? rosterStartIndex
    : (fallbackRosterIndex >= 0 ? fallbackRosterIndex : tables.length - 1)
  const rosterTableFragments = []
  for (let index = resolvedRosterStartIndex; index < tables.length; index += 1) {
    const table = tables[index]
    const isRosterFragment = table.rows.some(row => row.cells.some(cell => (
      roleType(cell.text) || rosterFieldPattern.test(cell.text)
    )))
    if (!isRosterFragment && rosterTableFragments.length) break
    if (isRosterFragment) rosterTableFragments.push(table)
  }
  const rosterTable = rosterTableFragments.length
    ? { rows: rosterTableFragments.flatMap(table => table.rows) }
    : tables[tables.length - 1]
  const rosterRows = rosterTable.rows
  const kitResult = parseRegistrationKitColors(rosterTable)
  const contactRow = rosterTable.rows.find(row => row.cells.some(cell => /领队|联络员/.test(cell.text)) && firstPhone(row.cells.map(cell => cell.text).join(' ')))
  const contactPhone = firstPhone(contactRow?.cells?.map(cell => cell.text).join(' ') || '')
  const contactLabelCell = contactRow?.cells?.find(cell => /领队|联络员/.test(cell.text))
  const contactNameCell = contactRow?.cells?.find(cell => cell.column > Number(contactLabelCell?.column || 0) && !firstPhone(cell.text) && cleanValue(cell.text, ['姓名']))
  const contactName = cleanValue(contactNameCell?.text || '', ['姓名']).slice(0, 30)

  const people = []
  const warnings = [...kitResult.warnings]
  const errors = []
  for (const personBlock of findRegistrationPersonBlocks(rosterRows)) {
    const { roleRow, nameRow, identityRow, numberRow, personRows } = personBlock
    const roleCells = roleRow.cells.filter(cell => roleType(cell.text))
    if (!roleCells.length) continue
    const nameCells = registrationCellsForPeople(nameRow, roleCells, NAME_CELL_PATTERN)
    const identityCells = registrationCellsForPeople(identityRow, roleCells, IDENTITY_CELL_PATTERN)
    const numberCells = registrationCellsForPeople(numberRow, roleCells, JERSEY_CELL_PATTERN)

    for (let personIndex = 0; personIndex < roleCells.length; personIndex += 1) {
      const roleCell = roleCells[personIndex]
      const type = roleType(roleCell.text)
      const nameCell = nameCells[personIndex]
      const personColumn = Number(nameCell?.column ?? roleCell.column)
      const name = cleanValue(nameCell?.text || '', ['姓名']).slice(0, 30)
      if (!name) continue
      const identityNumber = normalizeIdentity(cleanValue(identityCells[personIndex]?.text || '', ['身份证号', '身份证']))
      const jerseyText = cleanValue(numberCells[personIndex]?.text || '', ['球服号码', '球衣号码', '球员号码', '号码'])
      // 球服号码这里同时应用两处改动：号码容错（jerseyNumberFromText，支持「8号」「第8号」
      // 「全角８」等写法）与「工作人员栏有效号码同样计入」。后者是工作人员兼球员判定所依赖
      // 的行为、线上已生效，因此不再恢复 type === 'player' 守卫。
      const jerseyNumber = jerseyNumberFromText(jerseyText)
      // 先取模板约定位置（角色行 +1、同列），取不到再在该人所在的人物块内同列兜底查找
      const photoRelationshipId = skipImages ? '' : (firstImageInColumn(personRows, personColumn)
        || firstImageInColumn(personRows, roleCell.column)
      )
      const photoFile = photoRelationshipId
        ? await imageFileFromRelationship(zip, relationships, photoRelationshipId, `person-${people.length + 1}-${Date.now()}`)
        : null
      const identity = parseIdentity(identityNumber)
      const person = {
        roleType: type,
        roleLabel: ROLE_LABEL_MAP[type],
        name,
        phone: type === 'team_leader' ? contactPhone : '',
        identityNumber,
        jerseyNumber,
        jerseyName: jerseyNumber ? generateJerseyName(name) : '',
        birthDate: identity.birthDate,
        gender: identity.gender,
        nativePlace: identity.nativePlace,
        photoFile,
        photoFileId: '',
        photoOriginalFileId: '',
        photoProcessingStatus: photoFile ? 'pending' : 'missing',
        error: ''
      }
      if (!identityNumber) warnings.push(`「${name}」未填写身份证号`)
      else if (!/^\d{17}[0-9X]$/.test(identityNumber) || !identity.birthDate) person.error = '身份证号格式不正确'
      // 填了但无法识别时给出具体内容，避免与「根本没填」混为一谈
      if (type === 'player' && !jerseyNumber) {
        warnings.push(jerseyText
          ? `「${name}」球服号码「${jerseyText.slice(0, 12)}」无法识别`
          : `「${name}」未填写球服号码`)
      }
      if (!photoFile && !skipImages) warnings.push(`「${name}」未找到照片`)
      if (person.error) errors.push(`「${name}」${person.error}`)
      people.push(person)
    }
  }

  const staff = people.filter(person => person.roleType !== 'player')
  const players = []
  const playersByIdentity = new Map()
  people.filter(person => person.roleType === 'player').forEach(person => {
    const existing = person.identityNumber ? playersByIdentity.get(person.identityNumber) : null
    if (!existing) {
      players.push(person)
      if (person.identityNumber) playersByIdentity.set(person.identityNumber, person)
      return
    }
    if (personNameKey(existing.name) !== personNameKey(person.name)) {
      person.error = '重复身份证号对应不同姓名'
      errors.push(`重复身份证号对应“${existing.name}”和“${person.name}”，请核对`)
      players.push(person)
      return
    }
    mergeDuplicatePlayer(existing, person)
    warnings.push(`「${person.name}」在球员栏重复出现，已保留 1 条球员资料`)
  })

  const staffByIdentity = new Map(staff.filter(person => person.identityNumber).map(person => [person.identityNumber, person]))
  function markDualRole(staffPerson, player) {
    if (personNameKey(staffPerson.name) !== personNameKey(player.name)) {
      player.error = '与工作人员身份证相同但姓名不一致'
      errors.push(`「${player.name}」与${staffPerson.roleLabel}身份证相同但姓名不一致`)
      return
    }
    if (!player.jerseyNumber) {
      player.error = '兼任球员需填写球服号码'
      errors.push(`「${player.name}」兼任${staffPerson.roleLabel}，请填写球服号码`)
      return
    }
    const meta = dualRoleMeta(staffPerson)
    staffPerson.jerseyNumber = player.jerseyNumber
    staffPerson.jerseyName = player.jerseyName || generateJerseyName(player.name)
    staffPerson.dualRoleType = meta.type
    staffPerson.dualRoleLabel = meta.staffLabel
    player.dualRoleType = meta.type
    player.dualRoleLabel = meta.staffLabel
    player.dualRolePlayerLabel = meta.playerLabel
    player.eligibilityReviewRequired = true
    warnings.push(`「${player.name}」已按球衣号码识别为${meta.staffLabel}，球员序列保留 1 条`)
  }

  players.forEach(player => {
    const staffPerson = player.identityNumber ? staffByIdentity.get(player.identityNumber) : null
    if (staffPerson) markDualRole(staffPerson, player)
  })
  staff.filter(person => person.jerseyNumber).forEach(staffPerson => {
    const existing = staffPerson.identityNumber ? playersByIdentity.get(staffPerson.identityNumber) : null
    if (existing) return
    const meta = dualRoleMeta(staffPerson)
    const player = {
      ...staffPerson,
      roleType:'player', roleLabel:'球员', phone:'', jerseyName:staffPerson.jerseyName || generateJerseyName(staffPerson.name),
      dualRoleType:meta.type, dualRoleLabel:meta.staffLabel, dualRolePlayerLabel:meta.playerLabel,
      eligibilityReviewRequired:true, linkedStaffIdentityNumber:staffPerson.identityNumber
    }
    staffPerson.dualRoleType = meta.type
    staffPerson.dualRoleLabel = meta.staffLabel
    players.push(player)
    if (player.identityNumber) playersByIdentity.set(player.identityNumber, player)
    warnings.push(`「${player.name}」的工作人员栏填写了球衣号码，已加入球员序列并标记为${meta.staffLabel}`)
  })
  const leader = staff.find(person => person.roleType === 'team_leader')
  if (leader && contactPhone) leader.phone = contactPhone
  if (!teamName) errors.push('未识别到球队名称')
  if (!contactName) warnings.push('未识别到领队姓名')
  if (!/^1[3-9]\d{9}$/.test(contactPhone)) errors.push('未识别到有效的领队手机号')
  if (!players.length) errors.push('未识别到球员资料')
  if (!logoFile && !skipImages) warnings.push('未找到队徽，可在导入前手动上传')

  const jerseyCounts = new Map()
  players.forEach(player => {
    if (!player.jerseyNumber) return
    jerseyCounts.set(player.jerseyNumber, (jerseyCounts.get(player.jerseyNumber) || 0) + 1)
  })
  const duplicateJerseys = Array.from(jerseyCounts.entries()).filter(([, count]) => count > 1).map(([number]) => number)
  if (duplicateJerseys.length) warnings.push(`球服号码重复：${duplicateJerseys.join('、')}`)

  return {
    clientKey: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sourceFile: rawFile,
    sourceFileName: String(rawFile.name || '球队报名表.docx'),
    sourceFileId: '',
    teamName,
    shortName: Array.from(teamName).slice(0, 20).join(''),
    contactName: contactName || leader?.name || '',
    contactPhone,
    logoFile,
    logoFileId: '',
    logoProcessingStatus: logoFile ? 'pending' : 'missing',
    kitColors: kitResult.kitColors,
    kitColorLabels: kitResult.kitColorLabels,
    staff,
    players,
    warnings: uniqueWarnings(warnings),
    errors: uniqueWarnings(errors),
    expanded: true,
    processing: false,
    progressText: '',
    importError: ''
  }
}

export function maskRegistrationIdentity(value) {
  const text = String(value || '')
  return text.length === 18 ? `${text.slice(0, 6)}********${text.slice(-4)}` : (text || '未填写')
}
