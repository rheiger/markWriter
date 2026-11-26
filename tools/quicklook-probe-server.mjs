// Loopback-only synthetic probe endpoint. The caller terminates this process.
import { appendFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
const [, , portFile, requestLog] = process.argv
const server = createServer((request, response) => {
  appendFileSync(requestLog, `${request.url}\n`)
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('SYNTHETIC-NETWORK-SENTINEL')
})
server.listen(0, '127.0.0.1', () => writeFileSync(portFile, String(server.address().port)))
