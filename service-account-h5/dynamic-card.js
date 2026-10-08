(function(){
 'use strict'
 var original=window.fetch
 window.fetch=function(input,options){
  var url=typeof input==='string'?input:input&&input.url
  if(!url||url.indexOf('cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi')!==0)return original.apply(this,arguments)
  if(options&&typeof options.body==='string'){try{var body=JSON.parse(options.body);body.dynamicCardProtocol='player-card-dynamic/1';options=Object.assign({},options,{body:JSON.stringify(body)})}catch{}}
  return original.call(this,input,options).then(function(response){var read=response.json.bind(response);response.json=function(){return read().then(async function(value){if(value&&typeof value.body==='string'){var body;try{body=JSON.parse(value.body)}catch{return value}await window.SxfDynamicCard.hydrate(body);value.body=JSON.stringify(body);return value}return window.SxfDynamicCard.hydrate(value)})};return response})
 }
})()
