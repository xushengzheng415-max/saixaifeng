// Display evidence from the uploaded image. Never synthesize ink or infer row positions.
function rect(value,width,height){
 if(!value || !['left','top','width','height'].every(function(key){return Number.isFinite(value[key])}) || value.width<=0 || value.height<=0)return null
 var left=Math.max(0,Math.floor(value.left)),top=Math.max(0,Math.floor(value.top)),right=Math.min(width,Math.ceil(value.left+value.width)),bottom=Math.min(height,Math.ceil(value.top+value.height))
 return right>left && bottom>top?{left:left,top:top,width:right-left,height:bottom-top}:null
}
function plan(row,quality){
 if(!quality || quality.regionCoordinateSpace!=='uploaded_image' || !(quality.width>0&&quality.height>0))throw new Error('此记录缺少行定位，请查看整表或重新识别')
 var body=rect(row.reviewRegion,quality.width,quality.height),header=rect(row.reviewHeaderRegion,quality.width,quality.height)
 if(!body)throw new Error('未定位到此行，请查看整表')
 if(header && header.top>=body.top)header=null
 var left=Math.min(body.left,header?header.left:body.left),right=Math.max(body.left+body.width,header?header.left+header.width:0),width=right-left
 var scale=Math.min(4,1600/width),gap=header?6:0,parts=[],top=0
 function polygon(value){if(value==null)return null;if(!Array.isArray(value)||value.length!==4||value.some(function(p){return !Number.isFinite(p.x)||!Number.isFinite(p.y)}))throw new Error('切片边界无效，请重新识别');return value}
 if(header){parts.push({left:left,top:header.top,width:width,height:header.height,dy:0,clip:polygon(row.reviewHeaderPolygon)});top=header.height+gap}
 parts.push({left:left,top:body.top,width:width,height:body.height,dy:top,clip:polygon(row.reviewPolygon)})
 return {width:Math.ceil(width*scale),height:Math.ceil((top+body.height)*scale),scale:scale,parts:parts}
}
function key(row,quality,path){return JSON.stringify([path,row.key,quality,row.reviewRegion,row.reviewHeaderRegion,row.reviewPolygon,row.reviewHeaderPolygon])}
function bounded(start,message){return new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(new Error(message))},10000);try{start(function(value){clearTimeout(timer);resolve(value)},function(){clearTimeout(timer);reject(new Error(message))})}catch(error){clearTimeout(timer);reject(error)}})}
function canvasNode(component){return bounded(function(resolve,reject){component.createSelectorQuery().select('#reportSliceCanvas').fields({node:true,size:true}).exec(function(rows){var canvas=rows[0]&&rows[0].node;if(canvas)resolve(canvas);else reject()})},'切片未加载，请重试')}
function load(canvas,path){return new Promise(function(resolve,reject){var image=canvas.createImage(),timer=setTimeout(function(){done(new Error('原图读取超时，请重试'))},10000);function done(error){clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve(image)}image.onload=function(){done()};image.onerror=function(){done(new Error('原图未读取，请重试或查看整表'))};image.src=path})}
async function render(component,path,row,quality,platform,isCurrent){
 var layout=plan(row,quality),canvas=await canvasNode(component)
 if(!isCurrent())throw new Error('SLICE_STALE')
 var image=await load(canvas,path)
 if(!isCurrent())throw new Error('SLICE_STALE')
 if(image.width!==quality.width || image.height!==quality.height)throw new Error('图片方向或尺寸已变化，请重新识别')
 canvas.width=layout.width;canvas.height=layout.height
 var context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height)
 layout.parts.forEach(function(part){if(part.clip){context.save();context.beginPath();part.clip.forEach(function(p,index){var x=(p.x-part.left)*layout.scale,y=(p.y-part.top+part.dy)*layout.scale;if(!index)context.moveTo(x,y);else context.lineTo(x,y)});context.closePath();context.clip()}context.drawImage(image,part.left,part.top,part.width,part.height,0,part.dy*layout.scale,part.width*layout.scale,part.height*layout.scale);if(part.clip)context.restore()})
 if(!isCurrent())throw new Error('SLICE_STALE')
 var output=await bounded(function(resolve,reject){platform.canvasToTempFilePath({canvas:canvas,destWidth:canvas.width,destHeight:canvas.height,fileType:'png',success:function(result){resolve(result.tempFilePath)},fail:reject},component)},'切片未生成，请重试')
 return {path:output,width:layout.width,height:layout.height}
}
module.exports={plan:plan,key:key,render:render}
