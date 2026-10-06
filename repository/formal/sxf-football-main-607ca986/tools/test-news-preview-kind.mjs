import assert from 'node:assert/strict'
import { newsKindForMatch } from '../web-admin-vue/src/utils/newsPreviewKind.js'

assert.equal(newsKindForMatch({ resultStatus: 'approved', matchDate: '2026-09-26' }), 'match')
assert.equal(newsKindForMatch({ resultStatus: 'pending_review' }), 'flash')
assert.equal(newsKindForMatch({ resultStatus: 'not_submitted' }), 'flash')
assert.equal(newsKindForMatch(null), 'flash')
console.log('news preview match type: passed')
