import assert from 'node:assert/strict'
import { sortPlayerTableRows } from '../web-admin-vue/src/utils/teamPlayerTableSort.js'

const rows = [
  { id:'a', number:11, goals:0, role:'球员' },
  { id:'b', number:null, goals:null, role:'领队兼球员' },
  { id:'c', number:7, goals:2, role:'主教练兼球员' },
  { id:'d', number:8, goals:0, role:'球员' }
]
const value = (row, prop) => row[prop]
assert.deepEqual(sortPlayerTableRows(rows, 'number', 'ascending', value).map(row => row.id), ['c','d','a','b'])
assert.deepEqual(sortPlayerTableRows(rows, 'number', 'descending', value).map(row => row.id), ['a','d','c','b'])
assert.deepEqual(sortPlayerTableRows(rows, 'goals', 'descending', value).map(row => row.id), ['c','a','d','b'])
assert.deepEqual(sortPlayerTableRows(rows, 'goals', 'ascending', value).map(row => row.id), ['a','d','c','b'])
assert.equal(sortPlayerTableRows(rows, '', '', value), rows)
console.log('team player table sort: passed')
