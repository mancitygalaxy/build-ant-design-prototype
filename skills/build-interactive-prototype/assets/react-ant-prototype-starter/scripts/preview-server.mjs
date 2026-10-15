import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }
export async function startPreview(root = process.cwd()) {
  const directory = await realpath(resolve(root, 'dist'))
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      let file = resolve(directory, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname))
      if (file !== directory && !file.startsWith(directory + sep)) throw new Error('outside dist')
      try { await stat(file) } catch (error) {
        if (error.code === 'ENOENT' && !extname(pathname)) file = resolve(directory, 'index.html')
        else throw error
      }
      file = await realpath(file)
      if (!file.startsWith(directory + sep)) throw new Error('outside dist')
      const body = await readFile(file)
      response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream',
        'content-length': body.length, 'cache-control': 'public, max-age=3600' })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('Not found')
    }
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  return { server, origin: 'http://127.0.0.1:' + server.address().port }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { origin } = await startPreview()
  console.log('PRODUCTION_PREVIEW ' + origin)
}

