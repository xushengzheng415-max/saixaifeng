function cleanPathSegment(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function resolveChunkUploadTarget(cloudPath, fallbackFileName = 'upload.bin') {
  const rawPath = String(cloudPath || '').trim().replace(/\\/g, '/')
  const rawSegments = rawPath.split('/').filter(Boolean)
  if (rawSegments.some(segment => segment === '.' || segment === '..')) {
    throw new Error('上传路径无效')
  }

  const safeSegments = rawSegments.map(cleanPathSegment).filter(Boolean)
  const fallback = cleanPathSegment(fallbackFileName) || 'upload.bin'
  const fileName = safeSegments.pop() || fallback
  const folder = safeSegments.join('/') || 'regulations'
  return { folder, fileName }
}

export function isPayloadTooLargeError(error) {
  const message = String(error?.message || error || '')
  return /EXCEED_MAX_PAYLOAD_SIZE|exceed max request payload size/i.test(message)
}
