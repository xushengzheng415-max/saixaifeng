var engine=require('../../utils/dynamic-card-draw')
var resources=require('../../utils/dynamic-card-resources')
Component({
 properties:{scene:{type:Object,value:null},previewEnabled:{type:Boolean,value:true},httpsNativeFonts:{type:Boolean,value:false}},
 data:{loading:true,error:''},
 observers:{scene:function(scene){var key=JSON.stringify(scene);if(key===this._sceneKey)return;this._sceneKey=key;this.schedule()}},
 lifetimes:{attached:function(){this._attached=true;this.schedule()},detached:function(){this._attached=false;this._epoch=(this._epoch||0)+1;clearTimeout(this._timer)}},
 methods:{
  schedule:function(){if(!this._attached||!this.data.scene)return;var self=this;wx.nextTick(function(){self.render()})},
  render:function(){
   var self=this,scene=this.data.scene,n=(this._epoch||0)+1
   if(!scene)return
   this._epoch=n;this._canvas=null;clearTimeout(this._timer);this.setData({loading:true,error:''})
   function current(){return self._attached&&n===self._epoch}
   function failed(error){if(!current())return;clearTimeout(self._timer);self._epoch++;var message=error.message||'卡片未加载，请重试';self.setData({loading:false,error:message});self.triggerEvent('error',{message:message,stage:error.stage||'draw'})}
   this._timer=setTimeout(function(){failed({message:'卡片加载超时，请重试',stage:'timeout'})},15000)
   this.createSelectorQuery().select('#cardCanvas').fields({node:true,size:true}).exec(async function(rows){
    try{
     var canvas=rows[0]&&rows[0].node
     if(!canvas||!wx.createOffscreenCanvas)throw new Error('当前微信无法绘制卡片')
     await resources.loadFonts(scene,{httpsNative:self.data.httpsNativeFonts})
     if(!current())return
     await engine.draw(scene,{canvas:canvas,scale:2,isCurrent:current,createCanvas:function(w,h){return wx.createOffscreenCanvas({type:'2d',width:w,height:h})},loadImage:function(url){return resources.image(canvas,url)}})
     if(!current())return
     clearTimeout(self._timer);self._canvas=canvas;self.setData({loading:false,error:''});self.triggerEvent('ready',{publishedVersion:scene.publishedVersion})
    }catch(error){failed(error)}
   })
  },
  exportImage:function(){var self=this;return new Promise(function(resolve,reject){if(!self._canvas||self.data.loading||self.data.error)return reject(new Error('球员卡尚未加载'));wx.canvasToTempFilePath({canvas:self._canvas,destWidth:600,destHeight:860,fileType:'png',success:function(r){resolve(r.tempFilePath)},fail:reject},self)})},
  preview:function(){if(!this.data.previewEnabled)return;this.exportImage().then(function(path){wx.previewImage({urls:[path]})}).catch(function(error){wx.showToast({title:error.message||'预览失败',icon:'none'})})}
 }
})
