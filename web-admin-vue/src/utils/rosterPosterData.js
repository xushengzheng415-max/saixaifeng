const displayableImage = value => /^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(value || ''))

// Only explicit player/coach links may share a portrait; matching names is unsafe.
export function withLinkedStaffPhotos(players = [], staff = []) {
  const byCoachId = new Map(staff.filter(person => person?._id).map(person => [String(person._id), person]))
  const byPlayerId = new Map(staff.filter(person => person?.linkedPlayerId).map(person => [String(person.linkedPlayerId), person]))
  return players.map(player => {
    const coach = byCoachId.get(String(player.linkedCoachId || '')) || byPlayerId.get(String(player._id || ''))
    if (!coach || displayableImage(player.photoUrl)) return player
    const photoUrl = coach.photoUrl || coach.photo || player.photoUrl || ''
    const fileId = coach._exportPhotoFileId || coach.photoFileID || coach.photoFileId || ''
    return { ...player, photoUrl, _exportPhotoFileId: fileId || player._exportPhotoFileId || '' }
  })
}
