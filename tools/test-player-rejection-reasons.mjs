import assert from 'node:assert/strict'
import {PLAYER_REJECTION_REASONS as options,playerRejectionReason as reason} from '../web-admin-vue/src/utils/playerRejectionReasons.js'
assert.equal(reason([]),'');assert.equal(reason(['other'],'  '),'');assert.equal(reason(['unknown']),'')
assert.equal(reason(['photo_missing','identity_invalid']),'未上传球员照片，请补传；证件号码有误，请核对原件后更正')
assert.equal(reason(['photo_missing','other'],'  号码需与报名表一致  '),'未上传球员照片，请补传；号码需与报名表一致')
assert.equal(reason(['photo_missing','photo_missing']),'未上传球员照片，请补传')
assert(reason(options.map(item=>item.value),'补'.repeat(100)).length<=500)
assert.equal(reason(['other'],'补'.repeat(501)),'')
console.log('PASS: multiple reasons, other required, stable dedupe, no unknown choices and backend 500-character contract')
