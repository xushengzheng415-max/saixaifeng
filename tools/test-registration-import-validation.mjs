import assert from 'node:assert/strict'
import {registrationImportIssues as issues,ignoredIdentityFields} from '../web-admin-vue/src/utils/registrationImportValidation.js'
const player=()=>({name:'隔离球员',identityNumber:'',identityIncomplete:true,ignoredIdentityIssue:true,photoIgnored:true,birthDate:'1998-06-03'})
const team=()=>({teamName:'隔离测试队',contactName:'测试领队',contactPhone:'13800000000',players:[player()],staff:[],errors:['未识别到有效的领队手机号','「隔离球员」证件号格式或出生日期不正确']})
assert.deepEqual(issues(team()),[],'ignored personal issues and corrected leader phone must not leave parser blockers')
const missing=team();missing.players[0].name='';assert.match(issues(missing)[0].message,/请填写姓名/)
const duplicate=team();duplicate.players=[{...player(),identityNumber:'QA0012345',documentType:'passport'},{...player(),name:'另一测试球员',identityNumber:'QA0012345',documentType:'passport'}];duplicate.errors=['重复身份证号对应“隔离球员”和“另一测试球员”，请核对'];assert.equal(issues(duplicate).filter(i=>i.code==='duplicate').length,1)
duplicate.players[1].identityNumber='QA0067890';assert.deepEqual(issues(duplicate),[],'correcting duplicate must remove old quote-style parser message')
const capacity=team();capacity.players=Array.from({length:35},(_,i)=>({...player(),name:'隔离球员'+i}));assert.deepEqual(issues(capacity,35),[]);assert.match(issues(capacity,34)[0].message,/35人.*34人/)
const coach=team();coach.staff=[{name:'测试教练',roleType:'head_coach',phone:'bad'}];assert.match(issues(coach)[0].message,/主教练手机号/)
const invalid=team();invalid.players[0].birthDate='2025-02-30';assert.match(issues(invalid)[0].message,/出生日期无效/)
const dual=team();dual.staff=[{...player(),name:'同一测试人员',roleType:'head_coach',identityNumber:'QA0012345',documentType:'passport'}];dual.players=[{...dual.staff[0],roleType:'player',jerseyNumber:'9'}];assert.deepEqual(issues(dual),[])
console.log('PASS: current-field blockers, stale parser errors, ignored issues, required names, duplicate correction, dual roles, 35-player capacity and coach phone')

assert.equal(ignoredIdentityFields({birthDate:'2025-02-30',gender:'male'}).birthDate,'')
assert.equal(ignoredIdentityFields({birthDate:'1998-06-03',gender:'unknown'}).gender,'')
