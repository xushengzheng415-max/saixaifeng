'use strict'

const http = require('http')
const { URL } = require('url')
const callback = require('./index')

const server = http.createServer((request, response) => {
  const currentUrl = new URL(request.url || '/', 'http://127.0.0.1')
  const chunks = []
  request.on('data', chunk => {
    chunks.push(chunk)
    if (Buffer.concat(chunks).length > 1024 * 1024) request.destroy()
  })
  request.on('end', async () => {
    try {
      const result = await callback.main({
        httpMethod: request.method,
        path: currentUrl.pathname,
        queryStringParameters: Object.fromEntries(currentUrl.searchParams.entries()),
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        isBase64Encoded: false
      })
      response.statusCode = Number(result && result.statusCode || 200)
      Object.entries(result && result.headers || {}).forEach(([key, value]) => response.setHeader(key, value))
      const body = result && result.body != null ? result.body : ''
      response.end(String(body))
    } catch (error) {
      console.error('[serviceAccountCallback:http]', error.message || error)
      response.statusCode = 500
      response.setHeader('content-type', 'text/plain; charset=utf-8')
      response.end('failed')
    }
  })
})

server.listen(9000, '0.0.0.0', () => console.log('serviceAccountCallback listening on 9000'))
