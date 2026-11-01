import assert from 'node:assert/strict'
import {PLAYER_REJECTION_REASONS as options,playerRejectionReason as reason} from '../web-admin-vue/src/utils/playerRejectionReasons.js'
assert.equal(reason([]),'');assert.equal(reason(['other'],'  '),'');assert.equal(reason(['unknown']),'')
assert.equal(reason(['photo','identity']),'请补充或更换清晰的球员照片；请补齐或核对证件信息')
assert.equal(reason(['photo','other'],'  号码需与报名表一致  '),'请补充或更换清晰的球员照片；号码需与报名表一致')
assert.equal(reason(['photo','photo']),'请补充或更换清晰的球员照片')
assert(reason(options.map(item=>item.value),'补'.repeat(100)).length<=200)
assert.equal(reason(['other'],'补'.repeat(201)),'')
console.log('PASS: multiple reasons, other required, stable dedupe, no unknown choices and backend 200-character contract')
