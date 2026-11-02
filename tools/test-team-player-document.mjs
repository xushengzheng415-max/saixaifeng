import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {playerDocumentForm,preparePlayerDocument} from '../web-admin-vue/src/utils/teamPlayerDocument.js'
const old={_id:'isolated',playerId:'stable-player-code',documentType:'passport',idCard:'AB1234567',identityDigest:'stored-digest',name:'隔离队员',gender:'male',birthDate:'2000-01-01'}
const form={...old,idCard:'CD7654321',jerseyNumber:9,position:'MF',photoUrl:'cloud://isolated/photo',nativePlace:'',nationality:'中国'}
assert.equal(playerDocumentForm(old).documentType,'passport')
assert.equal(playerDocumentForm({idCard:'11010120000101001X'}).documentType,'resident_id')
assert.equal(playerDocumentForm({idCard:'AB12****67',documentType:'passport'}).idCard,'')
let patch=preparePlayerDocument(form,old)
assert.equal(patch.idCard,'CD7654321');assert.equal(patch.documentType,'passport');assert.equal(patch.identityDigest,'');assert.equal(patch.identityVerified,false)
patch=preparePlayerDocument({...form,idCard:''},old);assert(patch.keepStoredIdentity);assert(!Object.hasOwn(patch,'identityDigest'))
assert.throws(()=>preparePlayerDocument({...form,documentType:'resident_id'},old),/身份证/)
assert.throws(()=>preparePlayerDocument({...form,idCard:'****'},old),/护照/)
assert.throws(()=>preparePlayerDocument({...form,documentType:'resident_id',idCard:''},old),/请输入身份证/)
assert.throws(()=>preparePlayerDocument({...form,birthDate:'2000-99-99',idCard:''},old),/出生日期/)
const source=fs.readFileSync('web-admin-vue/src/views/team/TeamDetail.vue','utf8')
const start=source.indexOf('async function submitPlayer()'),end=source.indexOf('\nfunction openAddPlayer()',start),calls=[],warnings=[]
const value=v=>({value:v})
const context={preparePlayerDocument,playerForm:value(form),isEditingPlayer:value(true),editingPlayerOriginal:value(old),editingPlayerId:value('isolated'),teamId:'team',team:value({name:'隔离球队'}),submitting:value(false),showAddPlayer:value(true),isTournamentStaff:true,generatePlayerId:()=> 'must-not-replace-stable-id',queryList:async()=>[],updateRecord:async(...args)=>calls.push(args),ElMessage:{warning:x=>warnings.push(x),error:x=>warnings.push(x),success(){}},loadPlayers:()=>{},console}
vm.createContext(context);vm.runInContext(source.slice(start,end)+'\n;globalThis.submit=submitPlayer',context)
await context.submit();assert.equal(calls.length,1);assert.equal(calls[0][0],'players');assert.equal(calls[0][1],'isolated');assert.equal(calls[0][2].documentType,'passport');assert.equal(calls[0][2].idCard,'CD7654321');assert(!Object.hasOwn(calls[0][2],'playerId'));assert(!Object.hasOwn(calls[0][2],'keepStoredIdentity'))
context.showAddPlayer.value=true;context.playerForm.value={...form,idCard:''};await context.submit();assert.equal(calls.length,2);assert(!Object.hasOwn(calls[1][2],'idCard'));assert(!Object.hasOwn(calls[1][2],'idNumber'))
context.playerForm.value={...form,documentType:'resident_id'};await context.submit();assert.equal(calls.length,2);assert(warnings.some(x=>x.includes('身份证')))
context.isEditingPlayer.value=false;context.playerForm.value={...form};context.addRecord=async(...args)=>calls.push(args);await context.submit();assert.equal(calls.length,3);assert.equal(calls[2][0],'players');assert.equal(calls[2][1].documentType,'passport');assert.equal(calls[2][1].idCard,'CD7654321')
assert.equal((source.match(/label="证件类型" required/g)||[]).length,2,'both create and edit entrances must include the selector')
console.log('PASS: document type/number load, passport validation and save, masked identity preservation, type-switch validation, stale verification reset, and actual edit handler keeps stable player ID; no production writes')
