export function organizerPlayerReviewStatus(player, tournamentId='', approvedIds=new Set()) {
  const status=String(player?.organizerReviewStatus || '').toLowerCase()
  if(!tournamentId)return ['approved','rejected'].includes(status)?status:'pending'
  if(approvedIds.has(String(player?._id || '')))return 'approved'
  if((!player?.organizerReviewTournamentId || player.organizerReviewTournamentId===tournamentId) && ['rejected','resubmitted'].includes(status))return status
  const imported=Boolean(player?.registrationImportBatchId || player?.importDraftId || player?.registrationSourceFileId || String(player?.source || '').toLowerCase().startsWith('registration_docx_import'))
  return imported && status==='approved' ? 'approved' : 'pending'
}
export function organizerPlayerReviewLabel(status){return ({approved:'已通过',rejected:'已驳回',resubmitted:'待复审',pending:'待审核'})[status] || '待审核'}
