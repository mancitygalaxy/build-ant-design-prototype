import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright-core'
import { browserEnvironment, configurePage } from './browser-environment.mjs'
import { performStep } from './browser-actions.mjs'
import { compareScreenshotPixels } from './screenshot-pixels.mjs'
import { assetManifest } from './build-assets.mjs'
import { computeSourceFingerprint } from './source-fingerprint.mjs'

const runner = resolve(dirname(fileURLToPath(import.meta.url)), 'browser-regression.mjs')

async function fixtureDirectory(t) {
  const directory = await mkdtemp(resolve(tmpdir(), 'prototype-browser-check-'))
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(directory))
    if (!child.startsWith('prototype-browser-check-') || child.includes(sep) || child.startsWith('..')) throw new Error('拒绝清理隔离目录之外的路径。')
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

// A valid ancillary PNG chunk changes file bytes without changing image pixels.
function withPngComment(png) {
  const text = Buffer.from('review\0same pixels')
  const payload = Buffer.concat([Buffer.from('tEXt'), text])
  let crc = 0xffffffff
  for (const byte of payload) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  const size = Buffer.alloc(4)
  size.writeUInt32BE(text.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([png.subarray(0, -12), size, payload, checksum, png.subarray(-12)])
}

async function testPage(browser, t, config = {}) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><link rel="icon" href="data:,"><style>#first:hover{background:rgb(1,2,3)}</style><button id="first">First</button><button id="second" onclick="this.textContent=\'Done\'">Second</button>')
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const environment = browserEnvironment(config, browser.version())
  const context = await browser.newContext({ ...environment.context, viewport: { width: 800, height: 600 } })
  t.after(async () => {
    await context.close()
    await new Promise((done) => { server.close(done); server.closeAllConnections() })
  })
  const page = await context.newPage()
  await configurePage(page, environment)
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  return page
}

