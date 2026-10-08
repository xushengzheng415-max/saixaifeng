const crypto = require('crypto')

// Function transports may reorder object keys. Sign the JSON values, not key insertion order.
function canonicalJson(value) {
  const wireValue = JSON.parse(JSON.stringify(value))
  function encode(node) {
    if (node === null || typeof node !== 'object') return JSON.stringify(node)
    if (Array.isArray(node)) return '[' + node.map(encode).join(',') + ']'
    return '{' + Object.keys(node).sort().map(key => JSON.stringify(key) + ':' + encode(node[key])).join(',') + '}'
  }
  return encode(wireValue)
}

function signImport(key, matchId, revision, data) {
  if (!key) throw new Error('裁判表保存服务尚未配置')
  return crypto.createHmac('sha256', key)
    .update(canonicalJson([String(matchId), Number(revision), data]))
    .digest('hex')
}

module.exports = { signImport }
