Page({
  data:{ matchId:'', playerId:'', loading:true, errorText:'', player:{}, match:{}, certificate:{}, qrUrl:'', expiresText:'' },
  onLoad:function(options) { this.setData({ matchId:String(options && options.matchId || ''), playerId:String(options && options.playerId || '') }); this.load() },
  load:function() {
    var self=this
    this.setData({ loading:true, errorText:'' })
    wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'adultElectronicPass', matchId:this.data.matchId, playerId:this.data.playerId } }).then(function(res) {
      var result=res.result || {}
      if (!result.success) throw new Error(result.message || '电子参赛证加载失败')
      self.setData({ player:result.player || {}, match:result.match || {}, certificate:result.certificate || {}, expiresText:self.timeText(result.matchPass && result.matchPass.expiresAt) })
      return wx.cloud.callFunction({ name:'generateQRCode', data:{ type:'adult_match_pass', passId:result.matchPass.id, passToken:result.matchPass.token, width:520 } })
    }).then(function(res) {
      var result=res.result || {}
      if (!result.success) throw new Error(result.message || '二维码生成失败')
      self.setData({ loading:false, qrUrl:result.data && result.data.tempUrl || '' })
    }).catch(function(error) { self.setData({ loading:false, errorText:error.message || '电子参赛证加载失败' }) })
  },
  timeText:function(value) { var date=new Date(value || ''); if (isNaN(date.getTime())) return '本场有效'; function two(n){return String(n).padStart(2,'0')} return two(date.getMonth()+1)+'-'+two(date.getDate())+' '+two(date.getHours())+':'+two(date.getMinutes())+'前有效' }
})
