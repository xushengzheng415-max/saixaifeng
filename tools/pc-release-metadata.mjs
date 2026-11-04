import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'

export const PC_SOURCE_PATHS = ['web-admin-vue','desktop-windows','index.html','shared/player-card','cloudfunctions/dataCenter/shared','cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs','tools/pc-release-metadata.mjs','cloudfunctions/generateSchedule/pairingTemplates.js','cloudfunctions/generateSchedule/topology.js','cloudfunctions/generateSchedule/confirmedPairings.js']
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
export function pcSourceHash(root,ref='HEAD'){
  const tree=git(root,['ls-tree','-r',ref,'--',...PC_SOURCE_PATHS])
  if(!tree.includes('web-admin-vue/'))throw Error('没有找到PC源码，请从正式Git仓库构建')
  return createHash('sha256').update(tree).digest('hex')
}
export function pcReleaseMetadata(root,base){
  const sourceCommit=git(root,['rev-parse','HEAD'])
  let formalBaselineCommit=sourceCommit
  try{formalBaselineCommit=git(root,['rev-parse','github/main'])}catch{}
  return {app:'sxf-organizer-pc',channel:base==='/preview/admin/'?'preview':'production',sourceCommit,formalBaselineCommit,pcSourceSha256:pcSourceHash(root),sourceDirty:Boolean(git(root,['status','--porcelain','--untracked-files=normal','--',...PC_SOURCE_PATHS])),builtAt:new Date().toISOString()}
}
export function pcReleaseMetadataPlugin(root,base){
  return {name:'pc-release-metadata',generateBundle(){this.emitFile({type:'asset',fileName:'pc-release.json',source:JSON.stringify(pcReleaseMetadata(root,base),null,2)+'\n'})}}
}
