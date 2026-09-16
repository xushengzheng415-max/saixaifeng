function textList(value){
  if(Array.isArray(value))return value.map(item=>String(item||'').trim()).filter(Boolean)
  return String(value||'').split(/[、,，;；\n]/).map(item=>item.trim()).filter(Boolean)
}

export function commercialCategoriesFrom(source={}){
  if(Array.isArray(source.commercialCategories)&&source.commercialCategories.length){
    return source.commercialCategories.map((item,index)=>({
      id:String(item.id||('category-'+index)),
      name:String(item.name||''),
      builtin:item.builtin===true,
      partners:textList(item.partners).length?textList(item.partners):['']
    }))
  }
  const title={id:'title',name:'冠名商',builtin:true,partners:textList(source.titleSponsor)}
  const sponsorGroups=new Map()
  ;(Array.isArray(source.sponsors)?source.sponsors:[]).forEach(item=>{
    const value=typeof item==='string'?item:item?.value
    if(!value)return
    const id=String(item?.categoryId||'sponsor')
    const name=String(item?.categoryName||'赞助商')
    if(!sponsorGroups.has(id))sponsorGroups.set(id,{id,name,builtin:id==='sponsor',partners:[]})
    sponsorGroups.get(id).partners.push(String(value))
  })
  if(!sponsorGroups.has('sponsor'))sponsorGroups.set('sponsor',{id:'sponsor',name:'赞助商',builtin:true,partners:[]})
  ;(Array.isArray(source.customCommercialPartners)?source.customCommercialPartners:[]).forEach((item,index)=>{
    const name=String(item?.type||'').trim()
    const partner=String(item?.name||'').trim()
    if(!name&&!partner)return
    const id='legacy-custom-'+index
    sponsorGroups.set(id,{id,name:name||'其他合作',builtin:false,partners:partner?[partner]:[]})
  })
  const categories=[title,...sponsorGroups.values()]
  categories.forEach(item=>{if(!item.partners.length)item.partners=['']})
  return categories
}

export function commercialPayload(categories=[]){
  const cleaned=(Array.isArray(categories)?categories:[]).map((item,index)=>({
    id:String(item.id||('category-'+index)),
    name:String(item.name||'').trim()||'未命名类别',
    builtin:item.builtin===true,
    partners:textList(item.partners)
  }))
  const title=cleaned.find(item=>item.id==='title')
  const sponsors=cleaned.filter(item=>item.id!=='title').flatMap(item=>item.partners.map(value=>({type:'text',value,categoryId:item.id,categoryName:item.name})))
  return {commercialCategories:cleaned,titleSponsor:title?title.partners.join('、'):'',sponsors}
}
