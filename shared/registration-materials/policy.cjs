'use strict'
const KEYS = ['identityFrontRequired','identityBackRequired','faceComparisonRequired','portraitRequired','insuranceProofRequired']
const boolean = value => value === true || value === 1 || ['true','1','yes','required'].includes(String(value || '').toLowerCase())
function normalize(input = {}) {
  const result = { version:1, identityNumberRequired:true }
  for (const key of KEYS) result[key] = boolean(input[key])
  if ((result.identityBackRequired || result.faceComparisonRequired) && !result.identityFrontRequired) throw new Error('国徽面或照片比对需要同时提交证件人像面')
  return result
}
function resolve(sources = [], defaults = {}) {
  for (const source of sources) if (source?.registrationMaterials) return { ...normalize(source.registrationMaterials), configured:true }
  function read(names, fallback = false) { for (const source of sources) for (const name of names) if (source && source[name] !== undefined && source[name] !== null && source[name] !== '') return boolean(source[name]); return fallback }
  const identity = read(['identityVerificationRequired','requiresRealName','requireRealName'], defaults.identity === true)
  return { version:1, configured:false, identityNumberRequired:true, identityFrontRequired:identity, identityBackRequired:identity, faceComparisonRequired:identity, portraitRequired:read(['portraitRequired','requiresPortrait','requirePortrait'],defaults.portrait===true), insuranceProofRequired:false, legacyInsuranceRequired:read(['insuranceRequired']) }
}
function fields(input) {
  const policy=normalize(input)
  return {registrationMaterials:policy,identityVerificationRequired:policy.identityFrontRequired || policy.faceComparisonRequired,identityDocumentRequired:policy.identityFrontRequired || policy.identityBackRequired,portraitRequired:policy.portraitRequired,insuranceRequired:policy.insuranceProofRequired}
}
module.exports = { KEYS, normalize, resolve, fields }
