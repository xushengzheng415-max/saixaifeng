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

function digest(key,value){
  if(!key)throw new Error('裁判表识别凭证服务尚未配置')
  return crypto.createHmac('sha256',key).update(value).digest('hex')
}
function signEvidence(key,evidence){return digest(key,canonicalJson(evidence))}
function legacyEvidence(evidence){
  const fields=['matchId','fileId','imageHash','analysisVersion','timing','roleConvention']
  const timingFields=['halfMinutes','totalMinutes','source','needsReview','ruleVersion']
  if(!evidence || typeof evidence!=='object' || Array.isArray(evidence) || Object.keys(evidence).some(key=>!fields.includes(key)))return null
  if(!evidence.timing || typeof evidence.timing!=='object' || Array.isArray(evidence.timing) || Object.keys(evidence.timing).some(key=>!timingFields.includes(key)))return null
  const timing={};for(const key of timingFields)if(Object.hasOwn(evidence.timing,key))timing[key]=evidence.timing[key]
  const value={matchId:evidence.matchId,fileId:evidence.fileId,imageHash:evidence.imageHash,analysisVersion:evidence.analysisVersion,timing}
  if(Object.hasOwn(evidence,'roleConvention'))value.roleConvention=evidence.roleConvention
  return value
}
function verifyEvidence(key,evidence,proof){
  if(!key || !evidence || typeof proof!=='string' || !/^[a-f0-9]{64}$/.test(proof))return false
  try{
    const actual=Buffer.from(proof,'hex'),same=value=>crypto.timingSafeEqual(Buffer.from(digest(key,value),'hex'),actual)
    if(same(canonicalJson(evidence)) || same(JSON.stringify(evidence)))return true
    // Old recognized drafts used the producer's insertion order. Reconstruct only
    // that known schema, including every field; never skip signature verification.
    const legacy=legacyEvidence(evidence)
    return !!legacy && same(JSON.stringify(legacy))
  }catch(error){return false}
}
module.exports = { signImport, signEvidence, verifyEvidence }
