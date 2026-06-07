import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const maxCount = Number.parseInt(process.env.EDM_MAX_UPLOAD_COUNT || '5', 10)
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify({ maxCount }))
}
