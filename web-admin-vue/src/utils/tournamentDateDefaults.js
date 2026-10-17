// 创建赛事时的模块化时间参考（演示模式与真实创建共用）：
// 报名截止日 = 今天 + 3 天；参赛日期 = 截止日 + 1 起连续 3 天。
// 仅为默认值，用户仍可在表单中自由修改。
function padDatePart(value){return String(value).padStart(2,'0')}
export function toDateString(date){return date.getFullYear()+'-'+padDatePart(date.getMonth()+1)+'-'+padDatePart(date.getDate())}
export function shiftDateString(dateString,days){const date=new Date(dateString+'T00:00:00');date.setDate(date.getDate()+days);return toDateString(date)}
export function defaultRegistrationDeadline(){return shiftDateString(toDateString(new Date()),3)}
export function defaultCompetitionRange(){const deadline=defaultRegistrationDeadline();const start=shiftDateString(deadline,1);return[start,shiftDateString(start,2)]}
