const fs = require('fs')
const path = require('path')

const dataPath = path.resolve(__dirname, '../web-admin-vue/src/data/formation-data.json')
const formationData = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const errors = []

for (const [formatLabel, format] of Object.entries(formationData)) {
  const expectedPlayerCount = Number.parseInt(formatLabel, 10)
  if (!Number.isFinite(expectedPlayerCount)) continue

  for (const [formationId, formation] of Object.entries(format.formations || {})) {
    const positions = Array.isArray(formation.positions) ? formation.positions : []
    const goalkeeperCount = positions.filter(position => position.role === 'GK').length
    const outfieldCount = formationId
      .split('-')
      .reduce((total, segment) => total + Number.parseInt(segment, 10), 0)
    const roleCount = new Set(positions.map(position => position.role)).size

    if (positions.length !== expectedPlayerCount) {
      errors.push(`${formatLabel} ${formationId}: 场上位置 ${positions.length} 个，应为 ${expectedPlayerCount} 个`)
    }
    if (outfieldCount !== expectedPlayerCount - 1) {
      errors.push(`${formatLabel} ${formationId}: 阵型名称表示 ${outfieldCount} 名非门将，应为 ${expectedPlayerCount - 1} 名`)
    }
    if (goalkeeperCount !== 1) {
      errors.push(`${formatLabel} ${formationId}: 守门员位置 ${goalkeeperCount} 个，应为 1 个`)
    }
    if (roleCount !== positions.length) {
      errors.push(`${formatLabel} ${formationId}: 存在重复位置标识`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('阵型人数校验通过：所有“几人制”均包含且仅包含 1 名守门员，总位置数与赛制一致。')