describe('browser environment and screenshot behavior', () => {
  let browser
  before(async () => { browser = await chromium.launch({ headless: true }) })
  after(async () => { if (browser) await browser.close() })

  test('PNG metadata differences pass; a changed pixel and changed dimensions fail', async (t) => {
    const page = await testPage(browser, t)
    const make = async (width, changed) => Buffer.from(await page.evaluate(({ width, changed }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = 2
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'; context.fillRect(0, 0, width, 2)
      if (changed) { context.fillStyle = '#000'; context.fillRect(0, 0, 1, 1) }
      return canvas.toDataURL('image/png').split(',')[1]
    }, { width, changed }), 'base64')
    const original = await make(2, false)
    const metadata = withPngComment(original)
    assert.notDeepEqual(original, metadata)
    assert.equal((await compareScreenshotPixels(page, original, metadata)).changedPixels, 0)
    const changed = await compareScreenshotPixels(page, original, await make(2, true))
    assert.equal(changed.changedPixels, 1)
    assert.match(changed.differenceDataUrl, /^data:image\/png;base64,/)
    const resized = await compareScreenshotPixels(page, original, await make(3, false))
    assert.equal(resized.dimensionMismatch, true)
    assert.equal(resized.changedPixels, 2)
  })

  test('language, timezone, scale, color and fixed date apply in the browser; timers and reload still work', async (t) => {
    const page = await testPage(browser, t, { environment: {
      locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', deviceScaleFactor: 2,
      fixedTime: '2026-01-01T00:00:00.000Z',
    } })
    const inspect = () => page.evaluate(() => ({
      language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      scale: devicePixelRatio, dark: matchMedia('(prefers-color-scheme: dark)').matches, now: new Date().toISOString(),
    }))
    const expected = { language: 'en-GB', timezone: 'Europe/London', scale: 2, dark: true, now: '2026-01-01T00:00:00.000Z' }
    assert.deepEqual(await inspect(), expected)
    assert.equal(await page.evaluate(() => new Promise((done) => setTimeout(() => done('timer-ran'), 20))), 'timer-ran')
    await page.reload()
    assert.deepEqual(await inspect(), expected)
  })

  test('old configuration without environment remains executable', async (t) => {
    const page = await testPage(browser, t)
    assert.deepEqual(await page.evaluate(() => [navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone, devicePixelRatio]), ['zh-CN', 'Asia/Shanghai', 1])
  })

  test('hover, Tab, Enter and focus assertions exercise real interaction', async (t) => {
    const page = await testPage(browser, t)
    const assertions = []
    await performStep(page, { action: 'hover', selector: '#first' }, assertions)
    assert.equal(await page.locator('#first').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(1, 2, 3)')
    await performStep(page, { action: 'focus', selector: '#first' }, assertions)
    await performStep(page, { action: 'press', key: 'Tab' }, assertions)
    await performStep(page, { action: 'assertFocused', selector: '#second' }, assertions)
    await performStep(page, { action: 'press', key: 'Enter' }, assertions)
    await performStep(page, { action: 'assertText', selector: '#second', equals: 'Done' }, assertions)
    await assert.rejects(performStep(page, { action: 'assertFocused', selector: '#first' }, assertions))
  })
})

test('invalid or misspelled environment settings stop instead of using defaults', () => {
  for (const environment of [{ timezone: 'UTC' }, { fixedTime: '2026-01-01' }, { timezoneId: 'invalid-zone' }, { deviceScaleFactor: 0 }]) {
    assert.throws(() => browserEnvironment({ environment }, 'test'))
  }
})

test('runner preserves baselines on failure, reports pixel changes and adopts matching legacy results without replacing screenshots', { timeout: 90000 }, async (t) => {
  const directory = await fixtureDirectory(t)
  await mkdir(resolve(directory, 'dist'))
  const originalHtml = '<!doctype html><title>Fixture</title><link rel="icon" href="data:,"><style>body{background:white}</style><h1 id="result">Ready</h1>'
  const config = { schemaVersion: 1, scenarios: [{ id: 'main', route: '/#/main', viewport: { width: 800, height: 600 },
    steps: [{ action: 'assertText', selector: '#result', equals: 'Ready' }], screenshot: 'main.png' }] }
  await writeFile(resolve(directory, 'prototype.project.json'), JSON.stringify({ schemaVersion: 1, initialized: true, projectId: 'browser-fixture', deliveryFile: 'fixture.html' }))
  async function build(html = originalHtml) {
    await writeFile(resolve(directory, 'index.html'), html)
    await writeFile(resolve(directory, 'dist/index.html'), html)
    await writeFile(resolve(directory, 'prototype.browser.json'), JSON.stringify(config))
    const assets = await assetManifest(resolve(directory, 'dist'))
    await writeFile(resolve(directory, '.prototype-build-manifest.json'), JSON.stringify({ schemaVersion: 2,
      source: await computeSourceFingerprint(directory), deliveryMode: 'single-html', assets, html: assets['index.html'] }))
  }
  function run(...args) {
    const result = spawnSync(process.execPath, [runner, ...args], { cwd: directory, encoding: 'utf8', timeout: 25000 })
    if (result.error) throw result.error
    return result
  }
  const baselinePath = resolve(directory, 'test-baselines/browser-results.json')
  const screenshotPath = resolve(directory, 'test-baselines/screenshots/main.png')
  const reportPath = resolve(directory, 'test-results/browser/report.json')
  await build()
  assert.equal(run().status, 1, 'missing baseline must fail')
  assert.equal(run('--update-baseline').status, 1, 'recording requires explicit confirmation flag')
  const recorded = run('--update-baseline', '--confirm-product-change')
  assert.equal(recorded.status, 0, recorded.stderr)
  const baselineBytes = await readFile(baselinePath)
  const screenshotBytes = await readFile(screenshotPath)
  assert.equal(run().status, 0)

  await build(originalHtml.replace('background:white', 'background:black'))
  const failed = run()
  assert.equal(failed.status, 1, failed.stdout)
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assert.equal(report.status, 'failed')
  assert.ok(report.screenshots[0].changedPixels > 0)
  assert.ok((await readFile(resolve(directory, 'test-results/browser/main.diff.png'))).length > 0)
  assert.deepEqual(await readFile(baselinePath), baselineBytes)
  assert.deepEqual(await readFile(screenshotPath), screenshotBytes)
  await build()
  assert.equal(run().status, 0)

  config.environment = { locale: 'en-US' }
  await build()
  assert.equal(run().status, 1, 'changed environment must not silently compare')
  assert.deepEqual(await readFile(baselinePath), baselineBytes)
  delete config.environment
  await build()
  const current = JSON.parse(baselineBytes)
  const legacy = { schemaVersion: 1, scenarios: current.scenarios.map((item) => ({ ...item, route: new URL('http://localhost' + item.route).hash })) }
  await writeFile(baselinePath, JSON.stringify(legacy))
  assert.equal(run().status, 1, 'legacy metadata needs explicit adoption')
  await build(originalHtml.replace('background:white', 'background:black'))
  assert.equal(run('--adopt-legacy-environment').status, 1, 'legacy adoption cannot accept a visual change')
  assert.deepEqual(JSON.parse(await readFile(baselinePath, 'utf8')), legacy)
  await build()
  const adopted = run('--adopt-legacy-environment')
  assert.equal(adopted.status, 0, adopted.stderr)
  assert.deepEqual(await readFile(screenshotPath), screenshotBytes, 'adoption must keep original PNG bytes')
  assert.ok((await readdir(resolve(directory, 'test-baselines'))).some((name) => name.startsWith('.previous-browser-')))
  assert.equal(run().status, 0)
})
