export function parseKickoffTimes(value) {
  const parts=(Array.isArray(value)?value:String(value || '').split(/[\s,，;；、]+/)).filter(Boolean),times=[],errors=[]
  for(const part of parts){const match=String(part).replace('：',':').match(/^(\d{1,2}):(\d{2})$/);if(!match || Number(match[1])>23 || Number(match[2])>59){errors.push(String(part));continue}times.push(`${match[1].padStart(2,'0')}:${match[2]}`)}
  return {times:[...new Set(times)].sort(),errors}
}
export function configuredKickoffTimes(config={}) {
  if(Array.isArray(config.kickoffTimes))return parseKickoffTimes(config.kickoffTimes).times
  return parseKickoffTimes((config.sessionWindows || []).filter(s=>s.enabled).map(s=>s.start)).times
}
export function kickoffWindows(times,duration=60) {
  return [{key:'morning',label:'上午',test:h=>h<12},{key:'afternoon',label:'下午',test:h=>h>=12 && h<18},{key:'evening',label:'晚间',test:h=>h>=18}].map(group=>{
    const values=times.filter(time=>group.test(Number(time.slice(0,2))));if(!values.length)return {key:group.key,label:group.label,enabled:false,start:'00:00',end:'00:00'}
    const last=values.at(-1).split(':').map(Number),end=Math.min(1440,last[0]*60+last[1]+duration)
    return {key:group.key,label:group.label,enabled:true,start:values[0],end:`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`}
  })
}

export function kickoffPeriod(time) { const hour=Number(String(time).slice(0,2));return hour<12?'morning':hour<18?'afternoon':'evening' }
export function halfHourKickoffOptions() { return Array.from({length:26},(_,index)=>{const value=540+index*30;return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}) }
