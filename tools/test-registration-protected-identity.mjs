import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DOMParser,XMLSerializer} from '../web-admin-vue/node_modules/@xmldom/xmldom/lib/index.js'
import JSZip from '../web-admin-vue/node_modules/jszip/lib/index.js'
import {createRegistrationTemplate} from '../web-admin-vue/src/utils/registrationTemplate.js'
import {parseRegistrationIdentity,parseTeamRegistrationDocx,maskRegistrationIdentity} from '../web-admin-vue/src/utils/teamRegistrationDocx.js'
import fields from '../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs'
import dualRole from '../cloudfunctions/tournamentRegistrationFlow/importDualRole.js'
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer
const prefix='11010119900101'
for(const input of [prefix,prefix+'****',prefix+'XXXX',prefix+'12',prefix+'1***','110101********1234']){
  const result=parseRegistrationIdentity(input)
  assert.equal(result.valid,true,input);assert.equal(result.isPartial,true,input)
  assert.equal(result.gender,'','protected identifiers must not imply gender')
  assert.equal(result.birthDate,input.startsWith(prefix)?'1990-01-01':'')
  assert.ok(result.nativePlace.includes('北京'))
}
for(const input of ['11010119900230','11010119901301****','11010119900101typo','19900101','110101199001010000999'])assert.equal(parseRegistrationIdentity(input).valid,false,input)
assert.equal(parseRegistrationIdentity('110101199001010011').isPartial,false)
assert.equal(parseRegistrationIdentity('110101199001010011').gender,'male')
assert.equal(maskRegistrationIdentity(prefix),'110101********（保护）')
const source=fs.readFileSync('web-admin-vue/public/templates/team-registration-form-template.docx')
const template=await createRegistrationTemplate(source,['identityNumber'],{maxPlayers:3})
const zip=await JSZip.loadAsync(await template.arrayBuffer())
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const doc=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml')
let number=0
for(const cell of Array.from(doc.getElementsByTagNameNS(NS,'tc'))){
  const nodes=Array.from(cell.getElementsByTagNameNS(NS,'t')),text=nodes.map(node=>node.textContent).join('').trim()
  if(text==='姓名：')nodes.forEach((node,index)=>{node.textContent=index===0?`姓名：隔离测试人员${++number}`:''})
  if(text.startsWith('身份证：'))nodes.forEach((node,index)=>{node.textContent=index===0?'身份证：'+prefix:''})
}
zip.file('word/document.xml',new XMLSerializer().serializeToString(doc))
const parsed=await parseTeamRegistrationDocx(new File([await zip.generateAsync({type:'uint8array'})],'保护号码测试.docx'))
assert.equal(parsed.players.length,3,'same prefix must not merge distinct players')
assert.equal(parsed.staff.length,3,'same prefix must not link staff to players')
for(const person of [...parsed.players,...parsed.staff]){
  assert.ok(!person.error,person.error);assert.equal(person.identityNumber,'')
  assert.equal(person.identityNumberPrefix,prefix);assert.equal(person.birthDate,'1990-01-01')
  assert.equal(person.gender,'');assert.ok(!person.dualRoleType)
  const server=fields.supplementImportedIdentity({identityNumber:'',birthDate:'',gender:''},person)
  assert.equal(server.identityIncomplete,true,'existing backend retains pending identity status')
  assert.equal(server.birthDate,'1990-01-01')
}
assert.equal(dualRole.dedupeImportedPlayerRows(parsed.players,'隔离测试队').rows.length,3)
console.log('PASS: protected prefixes derive only visible birth/region, malformed dates rejected, three same-prefix players remain separate, existing backend keeps identities pending')
