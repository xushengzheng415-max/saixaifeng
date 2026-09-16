import assert from 'node:assert/strict'
import {
  findRegistrationPersonBlocks,
  registrationCellsForPeople
} from '../web-admin-vue/src/utils/teamRegistrationDocx.js'

const cell = (column, text, span = 1) => ({ column, span, text, imageIds: [] })
const row = cells => ({ cells })

// 角色行第二人因为旧模板网格合并从 column=2 开始，而号码行仍是连续 0..4。
// 旧逻辑按 column 读取会把第二人的 17 号错取成第三人的 27 号。
const roleRow = row([
  cell(0, '运动员'), cell(2, '运动员'), cell(3, '运动员'), cell(4, '运动员'), cell(5, '运动员')
])
const rows = [
  roleRow,
  row([cell(0, ''), cell(1, ''), cell(2, ''), cell(3, ''), cell(4, '')]),
  row([cell(0, '姓名：杨冠华'), cell(1, '姓名：杨森'), cell(2, '姓名：窦逸扬'), cell(3, '姓名：沈子涵'), cell(4, '姓名：武锦杰')]),
  row([cell(0, '身份证：370302200801080813'), cell(1, '身份证：410211200310310059'), cell(2, '身份证：410224200401163914'), cell(3, '身份证：340603200411260410'), cell(4, '身份证：410203200311290010')]),
  // 模拟分页后表格拆分产生的空白行；号码行不再固定是“姓名行 +2”。
  row([]),
  row([]),
  row([cell(0, '球服号码：3'), cell(1, '球服号码：17'), cell(2, '球服号码：27'), cell(3, '球服号码：23'), cell(4, '球服号码：1')]),
  row([cell(0, '运动员')]),
  row([cell(0, '')]),
  row([cell(0, '姓名：下一位')]),
  row([cell(0, '身份证：410203200001010019')]),
  row([cell(0, '球服号码：51')])
]

const blocks = findRegistrationPersonBlocks(rows)
assert.equal(blocks.length, 2)
assert.equal(blocks[0].numberRow.cells[1].text, '球服号码：17')

const mappedNumbers = registrationCellsForPeople(blocks[0].numberRow, blocks[0].roleRow.cells, /球服号码|球衣号码|球员号码|号码/)
assert.deepEqual(mappedNumbers.map(item => item.text), [
  '球服号码：3', '球服号码：17', '球服号码：27', '球服号码：23', '球服号码：1'
])
assert.equal(blocks[1].numberRow.cells[0].text, '球服号码：51')

console.log('team registration cross-page jersey row: PASS')
