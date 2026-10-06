import assert from 'node:assert/strict'
import { parseRegistrationJerseyNumber } from '../web-admin-vue/src/utils/teamRegistrationDocx.js'

assert.equal(parseRegistrationJerseyNumber('8号'), '8')
assert.equal(parseRegistrationJerseyNumber('球服号码：29号'), '29')
assert.equal(parseRegistrationJerseyNumber(' 018 '), '18')
assert.equal(parseRegistrationJerseyNumber(''), '')
assert.equal(parseRegistrationJerseyNumber('未填写'), '')

console.log('team registration jersey number parsing: PASS')
