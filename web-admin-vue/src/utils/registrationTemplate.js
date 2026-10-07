export const REGISTRATION_FIELDS = [{key:'birthDate',label:'出生日期'},{key:'identityNumber',label:'身份证号'},{key:'jerseyNumber',label:'球服号码'},{key:'position',label:'位置'},{key:'photo',label:'人员照片'},{key:'teamLogo',label:'队徽'}]
export const REGISTRATION_PRESETS = { youth:['birthDate','jerseyNumber','position','photo','teamLogo'], adult:['identityNumber','jerseyNumber','position','photo','teamLogo'] }
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export async function createRegistrationTemplate(arrayBuffer, fields) {
  const allowed=new Set(fields)
  const JSZip=(await import('jszip')).default
  const zip=await JSZip.loadAsync(arrayBuffer)
  const xml=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml')
  for(const row of Array.from(xml.getElementsByTagNameNS(NS,'tr'))){
    const text=Array.from(row.getElementsByTagNameNS(NS,'t')).map(node=>node.textContent).join('')
    const tags=Array.from(row.getElementsByTagNameNS(NS,'tag')).map(node=>node.getAttributeNS(NS,'val')||'')
    const field=/身份证[：:]/.test(text)?'identityNumber':/出生日期[：:]/.test(text)?'birthDate':/球服号码[：:]/.test(text)?'jerseyNumber':/^位置[：:]/.test(text)?'position':tags.some(tag=>tag.startsWith('sxf-photo-'))?'photo':''
    if(field&&!allowed.has(field))row.parentNode.removeChild(row)
  }
  if(!allowed.has('teamLogo'))for(const sdt of Array.from(xml.getElementsByTagNameNS(NS,'sdt'))){
    if(Array.from(sdt.getElementsByTagNameNS(NS,'tag')).some(tag=>tag.getAttributeNS(NS,'val')==='sxf-logo'))sdt.parentNode.removeChild(sdt)
  }
  // Keep each person block together even when the last optional field is removed.
  const rows=Array.from(xml.getElementsByTagNameNS(NS,'tr'))
  const roleRow=row=>{const cells=Array.from(row.childNodes).filter(node=>node.localName==='tc');return cells.length===5&&cells.every(cell=>/^(运动员|球员|主教练|队医|领队[（(]联络员[）)])$/.test(Array.from(cell.getElementsByTagNameNS(NS,'t')).map(node=>node.textContent).join('').replace(/\s/g,'')))}
  const starts=rows.map((row,index)=>roleRow(row)?index:-1).filter(index=>index>=0)
  starts.forEach((start,index)=>{
    const end=index+1<starts.length?starts[index+1]:rows.length
    for(let offset=start;offset<end;offset++)for(const p of Array.from(rows[offset].getElementsByTagNameNS(NS,'p'))){
      let pr=Array.from(p.childNodes).find(node=>node.localName==='pPr')
      if(!pr){pr=xml.createElementNS(NS,'w:pPr');p.insertBefore(pr,p.firstChild)}
      for(const existing of Array.from(pr.getElementsByTagNameNS(NS,'keepNext')))pr.removeChild(existing)
      const keep=xml.createElementNS(NS,'w:keepNext');keep.setAttributeNS(NS,'w:val',offset===end-1?'0':'1');pr.appendChild(keep)
    }
  })
  zip.file('word/document.xml',new XMLSerializer().serializeToString(xml))
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
}
