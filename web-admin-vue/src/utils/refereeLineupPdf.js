import { createRefereeLineupPrintHtml } from './refereeLineupSheet'

export async function createRefereeLineupPdf(input) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none;'
  try {
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PDF工作单加载超时，请重试')), 20000)
      frame.onload = () => { clearTimeout(timer); resolve() }
      frame.onerror = () => { clearTimeout(timer); reject(new Error('PDF工作单加载失败，请重试')) }
    })
    frame.srcdoc = createRefereeLineupPrintHtml(input).replace(/<script>[\s\S]*?<\/script>/g, '')
    document.body.appendChild(frame)
    await loaded
    const doc = frame.contentDocument
    if (!doc) throw new Error('PDF工作单无法生成，请重试')
    await doc.fonts?.ready
    await Promise.all([...doc.images].map(image => image.decode().catch(() => { throw new Error('工作单图片加载失败，请重试') })))
    const pages = [...doc.querySelectorAll('.sheet')]
    if (!pages.length) throw new Error('工作单内容为空，请重新加载名单')
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true })
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      page.style.margin = '0'; page.style.boxShadow = 'none'
      const canvas = await html2canvas(page, { scale:3, useCORS:true, backgroundColor:'#ffffff', logging:false, imageTimeout:15000 })
      const scale = Math.min(188 / canvas.width, 275 / canvas.height)
      const width = canvas.width * scale, height = canvas.height * scale
      if (index) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (210-width)/2, 11, width, height, undefined, 'FAST')
      canvas.width = 0; canvas.height = 0
    }
    return pdf.output('blob')
  } finally { frame.remove() }
}
