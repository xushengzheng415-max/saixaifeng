var workspace = require('./workspace')
function call(action,data){var context=workspace.readContext()||{},workspaceId=(context.currentWorkspace||{}).id,user=wx.getStorageSync('userInfo')||{},userId=String(user._id||user.id||'');return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:action,dynamicCardProtocol:'player-card-dynamic/1',workspaceId:workspaceId},data||{})}).then(function(reply){var current=workspace.readContext()||{},account=wx.getStorageSync('userInfo')||{};if((current.currentWorkspace||{}).id!==workspaceId||String(account._id||account.id||'')!==userId)throw new Error('账号或工作空间已切换，请重新读取');var result=reply.result||{};if(!result.success)throw new Error(result.error||result.message||'球员卡读取失败');return result})}

function read(playerId,teamId){return call('playerCardRead',{playerId:String(playerId||''),teamId:String(teamId||'')})}
// The same authorized reader provides its current complete-image compatibility
// response; no client-rendered portrait/text substitutions or stored card cache.
function readImage(playerId,teamId){return call('playerCardRead',{playerId:String(playerId||''),teamId:String(teamId||''),dynamicCardProtocol:''})}
function batch(ids,teamId){return call('playerCardBatchRead',{playerIds:ids.map(String),teamId:String(teamId||'')})}
function batchImages(ids,teamId){return call('playerCardBatchRead',{playerIds:ids.map(String),teamId:String(teamId||''),dynamicCardProtocol:''})}
function stateText(status){return {unavailable:'',pending:'成卡更新中',failed:'球员卡读取失败',forbidden:'无权查看球员卡',loading:'正在加载…'}[status]||''}
module.exports={read:read,readImage:readImage,batch:batch,batchImages:batchImages,stateText:stateText}
