const assert=require('node:assert/strict'),crypto=require('node:crypto')
const proof=require('../cloudfunctions/webLoginApi/paperReportProof.cjs')
const key='isolated-referee-evidence-key'
function reorder(value){if(value===null || typeof value!=='object')return value;if(Array.isArray(value))return value.map(reorder);return Object.fromEntries(Object.keys(value).sort().reverse().map(name=>[name,reorder(value[name])]))}
const evidence={matchId:'isolated-match',fileId:'cloud://isolated.bucket/match-reports/isolated-match/photo.jpg',imageHash:'a'.repeat(64),analysisVersion:'referee-report-analysis/6',timing:{halfMinutes:30,totalMinutes:60,source:'division_settings',needsReview:false,ruleVersion:'rules-1'},roleConvention:'tick_starter_blank_bench'}
const legacy=crypto.createHmac('sha256',key).update(JSON.stringify(evidence)).digest('hex'),wire=reorder(evidence)
assert.notEqual(crypto.createHmac('sha256',key).update(JSON.stringify(wire)).digest('hex'),legacy)
assert.equal(proof.verifyEvidence(key,wire,legacy),true,'existing reordered draft accepted')
assert.equal(proof.verifyEvidence(key,evidence,legacy),true,'unreordered legacy PC accepted')
const current=proof.signEvidence(key,evidence);assert.equal(proof.signEvidence(key,wire),current);assert.equal(proof.verifyEvidence(key,wire,current),true)
for(const field of ['matchId','fileId','imageHash','analysisVersion','roleConvention'])assert.equal(proof.verifyEvidence(key,{...wire,[field]:'tampered'},legacy),false,field)
for(const field of Object.keys(evidence.timing))assert.equal(proof.verifyEvidence(key,{...wire,timing:{...wire.timing,[field]:'tampered'}},legacy),false,'timing '+field)
assert.equal(proof.verifyEvidence(key,{...wire,ignored:'unsigned'},legacy),false)
assert.equal(proof.verifyEvidence(key,{...wire,timing:{...wire.timing,ignored:'unsigned'}},legacy),false)
assert.equal(proof.verifyEvidence('wrong-key',wire,legacy),false);assert.equal(proof.verifyEvidence('',wire,legacy),false);assert.equal(proof.verifyEvidence(key,wire,'a'.repeat(63)),false)
assert.throws(()=>proof.signEvidence('',wire),/尚未配置/)
const snapshot={...evidence,timing:{halfMinutes:30,totalMinutes:60,source:'match_snapshot',needsReview:false}};delete snapshot.roleConvention
const oldSnapshot=crypto.createHmac('sha256',key).update(JSON.stringify(snapshot)).digest('hex');assert.equal(proof.verifyEvidence(key,reorder(snapshot),oldSnapshot),true)
console.log('PASS: 新凭证不受深层字段顺序影响，已有PC/手机旧凭证安全兼容，球队/文件/图摘要/版本/规则篡改与未知附加字段拒绝，无签名密钥拒绝；仅隔离数据')
