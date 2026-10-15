import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assetManifest, validateAssets } from './build-assets.mjs'
import { computeSourceFingerprint } from './source-fingerprint.mjs'
import { readProject } from './project-config.mjs'

const root = process.cwd()
const project = await readProject(root)
const assets = await assetManifest(resolve(root, 'dist'))
await validateAssets(resolve(root, 'dist'), assets, project.delivery.mode)
const source = await computeSourceFingerprint(root)
await writeFile(resolve(root, '.prototype-build-manifest.json'), JSON.stringify({
  schemaVersion: 2, source, deliveryMode: project.delivery.mode, assets, html: assets['index.html'],
}, null, 2) + '\n')
console.log('BUILD_MANIFEST_WRITTEN mode=' + project.delivery.mode + ' files=' + Object.keys(assets).length)

