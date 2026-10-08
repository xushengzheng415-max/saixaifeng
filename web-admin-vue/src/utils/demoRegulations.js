import template from '../data/demoRegulationTemplate.json'

export const demoRegulationName = template.sourceFileName
export const demoRegulationUrl = `${import.meta.env.BASE_URL}assets/demo-regulations/youth-football-regulations.docx`
export function demoRegulationData() { return JSON.parse(JSON.stringify(template.data)) }
export function demoDivisionForRules(division) {
  return { ...division, matchMinutes:division.periodMode === 'halves' ? Number(division.matchMinutes) / 2 : division.matchMinutes }
}
export async function recognizeStoredDemoRegulation(tournament) {
  const source = String(tournament.regulationsFileId || '')
  let data
  if (source === demoRegulationUrl) data = demoRegulationData()
  else if (/^data:[^,]*;base64,/.test(source)) {
    const bytes = Uint8Array.from(atob(source.slice(source.indexOf(',') + 1)), char => char.charCodeAt(0))
    data = await recognizeDemoRegulation(new File([bytes], tournament.regulationsFileName || '竞赛规程.docx'))
  } else throw new Error('请返回赛事设置，选择或上传青少年演示范本')
  // The rule wizard edits duration per period; the source gives 50 minutes total.
  data.divisions = data.divisions.map(demoDivisionForRules)
  return data
}
export function matchesDemoRegulationText(text) {
  const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, '')
  return normalize(text) === normalize(template.sourceText)
}
export async function recognizeDemoRegulation(file) {
  if (!/\.docx$/i.test(file.name)) throw new Error('演示识别请上传青少年规程范本 Word 文件，或选择“使用范本”')
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256',bytes)
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('')
  if (hash !== template.sourceSha256) {
    const mammoth = (await import('mammoth/mammoth.browser')).default
    const result = await mammoth.extractRawText({ arrayBuffer:bytes })
    if (!matchesDemoRegulationText(result.value)) throw new Error('这份文件与演示范本不同，请选择“使用范本”')
  }
  return demoRegulationData()
}
