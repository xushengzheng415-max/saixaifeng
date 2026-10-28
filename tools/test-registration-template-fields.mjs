import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DOMParser,XMLSerializer} from '../web-admin-vue/node_modules/@xmldom/xmldom/lib/index.js'
import JSZip from '../web-admin-vue/node_modules/jszip/lib/index.js'
import {createRegistrationTemplate,registrationTemplatePlayerLimit} from '../web-admin-vue/src/utils/registrationTemplate.js'
import {parseTeamRegistrationDocx} from '../web-admin-vue/src/utils/teamRegistrationDocx.js'
import fields from '../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs'
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const source=fs.readFileSync('web-admin-vue/public/templates/team-registration-form-template.docx')
assert.equal(registrationTemplatePlayerLimit({rosterLimit:23,maxPlayersPerTeam:50}),23)
assert.equal(registrationTemplatePlayerLimit({maxPlayersPerTeam:18}),18)
assert.equal(registrationTemplatePlayerLimit({maxPlayers:'35'}),35)
assert.equal(registrationTemplatePlayerLimit({}),35)
assert.throws(()=>registrationTemplatePlayerLimit({rosterLimit:2.5}),/人数上限/)
assert.throws(()=>registrationTemplatePlayerLimit({rosterLimit:0}),/人数上限/)
for(const count of [1,2,18,23,35,100])for(const fields of [[],['birthDate','photo','position','jerseyNumber','identityNumber']]){
  const blob=await createRegistrationTemplate(source,fields,{maxPlayers:count,tournamentName:'隔离测试赛事',divisionName:'测试组'})
  const archive=await JSZip.loadAsync(await blob.arrayBuffer())
  const doc=new DOMParser().parseFromString(await archive.file('word/document.xml').async('string'),'application/xml')
  const cellTexts=Array.from(doc.getElementsByTagNameNS(NS,'tc')).map(cell=>Array.from(cell.getElementsByTagNameNS(NS,'t')).map(t=>t.textContent).join('').trim())
  assert.equal(cellTexts.filter(text=>text==='运动员'||text==='球员').length,count,`exactly ${count} player slots`)
  const roleTexts=Array.from(doc.getElementsByTagNameNS(NS,'tr')).flatMap(row=>{
    const cells=Array.from(row.childNodes).filter(node=>node.localName==='tc')
    const values=cells.map(cell=>Array.from(cell.getElementsByTagNameNS(NS,'t')).map(t=>t.textContent).join('').trim())
    return values.length===5&&values.every(text=>/^(运动员|球员|主教练|队医|领队\(联络员\))?$/.test(text))?values:[]
  })
  for(const role of ['领队(联络员)','主教练','队医'])assert.equal(roleTexts.filter(text=>text===role).length,1)
  assert.equal(cellTexts.filter(text=>text==='姓名：').length,count+3)
  const tags=Array.from(doc.getElementsByTagNameNS(NS,'tag')).map(tag=>tag.getAttributeNS(NS,'val'))
  assert.equal(tags.filter(tag=>tag.startsWith('sxf-photo-')).length,fields.includes('photo')?count+3:0)
  assert.equal(tags.filter(tag=>tag.startsWith('sxf-position-')).length,fields.includes('position')?count+3:0)
  assert.equal(tags.length,new Set(tags).size,'native controls have distinct tags')
  const ids=Array.from(doc.getElementsByTagNameNS(NS,'id')).map(id=>id.getAttributeNS(NS,'val'))
  assert.equal(ids.length,new Set(ids).size,'native controls have distinct IDs')
  if(process.env.REGISTRATION_TEMPLATE_QA_DIR&&count===23&&fields.length){
    fs.mkdirSync(process.env.REGISTRATION_TEMPLATE_QA_DIR,{recursive:true})
    fs.writeFileSync(`${process.env.REGISTRATION_TEMPLATE_QA_DIR}/registration-23.docx`,Buffer.from(await blob.arrayBuffer()))
  }
}
await assert.rejects(createRegistrationTemplate(source,[],{maxPlayers:1.5}),/人数上限/)
const minimal=await createRegistrationTemplate(source,['birthDate','jerseyNumber','position'])
const zip=await JSZip.loadAsync(await minimal.arrayBuffer())
const xml=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml')
const text=Array.from(xml.getElementsByTagNameNS(NS,'t')).map(node=>node.textContent).join('')
assert.equal(text.includes('立洋杯'),false)
assert.equal(text.includes('身份证：'),false)
assert.ok(text.includes('出生日期：')&&text.includes('位置：'))
assert.equal(xml.getElementsByTagNameNS(NS,'picture').length,0)
const full=await JSZip.loadAsync(source)
const filled=new DOMParser().parseFromString(await full.file('word/document.xml').async('string'),'application/xml')
let named=false,born=false,positioned=false
for(const cell of Array.from(filled.getElementsByTagNameNS(NS,'tc'))){const nodes=Array.from(cell.getElementsByTagNameNS(NS,'t'));if(nodes.map(n=>n.textContent).join('').trim()==='姓名：'){nodes.forEach((node,index)=>{node.textContent=index===0?'姓名：模拟人员':''})}}
for(const node of Array.from(filled.getElementsByTagNameNS(NS,'t'))){
  if(!named&&node.textContent==='姓名：'){node.textContent='姓名：模拟领队';named=true}
  else if(node.textContent==='姓名：'&&named){node.textContent='姓名：模拟球员';named=false}
  if(!born&&node.textContent==='出生日期：'){node.textContent='出生日期：2014-03-08';born=true}
  if(!positioned&&node.textContent==='请选择'){node.textContent='门将';positioned=true}
}
full.file('word/document.xml',new XMLSerializer().serializeToString(filled))
const filledBytes=await full.generateAsync({type:'uint8array'})
const parsed=await parseTeamRegistrationDocx(new File([filledBytes],'模拟报名表.docx'))
const people=[...(parsed.staff||[]),...(parsed.players||[])]
assert.ok(people.some(person=>person.birthDate==='2014-03-08'&&person.position==='门将'))
assert.ok(people.every(person=>!person.photoFile),'native placeholders must not become real photos')
assert.equal(parsed.logoFile,null)
assert.equal(fields.supplementImportedIdentity({identityNumber:'',birthDate:'',gender:''},{birthDate:'2014-03-08',position:'后卫'}).identityIncomplete,true)
assert.throws(()=>fields.supplementImportedIdentity({identityNumber:'',birthDate:''},{birthDate:'2014-02-30'}),/出生日期无效/)
assert.throws(()=>fields.supplementImportedIdentity({identityNumber:'provided',birthDate:'2014-03-08'},{birthDate:'2014-03-09'}),/不一致/)
console.log('PASS: selectable fields, generic branding, Word image controls ignored when empty, birth and position parsed, missing identity retained as draft, invalid dates rejected')
