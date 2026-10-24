'use strict'
const clean=value=>String(value||'').normalize('NFKC').replace(/\s/g,'')
const nameHeader=value=>/^(?:(?:队(?:员)?|球员|人员)?姓[名各]|队员|球员)$/.test(clean(value))
const person=value=>/^[\p{Script=Han}·]{2,8}$/u.test(clean(value))&&!/队员|姓名|主教练|签名|队医|球衣/.test(clean(value))&&!/^(?:中场|半场|首发|替补|身份|换上|换下|进球|黄牌|红牌)$/.test(clean(value))
function headers(cells){
 const known=cells.filter(c=>nameHeader(c.text)),headerRow=known.length?Math.min(...known.map(c=>c.r)):null,maxColumn=Math.max(...cells.map(c=>c.ce),0)
 const titles=cells.filter(c=>/^[主客]队[:：]/.test(clean(c.text)))
 const starts=new Set(known.filter(c=>c.r===headerRow).map(c=>c.c-1))
 const sequences=new Map()
 for(const col of new Set(cells.filter(c=>c.ce-c.c===1).map(c=>c.c))){
  const rows=cells.filter(c=>c.c===col&&c.ce-c.c===1&&/^\d{1,2}$/.test(clean(c.text))).sort((a,b)=>a.r-b.r)
  let pairs=0;for(let i=1;i<rows.length;i++)if(rows[i].r===rows[i-1].r+1&&Number(clean(rows[i].text))===Number(clean(rows[i-1].text))+1)pairs++
  const names=cells.filter(c=>c.c===col+1&&c.ce-c.c===1&&person(c.text))
  if(pairs>=2&&names.length>=2){starts.add(col);sequences.set(col,rows)}
 }
 for(const title of titles)if(cells.filter(c=>c.c===title.c+1&&c.ce-c.c===1&&person(c.text)&&c.r>title.r).length>=2)starts.add(title.c)
 const titleStarts=[...new Set(titles.map(c=>c.c))],knownStarts=[...new Set(known.filter(c=>c.r===headerRow).map(c=>c.c-1))],reliable=titleStarts.length===2?titleStarts:knownStarts.length===2?knownStarts:null,result=[]
 for(const start of [...starts].filter(start=>!reliable||reliable.includes(start)).sort((a,b)=>a-b)){
  const existing=known.find(c=>c.c===start+1&&c.r===headerRow),first=(sequences.get(start)||[])[0]
  const r=existing?existing.r:headerRow??(first?first.r-1:null)
  const header=existing||cells.find(c=>c.r===r&&c.c===start+1&&c.ce-c.c===1)
  if(!header?.cell_location?.length)continue
  const title=titles.filter(c=>c.c===start&&c.r<r).sort((a,b)=>a.r-b.r)[0]
  result.push({...header,panelStart:start,panelTitle:title,inferredHeader:!existing})
 }
 return result.slice(0,2).map((header,index,list)=>{
  const next=list[index+1],red=cells.filter(c=>c.r===header.r&&c.c>header.c&&/红牌|罚下/.test(clean(c.text))).sort((a,b)=>a.c-b.c)[0]
  const end=next?next.panelStart:header.panelTitle?header.panelTitle.ce:red?red.ce:maxColumn
  // An unresolved wide two-team grid must never become one full-width player row.
  if(list.length===1&&!header.panelTitle&&!red&&end-header.panelStart>12)return null
  const title=clean(header.panelTitle?.text),teamSide=list.length>1?(index?'away':'home'):/^主队/.test(title)?'home':/^客队/.test(title)?'away':null
  return {...header,panelEnd:end,teamSide}
 }).filter(Boolean)
}
function polygon(cells,rect){
 const ordered=cells.filter(c=>c.cell_location?.length===4).slice().sort((a,b)=>a.c-b.c)
 if(!ordered.length||!rect)return null
 const a=ordered[0].cell_location,b=ordered[ordered.length-1].cell_location
 function xAt(p,q,y){return Math.abs(q.y-p.y)<1?(p.x+q.x)/2:p.x+(q.x-p.x)*(y-p.y)/(q.y-p.y)}
 // Follow the actual row's sloped top/bottom as well as its side borders.
 // A horizontal bounding box would include the previous player's text on a tilted sheet.
 return [{x:xAt(a[0],a[3],a[0].y-2),y:a[0].y-2},{x:xAt(b[1],b[2],b[1].y-2),y:b[1].y-2},{x:xAt(b[1],b[2],b[2].y+2),y:b[2].y+2},{x:xAt(a[0],a[3],a[3].y+2),y:a[3].y+2}]
}
module.exports={headers,polygon}
