const nameKey=value=>String(value||'').trim().replace(/\s+/g,'').toLowerCase()

// Same-form photo lookup only: no identity, role or roster fields are copied.
export function reuseStaffPhotos(staff,players) {
  const reused=[]
  for(const person of staff){
    if(person.photoFile||person.photoFileId||person.error||!nameKey(person.name))continue
    const candidates=players.filter(player=>nameKey(player.name)===nameKey(person.name))
    if(candidates.length!==1)continue
    const source=candidates[0]
    if(source.error||(!source.photoFile&&!source.photoFileId))continue
    const a=person.identityNumber||person.identityNumberPrefix||'',b=source.identityNumber||source.identityNumberPrefix||''
    if(a&&b&&a.slice(0,Math.min(a.length,b.length))!==b.slice(0,Math.min(a.length,b.length)))continue
    if(person.birthDate&&source.birthDate&&person.birthDate!==source.birthDate)continue
    if(person.gender&&source.gender&&person.gender!==source.gender)continue
    for(const field of ['photoFile','photoFileId','photoOriginalFileId','photoProcessingStatus'])if(source[field]!=null)person[field]=source[field]
    person.photoReuseSource='same_form_player'
    reused.push(person)
  }
  return reused
}

export function photoResult(person) {
  return {photoFileId:person.photoFileId,photoOriginalFileId:person.photoOriginalFileId||'',photoProcessingStatus:person.photoProcessingStatus,photoProgressText:''}
}
