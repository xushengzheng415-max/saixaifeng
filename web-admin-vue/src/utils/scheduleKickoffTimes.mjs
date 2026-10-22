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

/**
 * 按「比赛时长 + 转场时间」逐点推算开赛时间。
 * 这样算出的相邻开赛点天然不会时间重叠，不会再出现「界面显示空格但后端判为占用」的情况。
 * 传入的 sessions 视为全部开放；不在任何 session 内的时间点会跳到下一个 session 起点。
 */
export function generateKickoffTimes(options = {}) {
  const toMinutes = value => {
    const [hour, minute] = String(value || '00:00').split(':').map(Number)
    return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
  }
  const toText = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  const step = Math.max(5, Math.round(Number(options.step) || 60))
  const open = (Array.isArray(options.sessions) ? options.sessions : [])
    .map(item => ({ start: toMinutes(item && item.start), end: toMinutes(item && item.end) }))
    .filter(item => item.end > item.start)
  const from = toMinutes(options.start)
  const until = toMinutes(options.end)
  if (!open.length) return []
  const times = []
  let cursor = from
  let guard = 0
  while (cursor <= until && guard++ < 400) {
    if (open.some(item => cursor >= item.start && cursor < item.end)) {
      times.push(toText(cursor))
      cursor += step
      continue
    }
    const next = open.map(item => item.start).filter(value => value > cursor).sort((a, b) => a - b)[0]
    if (next == null) break
    cursor = next
  }
  return times
}
