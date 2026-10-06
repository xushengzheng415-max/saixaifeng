const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync('cloudfunctions/manageTournamentCenterContent/index.js', 'utf8')
const requestedBatches = []
const cloud = {
  SYMBOL_CURRENT_ENV: 'test',
  init() {},
  async getTempFileURL({ fileList }) {
    requestedBatches.push(fileList)
    return {
      fileList: fileList
        .filter(fileID => fileID !== 'cloud://test/missing.png')
        .map(fileID => ({ fileID, tempFileURL: `https://images.example.test/${fileID.split('/').pop()}?fresh=1` }))
    }
  }
}
const context = {
  require(name) {
    if (name === 'wx-server-sdk') return cloud
    return require(name)
  },
  module: { exports: {} },
  console,
  process
}
context.exports = context.module.exports
vm.runInNewContext(source + '\nmodule.exports.getOverviewForTest = getOverview', context, {
  filename: 'manageTournamentCenterContent/index.js'
})

const rows = [
  { _id: 'word-import', name: 'Word 导入球队', logo: 'https://old.example.test/expired.png', logoUrl: 'https://old.example.test/expired.png', logoFileID: 'cloud://test/word.png' },
  { _id: 'cloud-logo', name: '云文件球队', logo: 'cloud://test/direct.png' },
  { _id: 'missing-file', name: '文件已失效球队', logo: 'https://old.example.test/expired2.png', logoFileID: 'cloud://test/missing.png' },
  { _id: 'public-logo', name: '公开图片球队', logo: 'https://images.example.test/permanent.png' }
]
const db = {
  collection(name) {
    return {
      skip() { return this },
      limit() { return this },
      async get() { return { data: name === 'teams' ? rows : [] } }
    }
  }
}

context.module.exports.getOverviewForTest(db).then(result => {
  assert.equal(result.success, true)
  const teams = new Map(result.data.teams.map(team => [team._id, team]))
  assert.equal(teams.get('word-import').logo, 'https://images.example.test/word.png?fresh=1')
  assert.equal(teams.get('cloud-logo').logo, 'https://images.example.test/direct.png?fresh=1')
  assert.equal(teams.get('missing-file').logo, '')
  assert.equal(teams.get('missing-file').logoUnavailable, true)
  assert.equal(teams.get('public-logo').logo, 'https://images.example.test/permanent.png')
  assert.equal(requestedBatches.length, 1)
  assert.equal(requestedBatches[0].length, 3)
  console.log('PASS: 平台长期球队队徽按云文件 ID 刷新，失败时不使用过期地址')
}).catch(error => { console.error(error); process.exitCode = 1 })
