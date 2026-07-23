import http from 'node:http'

const PORT = Number(process.env.API_PORT) || 3001

// Map request path → serverless handler module. Mirrors the files under api/.
const ROUTES: Record<string, string> = {
  '/api/curate': '../api/curate.ts',
  '/api/expand-vibe': '../api/expand-vibe.ts',
  '/api/waitlist': '../api/waitlist.ts',
  '/api/discover': '../api/discover.ts',
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const route = req.url ? ROUTES[req.url] : undefined
  if (!route || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)

  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  let responded = false
  const vReq = Object.assign(req, { body })
  const vRes = Object.assign(res, {
    status(code: number) {
      return {
        json(data: unknown) {
          if (!responded) {
            responded = true
            res.writeHead(code, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(data))
          }
        },
      }
    },
    json(data: unknown) {
      if (!responded) {
        responded = true
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      }
    },
  })

  try {
    const { default: handler } = await import(route)
    await handler(vReq as never, vRes as never)
  } catch (err) {
    console.error(err)
    if (!responded) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  }
})

server.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`))
