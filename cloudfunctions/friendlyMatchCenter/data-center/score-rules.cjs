'use strict'
const DEFAULT_VERSION='football-player-card-points/2'
const DEFAULT_PARAMETERS=Object.freeze({appearancePoints:2,startPoints:1,minutesPerPoint:45,goalPoints:2,goalCapPercent:20,supportDropsPerPoint:10,silverAt:45,goldAt:100})
function parameters(input={}){
  const result={}
  const bounds={appearancePoints:[0,100],startPoints:[0,100],minutesPerPoint:[1,300],goalPoints:[0,100],goalCapPercent:[0,100],supportDropsPerPoint:[1,10000],silverAt:[1,100000],goldAt:[2,100000]}
  for(const [key,[min,max]] of Object.entries(bounds)){const value=input[key];if(!Number.isSafeInteger(value)||value<min||value>max)throw Object.assign(new Error('积分参数不合法：'+key),{code:'CARD_RULE_INVALID'});result[key]=value}
  if(result.goldAt<=result.silverAt)throw Object.assign(new Error('金卡门槛必须高于银卡'),{code:'CARD_RULE_INVALID'})
  return result
}
function defaults(){return {version:DEFAULT_VERSION,parameters:{...DEFAULT_PARAMETERS},floorVersion:''}}
module.exports={DEFAULT_VERSION,DEFAULT_PARAMETERS,parameters,defaults}
