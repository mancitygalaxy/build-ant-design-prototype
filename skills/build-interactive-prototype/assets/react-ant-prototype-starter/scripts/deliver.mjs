import { cp, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assetManifest, sha256, verifyBuild } from './build-assets.mjs'

const root = process.cwd()
const { project, files, source } = await verifyBuild(root)
const directory = resolve(root, 'delivery')
await mkdir(directory, { recursive: true })
if ((await lstat(directory)).isSymbolicLink()) throw new Error('delivery 不能是软链接。')
const target = resolve(directory, project.delivery.target)
const stamp = Date.now() + '-' + process.pid
const staged = resolve(directory, '.candidate-' + stamp)
const backup = resolve(directory, '.previous-' + stamp)
if (project.delivery.mode === 'web') {
  await cp(resolve(root, 'dist'), staged, { recursive: true })
  if (JSON.stringify(await assetManifest(staged)) !== JSON.stringify(files)) throw new Error('网页资源复制不一致。')
} else {
  await cp(resolve(root, 'dist/index.html'), staged)
  if (sha256(await readFile(staged)) !== files['index.html'].sha256) throw new Error('HTML 复制不一致。')
}
let moved = false
try { await rename(target, backup); moved = true } catch (error) { if (error.code !== 'ENOENT') throw error }
try { await rename(staged, target) } catch (error) {
  if (moved) await rename(backup, target)
  throw error
}
if (project.delivery.mode === 'web') {
  if (JSON.stringify(await assetManifest(target)) !== JSON.stringify(files)) throw new Error('交付后资源回读不一致。')
} else if (sha256(await readFile(target)) !== files['index.html'].sha256) throw new Error('交付后 HTML 回读不一致。')
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({
  schemaVersion: 2, deliveryMode: project.delivery.mode, target: project.delivery.target, source, assets: files,
  previous: moved ? backup : null,
}, null, 2) + '\n')
console.log('DELIVERED mode=' + project.delivery.mode + ' target=' + target)

