const nameKey=value=>String(value||'').trim().replace(/\s+/g,'').toLowerCase()

// Same-form lookup: fill missing display details, never link identities or roles.
export function reuseStaffPhotos(staff,players) {
  const reused=[]
  for(const person of staff){
    if(person.error||!nameKey(person.name))continue
    const candidates=players.filter(player=>nameKey(player.name)===nameKey(person.name))
    if(candidates.length!==1)continue
    const source=candidates[0]
    if(source.error)continue
    const a=person.identityNumber||person.identityNumberPrefix||'',b=source.identityNumber||source.identityNumberPrefix||''
    if(a&&b&&a.slice(0,Math.min(a.length,b.length))!==b.slice(0,Math.min(a.length,b.length)))continue
    if(person.birthDate&&source.birthDate&&person.birthDate!==source.birthDate)continue
    if(person.gender&&source.gender&&person.gender!==source.gender)continue
    let changed=false
    if(!person.photoFile&&!person.photoFileId&&(source.photoFile||source.photoFileId)){
      for(const field of ['photoFile','photoFileId','photoOriginalFileId','photoProcessingStatus'])if(source[field]!=null)person[field]=source[field]
      person.photoReuseSource='same_form_player'
      changed=true
    }
    for(const field of ['birthDate','gender','nativePlace']){
      const missing=!person[field]||(field==='nativePlace'&&['待核验','地区码待核验'].includes(person[field]))
      if(missing&&source[field]&&!['待核验','地区码待核验'].includes(source[field])){person[field]=source[field];changed=true}
    }
    // Only a protected prefix is displayed; do not create a full ID from a name match.
    if(!person.identityNumber&&!person.identityNumberPrefix){
      const prefix=source.identityNumberPrefix||String(source.identityNumber||'').slice(0,14)
      if(/^\d{6,17}$/.test(prefix)){person.identityNumberPrefix=prefix;person.identityIncomplete=true;changed=true}
    }
    if(changed){person.detailsReuseSource='same_form_player';reused.push(person)}
  }
  return reused
}

export function photoResult(person) {
  return {photoFileId:person.photoFileId,photoOriginalFileId:person.photoOriginalFileId||'',photoProcessingStatus:person.photoProcessingStatus,photoProgressText:''}
}
