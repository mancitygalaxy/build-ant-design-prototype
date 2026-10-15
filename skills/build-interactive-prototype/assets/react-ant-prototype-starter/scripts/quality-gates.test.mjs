import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { deliveryConfig } from './project-config.mjs'
import { assetManifest, validateAssets } from './build-assets.mjs'
import { evaluateScenario, median, scenarioContract, summarize, timingRegression, validateConfig } from './performance-model.mjs'
import { startPreview } from './preview-server.mjs'

const scenario = { id: 'students', kind: 'navigation', route: '/', fixture: { label: 'students-v1', size: 100, files: ['data.json'] },
  cache: { browser: 'first-visit', server: 'unknown' }, ready: [{ selector: '#count', equals: '100' }],
  budget: { durationMs: 2000, requestCount: 2, transferBytes: 10000, resourceBytes: 20000 } }
const config = { schemaVersion: 1, environmentId: 'local', scenarios: [scenario] }
const settings = validateConfig(config)
const samples = (durations, requests = 1) => durations.map((durationMs) => ({ durationMs, requestCount: requests, transferBytes: 2000, resourceBytes: 4000 }))
const round = (values, requests) => { const s = samples(values, requests); return { samples: s, summary: summarize(s) } }

test('legacy config defaults to single HTML; web requires a directory', () => {
  assert.deepEqual(deliveryConfig({ deliveryFile: 'preview.html' }), { mode: 'single-html', target: 'preview.html' })
  assert.deepEqual(deliveryConfig({ deliveryMode: 'web', deliveryDirectory: 'site' }), { mode: 'web', target: 'site' })
  for (const target of ['../site', '/tmp/site', '.', 'manifest.json', 'C:\\site']) {
    assert.throws(() => deliveryConfig({ deliveryMode: 'web', deliveryDirectory: target }))
  }
  assert.throws(() => deliveryConfig({ deliveryMode: 'invalid', deliveryFile: 'x.html' }))
})
test('five-run median resists one noisy sample', () => {
  assert.equal(median([120, 100, 20000, 110, 130]), 120)
  assert.equal(settings.runs, 5)
})
test('timing requires both relative and absolute regression', () => {
  assert.equal(timingRegression(1250, 1000, settings), true)
  assert.equal(timingRegression(1200, 1000, settings), false)
  assert.equal(timingRegression(280, 200, settings), false)
  assert.equal(timingRegression(300, 200, settings), true)
})
test('first timing regression requests independent retest; recovered round is not a confirmed regression', () => {
  const before = round([1000, 1001, 1000, 999, 998])
  assert.equal(evaluateScenario(scenario, round([1300, 1301, 1302, 1300, 1300]), before, settings).needsRetest, true)
  assert.equal(evaluateScenario(scenario, round([1005, 1002, 1003, 1004, 1001]), before, settings).needsRetest, false)
})
test('request and bytes budgets catch a single extra burst, not only median', () => {
  const r = round([100, 101, 99, 98, 102])
  r.samples[0].requestCount = 3
  r.samples[4].transferBytes = 10001
  const result = evaluateScenario(scenario, r, undefined, settings)
  assert.deepEqual(result.failures.map((x) => x.metric), ['requestCount', 'transferBytes'])
})
test('registered old debt remains visible while growth fails', () => {
  const s = { ...scenario, budget: { ...scenario.budget, durationMs: 100 },
    existingDebt: { durationMs: { ceiling: 500, reason: '旧加载慢', evidence: 'before.json' } } }
  const result = evaluateScenario(s, round([400, 410, 420, 400, 390]), undefined, settings)
  assert.equal(result.failures.length, 0)
  assert.equal(result.historical.length, 1)
  assert.equal(evaluateScenario(s, round([510, 520, 530, 540, 550]), undefined, settings).failures.length, 1)
})
test('missing goals, fake cold-server declaration and empty readiness are blocked', () => {
  for (const s of [{ ...scenario, budget: {} }, { ...scenario, ready: [{ selector: '#shell' }] },
    { ...scenario, cache: { browser: 'first-visit', server: 'cold' } }]) {
    assert.throws(() => validateConfig({ ...config, scenarios: [s] }))
  }
})
test('source code can change; sample content or input contract cannot silently change', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'prototype-contract-'))
  try {
    await writeFile(resolve(dir, 'data.json'), '[1,2,3]')
    const before = await scenarioContract(dir, scenario, settings)
    await writeFile(resolve(dir, 'app.js'), 'changed implementation')
    assert.equal((await scenarioContract(dir, scenario, settings)).hash, before.hash)
    await writeFile(resolve(dir, 'data.json'), '[1,2]')
    assert.notEqual((await scenarioContract(dir, scenario, settings)).hash, before.hash)
    await writeFile(resolve(dir, 'data.json'), '[1,2,3]')
    assert.notEqual((await scenarioContract(dir, { ...scenario, fixture: { ...scenario.fixture, size: 10 } }, settings)).hash, before.hash)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('web assets validate, serve JavaScript and reject missing references; single HTML rejects splitting', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'prototype-assets-'))
  let server
  try {
    const dist = resolve(root, 'dist')
    await mkdir(resolve(dist, 'assets'), { recursive: true })
    await writeFile(resolve(dist, 'index.html'), '<script type="module" src="./assets/app.js"></script>')
    await writeFile(resolve(dist, 'assets/app.js'), 'document.title="ready"')
    const files = await assetManifest(dist)
    await validateAssets(dist, files, 'web')
    await assert.rejects(validateAssets(dist, files, 'single-html'))
    const preview = await startPreview(root)
    server = preview.server
    const response = await fetch(preview.origin + '/assets/app.js')
    assert.match(response.headers.get('content-type'), /javascript/)
    assert.match(await response.text(), /ready/)
    assert.equal((await fetch(preview.origin + '/assets/missing.js')).status, 404)
    assert.equal((await fetch(preview.origin + '/deep/route')).status, 200)
    await rm(resolve(dist, 'assets/app.js'))
    await assert.rejects(validateAssets(dist, await assetManifest(dist), 'web'))
  } finally {
    if (server) await new Promise((done) => server.close(done))
    await rm(root, { recursive: true, force: true })
  }
})

