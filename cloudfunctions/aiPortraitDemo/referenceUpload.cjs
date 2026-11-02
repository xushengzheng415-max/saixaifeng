'use strict'
const crypto = require('crypto')
const MAX_BYTES = 3 * 1024 * 1024
const TTL = 10 * 60 * 1000

// A ticket grants access only to the random reference object created here.
// Never accept arbitrary file IDs or remote URLs from the browser.
function ticketFor(fileID, secret, now = Date.now(), owner = '') {
  const payload = Buffer.from(JSON.stringify({ fileID, expires: now + TTL, owner })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update('portrait-reference:' + payload).digest('base64url')
  return payload + '.' + signature
}
function readTicket(ticket, secret, now = Date.now(), owner = '') {
  const parts = String(ticket || '').split('.')
  if (parts.length !== 2 || parts[0].length > 2048) throw new Error('参考图凭证无效，请重新上传')
  const expected = crypto.createHmac('sha256', secret).update('portrait-reference:' + parts[0]).digest()
  const signature = Buffer.from(parts[1], 'base64url')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) throw new Error('参考图凭证无效，请重新上传')
  const item = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  if (String(item.owner || '') !== String(owner || '')) throw new Error('参考图不属于当前会话，请重新上传')
  if (!Number.isFinite(item.expires) || item.expires < now || item.expires > now + TTL ||
      !/^cloud:\/\//.test(item.fileID) || !/\/ai-portrait-reference\/[a-f0-9]{32}\.jpg$/.test(item.fileID)) {
    throw new Error('参考图凭证已过期，请重新上传')
  }
  return item.fileID
}
async function initiate(app, secret, bytes, owner = '') {
  if (!Number.isInteger(bytes) || bytes < 100 || bytes > MAX_BYTES) throw new Error('参考图须为 3MB 以内的 JPEG')
  const cloudPath = 'ai-portrait-reference/' + crypto.randomBytes(16).toString('hex') + '.jpg'
  const result = await app.getUploadMetadata({ cloudPath })
  const data = result.data || {}
  if (!data.url || !data.fileId || !data.authorization || !data.token || !data.cosFileId) throw new Error('参考图上传暂不可用，请稍后重试')
  return {
    url: data.url,
    headers: { authorization: data.authorization, 'x-cos-security-token': data.token, 'x-cos-meta-fileid': data.cosFileId },
    ticket: ticketFor(data.fileId, secret, Date.now(), owner), maxBytes: MAX_BYTES
  }
}
async function consume(app, secret, ticket, owner = '') {
  const fileID = readTicket(ticket, secret, Date.now(), owner)
  try {
    const info = await app.getFileInfo({ fileList: [fileID] })
    const item = info.fileList && info.fileList[0]
    if (!item || item.code !== 'SUCCESS' || !Number.isFinite(item.size) || item.size < 100 || item.size > MAX_BYTES) {
      throw new Error('参考图大小无效，请重新上传')
    }
    const result = await app.downloadFile({ fileID })
    const buffer = result.fileContent
    if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES || buffer.length < 100 || buffer[0] !== 255 || buffer[1] !== 216) {
      throw new Error('参考图无效，请重新上传 JPEG 照片')
    }
    const decoded = require('jpeg-js').decode(buffer, { useTArray: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 128 })
    if (decoded.width > 3072 || decoded.height > 3072) throw new Error('参考图尺寸过大，请重新选择照片')
    return 'data:image/jpeg;base64,' + buffer.toString('base64')
  } finally {
    await app.deleteFile({ fileList: [fileID] })
  }
}
async function cancel(app, secret, ticket, owner = '') {
  await app.deleteFile({ fileList: [readTicket(ticket, secret, Date.now(), owner)] })
}
module.exports = { initiate, consume, cancel, ticketFor, readTicket, MAX_BYTES }
