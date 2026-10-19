import {KIT_COLOR_OPTIONS} from './registrationKitColors.js'
export const REGISTRATION_FIELDS = [{key:'birthDate',label:'出生日期'},{key:'identityNumber',label:'身份证号'},{key:'jerseyNumber',label:'球服号码'},{key:'position',label:'位置'},{key:'photo',label:'人员照片'},{key:'teamLogo',label:'队徽'}]
export const REGISTRATION_PRESETS = { youth:['birthDate','jerseyNumber','position','photo','teamLogo'], adult:['identityNumber','jerseyNumber','position','photo','teamLogo'] }
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export async function createRegistrationTemplate(arrayBuffer, fields, context = {}) {
  const allowed=new Set(fields)
  const JSZip=(await import('jszip')).default
  const zip=await JSZip.loadAsync(arrayBuffer)
  const xml=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml')
  // Native Word drop-downs use the same labels and values as the kit library.
  const el = name => xml.createElementNS(NS, 'w:' + name)
  const attr = (node,name,value) => node.setAttributeNS(NS,'w:'+name,String(value))
  const textOf = node => Array.from(node.getElementsByTagNameNS(NS,'t')).map(n=>n.textContent||'').join('')
  const body=xml.getElementsByTagNameNS(NS,'body')[0]
  const header=Array.from(body.childNodes).find(node=>node.localName==='p'&&/赛事名称[：:]/.test(textOf(node)))
  if(header){
    const properties=Array.from(header.childNodes).find(node=>node.localName==='pPr')
    for(const child of Array.from(header.childNodes))if(child!==properties)header.removeChild(child)
    const run=el('r'),text=el('t')
    text.textContent=`赛事名称：${String(context.tournamentName||'').trim()||'____________________'}    竞赛组别：${String(context.divisionName||'').trim()||'____________________'}`
    text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');run.appendChild(text);header.appendChild(run)
  }
  const tables=Array.from(xml.getElementsByTagNameNS(NS,'tbl'))
  const table=tables.find(node=>/运动员服装/.test(textOf(node))&&/守门员服装/.test(textOf(node)))
  if(table){
    const rows=Array.from(table.childNodes).filter(node=>node.localName==='tr')
    for(const [setIndex,row]of rows.entries()){
      const cells=Array.from(row.childNodes).filter(node=>node.localName==='tc')
      const marker=cells.findIndex(cell=>/^[AB]$/.test(textOf(cell).trim()))
      if(marker<0)continue
      const set=textOf(cells[marker]).trim()
      cells.slice(marker+1).forEach((cell,index)=>{
        const properties=Array.from(cell.childNodes).find(node=>node.localName==='tcPr')
        for(const child of Array.from(cell.childNodes))if(child!==properties)cell.removeChild(child)
        const paragraph=el('p'),sdt=el('sdt'),pr=el('sdtPr'),alias=el('alias'),tag=el('tag'),id=el('id'),dropdown=el('dropDownList')
        attr(alias,'val',`${index<3?'运动员':'守门员'}服装${set} ${['球衣','球裤','球袜'][index%3]}`)
        attr(tag,'val',`sxf-kit-${index<3?'outfield':'goalkeeper'}-${set}-${['jersey','shorts','socks'][index%3]}`)
        attr(id,'val',810000+setIndex*10+index)
        for(const item of [{label:'选择颜色',value:''},...KIT_COLOR_OPTIONS]){const option=el('listItem');attr(option,'displayText',item.label);attr(option,'value',item.value);dropdown.appendChild(option)}
        pr.appendChild(alias);pr.appendChild(tag);pr.appendChild(id);pr.appendChild(dropdown)
        const content=el('sdtContent'),run=el('r'),style=el('rPr'),size=el('sz'),sizeCs=el('szCs'),text=el('t')
        attr(size,'val',14);attr(sizeCs,'val',14);style.appendChild(size);style.appendChild(sizeCs);run.appendChild(style);text.textContent='选择颜色';run.appendChild(text);content.appendChild(run);sdt.appendChild(pr);sdt.appendChild(content);paragraph.appendChild(sdt);cell.appendChild(paragraph)
      })
    }
  }
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
