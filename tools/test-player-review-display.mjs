import assert from 'node:assert/strict'
import {organizerPlayerReviewStatus as status,organizerPlayerReviewLabel as label} from '../web-admin-vue/src/utils/playerReviewDisplay.js'
const player={_id:'isolated-player',organizerReviewStatus:'rejected',organizerReviewReason:'照片不清晰'}
assert.equal(status(player,'event',new Set()),'rejected')
assert.equal(status(player,'event',new Set(['isolated-player'])),'approved','formal membership takes precedence')
assert.equal(status({...player,organizerReviewStatus:'approved'},'event',new Set()),'pending','other global approvals do not create event membership')
assert.equal(status({...player,organizerReviewStatus:'approved',source:'registration_docx_import_direct'},'event',new Set()),'approved')
assert.equal(label('rejected'),'已驳回');assert.equal(label('approved'),'已通过');assert.equal(label('pending'),'待审核')
console.log('PASS: event membership, rejected display, imported compatibility and labels')
