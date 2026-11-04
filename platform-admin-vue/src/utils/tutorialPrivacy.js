// Coordinates are always in source pixels. Only the flattened result is uploaded.
export const OPERATION_WORDS = new Set(('保存,取消,确认,确定,返回,关闭,上传,上传图片,上传照片,更换图片,更换照片,选择图片,选择照片,选择文件,编辑,删除,添加,新增,提交,下一步,上一步,完成,查询,搜索,刷新,处理,查看,详情,发布,草稿,已发布,未发布,待审核,已审核,审核通过,报名,球队,球员,赛事,我的,首页,设置,管理,操作,姓名,手机号,电话,队名,球队名称,球员姓名,联系人,负责人,头像,队徽,照片,球衣号码,位置,性别,年龄,身份证,微信号,登录,退出,导入,导出,添加球员,保存修改,球员资料,球队资料,基本信息,报名信息,选择球队,添加步骤').split(','))
const normalizedText = value => String(value || '').replace(/[\s:：·|]/g, '')

export function privacyTextRegions(blocks, width, height) {
  const regions = []
  for (const block of blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    // Mask whole non-operation lines: names split into OCR words still stay covered.
    const value = normalizedText(line.text || (line.words || []).map(w => w.text).join(''))
    if (!value || OPERATION_WORDS.has(value)) continue
    const b = line.bbox
    if (!b || ![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)) continue
    const pad = Math.max(4, (b.y1 - b.y0) * .2)
    const x = Math.max(0, b.x0 - pad), y = Math.max(0, b.y0 - pad)
    regions.push({ type: 'mask', x, y, w: Math.min(width, b.x1 + pad) - x, h: Math.min(height, b.y1 + pad) - y, automatic: true })
  }
  return regions
}

// Conservative candidates for compact coloured badges/avatars. This is a visual
// heuristic, not a semantic logo detector; users must review/add manual masks.
export function badgeCandidates(imageData, sourceWidth, sourceHeight, textRegions = []) {
  const { width, height, data } = imageData, visited = new Uint8Array(width * height), candidates = []
  const sx = sourceWidth / width, sy = sourceHeight / height
  const coloured = i => { const k = i * 4, max = Math.max(data[k],data[k+1],data[k+2]), min = Math.min(data[k],data[k+1],data[k+2]); return data[k+3] > 200 && max > 65 && max - min > 42 }
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || !coloured(start)) continue
    const queue = [start]; visited[start] = 1
    let left = width, top = height, right = 0, bottom = 0
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % width, y = Math.floor(i / width)
      left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y)
      for (const next of [x > 0 ? i-1 : -1,x < width-1 ? i+1 : -1,y > 0 ? i-width : -1,y < height-1 ? i+width : -1]) {
        if (next >= 0 && !visited[next] && coloured(next)) { visited[next] = 1; queue.push(next) }
      }
    }
    const w = (right-left+1)*sx, h = (bottom-top+1)*sy, ratio = w/h
    if (w < 14 || h < 14 || w > Math.min(180,sourceWidth*.27) || h > 180 || ratio < .45 || ratio > 2.1 || queue.length / ((right-left+1)*(bottom-top+1)) < .17) continue
    const x = left*sx, y = top*sy
    if (textRegions.some(r => x >= r.x && y >= r.y && x+w <= r.x+r.w && y+h <= r.y+r.h)) continue
    const pad = Math.max(5, Math.min(w,h)*.18), bx = Math.max(0,x-pad), by = Math.max(0,y-pad)
    candidates.push({ type: 'mask', x: bx, y: by, w: Math.min(sourceWidth,x+w+pad)-bx, h: Math.min(sourceHeight,y+h+pad)-by, automatic: true })
  }
  return candidates.slice(0, 150)
}

export function renderAnnotations(ctx, shapes, selected = -1) {
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i], line = Math.max(3, ctx.canvas.width / 280)
    ctx.save(); ctx.lineWidth = line; ctx.strokeStyle = '#e03131'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (s.type === 'mask') { ctx.fillStyle = '#e4e7eb'; ctx.fillRect(s.x,s.y,s.w,s.h); ctx.strokeStyle = '#b7bec5'; ctx.lineWidth = 1; ctx.strokeRect(s.x,s.y,s.w,s.h) }
    else if (s.type === 'box') ctx.strokeRect(s.x,s.y,s.w,s.h)
    else if (s.type === 'arrow') {
      const dx = s.w, dy = s.h, angle = Math.atan2(dy,dx), head = Math.max(13,line*4)
      ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x+dx,s.y+dy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(s.x+dx-head*Math.cos(angle-.48),s.y+dy-head*Math.sin(angle-.48)); ctx.lineTo(s.x+dx,s.y+dy); ctx.lineTo(s.x+dx-head*Math.cos(angle+.48),s.y+dy-head*Math.sin(angle+.48)); ctx.stroke()
    }
    if (i === selected) { ctx.strokeStyle = '#176b43'; ctx.lineWidth = Math.max(1,line/2); ctx.setLineDash([6,4]); ctx.strokeRect(Math.min(s.x,s.x+s.w)-5,Math.min(s.y,s.y+s.h)-5,Math.abs(s.w)+10,Math.abs(s.h)+10) }
    ctx.restore()
  }
}

export function normalizedMasks(shapes, width, height) { return shapes.filter(s => s.type === 'mask').map(s => ({ type: 'mask', x: s.x/width, y: s.y/height, w: s.w/width, h: s.h/height })) }
export function scaleMasks(masks, width, height) { return masks.map(s => ({ type: 'mask', x: s.x*width, y: s.y*height, w: s.w*width, h: s.h*height })) }

export async function recognizeLocally(canvas, onProgress = () => {}, registerCancel = () => {}) {
  const { createWorker } = await import('tesseract.js')
  const base = new URL(`${import.meta.env.BASE_URL}tutorial-ocr/`, location.origin).href
  let worker, cancelled = false, timer, rejectCancel
  const aborted = new Promise((_, reject) => { rejectCancel = reject })
  const cancel = () => { cancelled = true; rejectCancel(new Error('识别已取消或超时，请重试或手动遮盖')); if (worker) worker.terminate().catch(() => {}) }
  registerCancel(cancel)
  try {
    timer = setTimeout(cancel, 90000)
    const initializing = createWorker(['chi_sim','eng'], 1, { workerPath: base+'worker.min.js', corePath: base, langPath: base.replace(/\/$/,''), workerBlobURL: false, gzip: true, errorHandler: () => rejectCancel(new Error('本机识别失败，请重试或手动遮盖')), logger: m => onProgress(Math.round((m.progress || 0)*100)) })
    initializing.then(next => { if (cancelled) next.terminate().catch(() => {}) }).catch(() => {})
    worker = await Promise.race([initializing, aborted])
    if (cancelled) throw new Error('识别已取消，请重试或手动遮盖')
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' })
    const result = await Promise.race([worker.recognize(canvas, {}, { blocks: true, text: true }), aborted])
    if (cancelled) throw new Error('识别已取消，请重试或手动遮盖')
    return result.data.blocks || []
  } catch (error) { if (cancelled) throw error; throw new Error('本机识别失败，请重试或手动框选遮盖') }
  finally { clearTimeout(timer); registerCancel(null); if (worker) await worker.terminate().catch(() => {}) }
}
