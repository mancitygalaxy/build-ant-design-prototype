import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve, relative } from 'node:path'
import { computeSourceFingerprint } from './source-fingerprint.mjs'
import { readProject } from './project-config.mjs'
import { resourceReferences } from './resource-references.mjs'

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
export async function assetManifest(directory) {
  const files = {}
  async function walk(current) {
    for (const name of (await readdir(current)).sort()) {
      const path = resolve(current, name)
      const info = await lstat(path)
      if (info.isSymbolicLink()) throw new Error('交付资源不允许软链接：' + path)
      if (info.isDirectory()) await walk(path)
      else if (info.isFile()) {
        const bytes = await readFile(path)
        files[relative(directory, path).split('\\').join('/')] = { bytes: bytes.length, sha256: sha256(bytes) }
      }
    }
  }
  await walk(directory)
  return files
}
export async function validateAssets(directory, files, mode) {
  if (!files['index.html']) throw new Error('缺少 dist/index.html。')
  if (mode === 'single-html' && Object.keys(files).some((name) => name !== 'index.html')) {
    throw new Error('single-html 必须只含 index.html；分离资源请使用 web。')
  }
  for (const name of Object.keys(files)) {
    const ext = extname(name)
    if (!['.html', '.css', '.js'].includes(ext)) continue
    const source = await readFile(resolve(directory, name), 'utf8')
    const refs = resourceReferences(source, ext)
    for (const ref of refs) {
      if (/^(data:|blob:|#)/i.test(ref)) continue
      if (/^(?:[a-z]+:|\/\/)/i.test(ref)) throw new Error('交付资源不得依赖未打包的外部资源：' + name)
      if (mode === 'single-html') throw new Error('single-html 存在分离资源引用：' + ref)
      const path = resolve(directory, ref.startsWith('/') ? '.' + decodeURIComponent(ref.split(/[?#]/)[0]) : dirname(name) + '/' + decodeURIComponent(ref.split(/[?#]/)[0]))
      const key = relative(directory, path).split('\\').join('/')
      if (key.startsWith('../') || !files[key]) throw new Error('资源引用缺失或越界：' + name + ' -> ' + ref)
    }
  }
}
export async function verifyBuild(root = process.cwd()) {
  const project = await readProject(root)
  const recorded = JSON.parse(await readFile(resolve(root, '.prototype-build-manifest.json'), 'utf8'))
  const source = await computeSourceFingerprint(root)
  const files = await assetManifest(resolve(root, 'dist'))
  if (recorded.schemaVersion !== 2 || source.sha256 !== recorded.source?.sha256 ||
      project.delivery.mode !== recorded.deliveryMode || JSON.stringify(files) !== JSON.stringify(recorded.assets)) {
    throw new Error('源码、配置或完整资源与构建清单不一致，请重新生产构建。')
  }
  await validateAssets(resolve(root, 'dist'), files, project.delivery.mode)
  return { project, source, files }
}

