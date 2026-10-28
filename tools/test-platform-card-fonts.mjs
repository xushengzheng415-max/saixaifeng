import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { localizeCardFonts, translateCardErrors } from '../platform-admin-vue/src/utils/playerCardFonts.js'
const manifest = JSON.parse(fs.readFileSync(new URL('../cloudfunctions/webLoginApi/player-card-font-manifest.json', import.meta.url)))
const fonts = manifest.filter(row => /\.(otf|ttf)$/.test(row.name))
const payload = { cards: [{ cardScene: { fonts }, imageUrl: 'https://history/image.png' }] }
localizeCardFonts(payload, 'https://pingtai.sxffootball.cn')
for (const font of payload.cards[0].cardScene.fonts) {
  assert.equal(font.url, `https://pingtai.sxffootball.cn/fonts/player-card/${font.name}`)
  const bytes = fs.readFileSync(new URL(`../platform-admin-vue/public/fonts/player-card/${font.name}`, import.meta.url))
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), font.sha256)
}
assert.equal(payload.cards[0].imageUrl, 'https://history/image.png')
assert.equal(translateCardErrors({cards:[{cardError:'A network error occurred.'}]}).cards[0].cardError, '字体加载失败，请重试预览')
console.log(`PASS: nested card fonts use independent platform origin; all ${fonts.length} asset digests match; failed font load has actionable message`)
