import assert from 'node:assert/strict'
import { withLinkedStaffPhotos } from '../web-admin-vue/src/utils/rosterPosterData.js'

const staff = [
  { _id: 'coach-1', linkedPlayerId: 'player-1', name: '同名', photoUrl: 'https://example.test/coach.png', _exportPhotoFileId: 'cloud://coach-photo' },
  { _id: 'coach-2', linkedPlayerId: 'player-2', name: '另一人', photoUrl: 'https://example.test/other.png' }
]
const players = [
  { _id: 'player-1', linkedCoachId: 'coach-1', name: '同名', photoUrl: '' },
  { _id: 'player-2', name: '另一人', photoUrl: 'https://example.test/player.png' },
  { _id: 'player-3', name: '同名', photoUrl: '' }
]
const result = withLinkedStaffPhotos(players, staff)
assert.equal(result.length, 3)
assert.equal(result[0].photoUrl, staff[0].photoUrl)
assert.equal(result[0]._exportPhotoFileId, staff[0]._exportPhotoFileId)
assert.equal(result[1].photoUrl, players[1].photoUrl)
assert.equal(result[2].photoUrl, '')
console.log('linked dual-role portraits: passed')
