import assert from 'node:assert/strict'
import { legacyProjectTiles, nextMaterialStep } from '../platform-admin-vue/src/utils/playerCardProjectTiles.js'

const classic = ['bronze', 'silver', 'gold'].map((tier, index) => ({ id: String(index), tier, title: `经典${['铜', '银', '金'][index]}卡`, preload: { type: 'platform' }, backgroundUrl: `image-${tier}` }))
const tournament = { id: 'event', tier: 'bronze', title: '立洋杯', preload: { type: 'tournament', targetId: 'event1' }, backgroundUrl: 'event-bronze' }
const original = JSON.stringify([...classic, tournament])
const tiles = legacyProjectTiles([...classic, tournament])
assert.equal(tiles.length, 2)
assert.deepEqual(tiles[0].importTemplateIds, ['0', '1', '2'])
assert.equal(tiles[0].styles.filter(x => x.backgroundUrl).length, 3)
assert.deepEqual(tiles[1].importTemplateIds, ['event'])
assert.equal(nextMaterialStep(tiles[1].styles), '待补银卡、金卡背景')
assert.equal(JSON.stringify([...classic, tournament]), original)
assert.equal(legacyProjectTiles([...classic, { ...classic[0], id: 'duplicate' }]).length, 4, 'ambiguous tiers must stay separate')
assert.equal(legacyProjectTiles(classic.map((x, i) => ({ ...x, preload: { type: 'tournament', targetId: String(i) } }))).length, 3, 'never join different scopes')
assert.equal(legacyProjectTiles([{ ...tournament, preload: { type: 'team', targetId: 'team' } }])[0].styles[0].key, 'single')
assert.equal(legacyProjectTiles(classic.map(x => ({ ...x, preload: { type: 'team', targetId: 'team' } }))).length, 3, 'honor singles stay independent')
console.log('PASS: visual suite grouping preserves originals, scope boundaries and ambiguous alternatives; missing tiers have an explicit next step')
