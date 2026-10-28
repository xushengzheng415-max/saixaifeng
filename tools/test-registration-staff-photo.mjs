import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DOMParser,XMLSerializer} from '../web-admin-vue/node_modules/@xmldom/xmldom/lib/index.js'
import JSZip from '../web-admin-vue/node_modules/jszip/lib/index.js'
import {reuseStaffPhotos,photoResult} from '../web-admin-vue/src/utils/registrationPhotoReuse.js'
import {createRegistrationTemplate} from '../web-admin-vue/src/utils/registrationTemplate.js'
import {parseTeamRegistrationDocx} from '../web-admin-vue/src/utils/teamRegistrationDocx.js'
globalThis.DOMParser=DOMParser;globalThis.XMLSerializer=XMLSerializer
const image=new File(['test-photo'],'isolated-photo.png',{type:'image/png'})
for(const roleType of ['team_leader','head_coach','doctor']){
  const staff={name:' 测试 甲 ',roleType,identityNumber:'',birthDate:'',photoFile:null,photoFileId:'',photoProcessingStatus:'missing'}
  const player={name:'测试甲',roleType:'player',identityNumber:'',birthDate:'1990-01-01',jerseyNumber:'7',photoFile:image,photoProcessingStatus:'pending'}
  assert.equal(reuseStaffPhotos([staff],[player]).length,1)
  assert.equal(staff.photoFile,image);assert.equal(staff.photoProcessingStatus,'pending')
  assert.equal(staff.roleType,roleType);assert.equal(staff.identityNumber,'');assert.equal(staff.birthDate,'');assert.equal(staff.jerseyNumber,undefined)
}
const base={name:'测试甲',photoFile:null}
for(const [person,candidates] of [
  [{...base,photoFile:image},[{name:'测试甲',photoFile:image}]],
  [base,[{name:'测试甲',photoFile:image},{name:'测试甲',photoFile:null}]],
  [{...base,identityNumberPrefix:'11010119900101'},[{name:'测试甲',photoFile:image,identityNumberPrefix:'11010119900102'}]],
  [{...base,birthDate:'1990-01-01'},[{name:'测试甲',photoFile:image,birthDate:'1991-01-01'}]],
  [{...base,identityNumber:'110101199001010011'},[{name:'测试甲',photoFile:image,identityNumber:'110101199001010022'}]],
  [base,[{name:'测试乙',photoFile:image}]],
  [base,[{name:'测试甲',photoFile:null}]]
])assert.equal(reuseStaffPhotos([person],candidates).length,0)
assert.deepEqual(Object.keys(photoResult({photoFileId:'cloud://isolated',photoProcessingStatus:'processed',identityNumber:'not-copy',name:'not-copy'})).sort(),['photoFileId','photoOriginalFileId','photoProcessingStatus','photoProgressText'].sort())
const source=fs.readFileSync('web-admin-vue/public/templates/team-registration-form-template.docx')
const blob=await createRegistrationTemplate(source,['photo'],{maxPlayers:3})
const zip=await JSZip.loadAsync(await blob.arrayBuffer())
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const xml=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml')
const tables=Array.from(xml.getElementsByTagNameNS(NS,'tbl')),table=tables[1]
const rows=Array.from(table.childNodes).filter(n=>n.localName==='tr')
const text=n=>Array.from(n.getElementsByTagNameNS(NS,'t')).map(n=>n.textContent).join('').trim()
const first=rows.findIndex(row=>text(row).includes('领队')&&text(row).includes('运动员'))
const block=rows.slice(first,rows.findIndex((row,i)=>i>first&&text(row)==='运动员运动员运动员运动员运动员'))
// Staff names and a matching player live in different columns of this real Word block.
const names=['测试甲','测试教练','测试队医','测试甲','测试乙']
for(const row of block){
  const cells=Array.from(row.childNodes).filter(n=>n.localName==='tc')
  cells.forEach((cell,index)=>{
    if(text(cell)==='姓名：'){
      const nodes=Array.from(cell.getElementsByTagNameNS(NS,'t'))
      nodes.forEach((node,i)=>{node.textContent=i===0?'姓名：'+names[index]:''})
    }
    if(index<3)for(const sdt of Array.from(cell.getElementsByTagNameNS(NS,'sdt')))sdt.parentNode.removeChild(sdt)
  })
}
// Replace template upload artwork with a real image fixture, leaving staff controls absent.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')
for(const path of Object.keys(zip.files).filter(name=>name.startsWith('word/media/')&&name.endsWith('.png')))zip.file(path,png)
zip.file('word/document.xml',new XMLSerializer().serializeToString(xml))
const parsed=await parseTeamRegistrationDocx(new File([await zip.generateAsync({type:'uint8array'})],'同表复用照片测试.docx'))
const leader=parsed.staff.find(person=>person.roleType==='team_leader'),player=parsed.players.find(person=>person.name==='测试甲')
assert.ok(player.photoFile);assert.equal(leader.photoFile,player.photoFile)
assert.equal(leader.photoReuseSource,'same_form_player');assert.equal(leader.roleType,'team_leader');assert.equal(leader.dualRoleType,undefined)
assert.ok(!parsed.staff.find(person=>person.roleType==='head_coach').photoFile,'unmatched coach stays an empty upload slot')
assert.ok(!parsed.warnings.includes('「测试甲」未找到照片'))
console.log('PASS: real Word staff/player photo reuse, all three roles, conflicts/duplicates blocked, metadata unchanged, absent photo remains empty')
