import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright-core'
import { assetManifest, validateAssets } from './build-assets.mjs'
import { resourceReferences } from './resource-references.mjs'
import { computeSourceFingerprint } from './source-fingerprint.mjs'
import { ready } from './performance-browser.mjs'

// Run from a project with the template dependencies and its pinned Chromium:
// node --test scripts/tooling-regressions.test.mjs
// TMPDIR may point at a task-owned directory; every fixture is removed after its test.
async function temporaryDirectory(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'prototype-tooling-regression-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function put(directory, name, content) {
  const path = resolve(directory, name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const resourceCases = [
  {
    name: 'unquoted HTML script source', extension: '.html',
    source: '<script type=module src=/module.js></script>',
    assets: { 'module.js': 'export const loaded = true' },
    references: ['/module.js'],
  },
  {
    name: 'both image srcset candidates', extension: '.html',
    source: '<img srcset="/small.png 1x, /large.png 2x">',
    assets: { 'small.png': image, 'large.png': image },
    references: ['/small.png', '/large.png'],
  },
  {
    name: 'CSS string import', extension: '.css', filename: 'main.css',
    entry: '<link rel="stylesheet" href="./main.css">',
    source: '@import "./theme.css";', assets: { 'theme.css': 'body { color: black; }' },
    references: ['./theme.css'],
  },
  {
    name: 'absolute JavaScript import', extension: '.js', filename: 'main.js',
    entry: '<script type="module" src="./main.js"></script>',
    source: 'import "/module.js";', assets: { 'module.js': 'export const loaded = true' },
    references: ['/module.js'],
  },
  {
    name: 'external SVG symbol reference', extension: '.html',
    source: '<svg><use href="/sprite.svg#item"></use></svg>',
    assets: { 'sprite.svg': '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="item"><path d="M0 0h1v1H0z"/></symbol></svg>' },
    references: ['/sprite.svg#item'],
  },
  {
    name: 'responsive image preload', extension: '.html',
    source: '<link rel="preload" as="image" imagesrcset="/small.png 1x, /large.png 2x">',
    assets: { 'small.png': image, 'large.png': image },
    references: ['/small.png', '/large.png'],
  },
]

for (const fixture of resourceCases) {
  test(`resource completeness: ${fixture.name}`, async (t) => {
    const directory = await temporaryDirectory(t)
    const filename = fixture.filename ?? 'index.html'
    await put(directory, 'index.html', fixture.entry ?? fixture.source)
    if (filename !== 'index.html') await put(directory, filename, fixture.source)

    assert.deepEqual(new Set(resourceReferences(fixture.source, fixture.extension)), new Set(fixture.references))
    await assert.rejects(validateAssets(directory, await assetManifest(directory), 'web'))

    // Each declared file must be required; one recognized candidate must not hide another.
    for (const [name, content] of Object.entries(fixture.assets)) await put(directory, name, content)
    await assert.doesNotReject(validateAssets(directory, await assetManifest(directory), 'web'))
    for (const [name, content] of Object.entries(fixture.assets)) {
      await rm(resolve(directory, name))
      await assert.rejects(validateAssets(directory, await assetManifest(directory), 'web'))
      await put(directory, name, content)
    }
  })
}

test('canonical metadata is not a downloaded resource in either delivery mode', async (t) => {
  const directory = await temporaryDirectory(t)
  const html = '<!doctype html><link rel="canonical" href="https://example.invalid/article"><h1>Ready</h1>'
  await put(directory, 'index.html', html)
  assert.deepEqual(resourceReferences(html, '.html'), [])
  const files = await assetManifest(directory)
  await assert.doesNotReject(validateAssets(directory, files, 'web'))
  await assert.doesNotReject(validateAssets(directory, files, 'single-html'))
})

test('an explicit project root includes nested source and public files independently of cwd', async (t) => {
  const directory = await temporaryDirectory(t)
  assert.notEqual(directory, process.cwd())
  await put(directory, 'src/nested/main.js', 'export const value = 1\n')
  await put(directory, 'public/nested/data.json', '{"value":1}\n')

  const before = await computeSourceFingerprint(directory)
  const paths = before.files.map((path) => path.split(sep).join('/')).sort()
  assert.deepEqual(paths, ['public/nested/data.json', 'src/nested/main.js'])
  await put(directory, 'src/nested/main.js', 'export const value = 2\n')
  assert.notEqual((await computeSourceFingerprint(directory)).sha256, before.sha256)
})

test('a public input content change invalidates the fingerprint and restoration recovers it', async (t) => {
  const directory = await temporaryDirectory(t)
  await put(directory, 'src/main.js', 'export const value = 1\n')
  const original = '{"value":1}\n'
  await put(directory, 'public/data.json', original)
  const before = await computeSourceFingerprint(directory)
  await put(directory, 'public/data.json', '{"value":2}\n')
  assert.notEqual((await computeSourceFingerprint(directory)).sha256, before.sha256)
  await put(directory, 'public/data.json', original)
  assert.equal((await computeSourceFingerprint(directory)).sha256, before.sha256)
})

async function withLocalPage(t, browser, body, check) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body>' + body + '</body></html>'
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    response.end(html)
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); done() })
  })
  t.after(() => new Promise((done, reject) => {
    server.close((error) => error ? reject(error) : done())
    server.closeAllConnections()
  }))
  const context = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' })
    await check(page)
  } finally { await context.close() }
}

describe('browser result readiness', { timeout: 30000 }, () => {
  let browser
  before(async () => { browser = await chromium.launch({ headless: true }) })
  after(async () => { if (browser) await browser.close() })

  test('matching hidden text cannot complete readiness; revealing it can', async (t) => {
    await withLocalPage(t, browser,
      '<div id="result" style="display:none">100</div><button id="run">Next</button>',
      async (page) => {
        const assertions = [{ selector: '#result', equals: '100' }, { selector: '#run', enabled: true }]
        assert.equal(await page.locator('#result').isVisible(), false)
        // The state stays hidden until the test reveals it; no machine-speed threshold is asserted.
        await assert.rejects(ready(page, assertions, 800), { name: 'TimeoutError' })
        await page.locator('#result').evaluate((element) => { element.style.display = 'block' })
        await ready(page, assertions, 5000)
        assert.equal(await page.locator('#result').isVisible(), true)
      })
  })

  test('a button disabled by its fieldset cannot complete readiness; enabling the fieldset can', async (t) => {
    await withLocalPage(t, browser,
      '<div id="result">100</div><fieldset id="controls" disabled><button id="run">Next</button></fieldset>',
      async (page) => {
        const assertions = [{ selector: '#result', equals: '100' }, { selector: '#run', enabled: true }]
        assert.equal(await page.locator('#run').evaluate((element) => element.disabled), false)
        assert.equal(await page.locator('#run').isEnabled(), false)
        await assert.rejects(ready(page, assertions, 800), { name: 'TimeoutError' })
        await page.locator('#controls').evaluate((element) => { element.disabled = false })
        await ready(page, assertions, 5000)
        assert.equal(await page.locator('#run').isEnabled(), true)
      })
  })
})
