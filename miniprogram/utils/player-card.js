var workspace = require('./workspace')
function call(action,data){return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:action,workspaceId:((workspace.readContext()||{}).currentWorkspace||{}).id},data||{})}).then(function(reply){var result=reply.result||{};if(!result.success)throw new Error(result.error||result.message||'球员卡读取失败');return result})}
function read(playerId,teamId){return call('playerCardRead',{playerId:String(playerId||''),teamId:String(teamId||'')})}
function batch(ids,teamId){return call('playerCardBatchRead',{playerIds:ids.map(String),teamId:String(teamId||'')})}
function stateText(status){return {unavailable:'尚未制作球员卡',pending:'成卡更新中',failed:'球员卡读取失败',forbidden:'无权查看球员卡',loading:'正在读取成卡…'}[status]||'尚未制作球员卡'}
module.exports={read:read,batch:batch,stateText:stateText}
