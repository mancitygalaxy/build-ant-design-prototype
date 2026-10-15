import { startPreview } from './preview-server.mjs'
import { verifyBuild } from './build-assets.mjs'
import { stableScreenshot } from './stable-screenshot.mjs'
import { browserEnvironment, assertComparableEnvironment, configurePage } from './browser-environment.mjs'
import { performStep } from './browser-actions.mjs'
import { compareScreenshotPixels } from './screenshot-pixels.mjs'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = process.cwd()
const updateBaseline = process.argv.includes('--update-baseline')
const adoptLegacy = process.argv.includes('--adopt-legacy-environment')
const confirmed = process.argv.includes('--confirm-product-change')
let outputRoot = resolve(root, 'test-results/browser')
const report = { status: 'failed', scenarios: [], screenshots: [] }

async function saveReport() {
  await mkdir(outputRoot, { recursive: true })
  await writeFile(resolve(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}

async function main() {
  if (updateBaseline && !confirmed) throw new Error('更新浏览器基线必须显式追加 --confirm-product-change；该参数不能代替用户授权。')
  if (updateBaseline && adoptLegacy) throw new Error('建立新基线与补充旧基线环境不能同时执行。')
  const config = JSON.parse(await readFile(resolve(root, 'prototype.browser.json'), 'utf8'))
  if (config.schemaVersion !== 1 || !Array.isArray(config.scenarios) || config.scenarios.length === 0) {
    throw new Error('prototype.browser.json 必须登记至少一个浏览器场景。')
  }
  const names = new Set()
  const ids = new Set()
  for (const scenario of config.scenarios) {
    const name = scenario.screenshot ?? `${scenario.id}.png`
    if (!/^[a-zA-Z0-9_.-]+\.png$/.test(name) || name.startsWith('.')) throw new Error('截图名称必须是单个 PNG 文件名。')
    if (!scenario.id || ids.has(scenario.id) || names.has(name)) throw new Error('浏览器场景 ID 和截图文件名必须各自唯一。')
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new Error('浏览器场景必须有实际操作步骤。')
    names.add(name)
    ids.add(scenario.id)
  }
  await verifyBuild(root)
  const { server, origin } = await startPreview(root)
  let browser
  try {
    try { browser = await chromium.launch({ headless: true }) }
    catch (error) { throw new Error('固定版 Chromium 启动失败，请先执行 pnpm exec playwright-core install chromium-headless-shell。', { cause: error }) }
    const environment = browserEnvironment(config, browser.version())
    report.environment = environment
    const named = environment.environmentId !== 'default'
    const baselineRoot = named ? resolve(root, 'test-baselines/browser', environment.environmentId) : resolve(root, 'test-baselines')
    const baselineFile = resolve(baselineRoot, 'browser-results.json')
    const screenshotRoot = resolve(baselineRoot, 'screenshots')
    outputRoot = named ? resolve(root, 'test-results/browser', environment.environmentId) : outputRoot
    await mkdir(outputRoot, { recursive: true })
    let baseline
    if (!updateBaseline) {
      try { baseline = JSON.parse(await readFile(baselineFile, 'utf8')) }
      catch (error) { throw new Error('浏览器基线缺失或不可读取。首次制作先检查页面并记录参考；普通回归不能自动建立基线。', { cause: error }) }
      assertComparableEnvironment(baseline, environment, adoptLegacy)
    }
    // Pixel decoding runs in a separate blank page, isolated from application code.
    const comparisonPage = await browser.newPage()
    const results = []
    for (const scenario of config.scenarios) {
      const context = await browser.newContext({ ...environment.context, viewport: scenario.viewport })
      try {
        const page = await context.newPage()
        await configurePage(page, environment)
        page.setDefaultTimeout(config.timeoutMs ?? 15000)
        page.setDefaultNavigationTimeout(config.timeoutMs ?? 15000)
        const externalRequests = []
        const consoleProblems = []
        page.on('request', (request) => {
          if (!request.url().startsWith(origin)) externalRequests.push(request.url())
        })
        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`)
        })
        page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`))
        const route = scenario.route ?? ''
        if (route.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(route)) throw new Error('浏览器场景只允许本地路由。')
        await page.goto(origin + (route.startsWith('/') ? route : '/' + route), { waitUntil: 'networkidle' })
        const assertions = []
        for (const step of scenario.steps) await performStep(page, step, assertions)
        const storage = {}
        for (const key of scenario.storageKeys ?? []) storage[key] = await page.evaluate((name) => sessionStorage.getItem(name), key)
        const name = scenario.screenshot ?? `${scenario.id}.png`
        const png = await stableScreenshot(page, config.timeoutMs ?? 15000)
        await writeFile(resolve(outputRoot, name), png)
        if (!updateBaseline) {
          const expected = await readFile(resolve(screenshotRoot, name))
          const { differenceDataUrl, ...comparison } = await compareScreenshotPixels(comparisonPage, expected, png)
          const evidence = { id: scenario.id, ...comparison }
          if (differenceDataUrl) {
            const differenceFile = name.replace(/\.png$/, '.diff.png')
            await writeFile(resolve(outputRoot, differenceFile), Buffer.from(differenceDataUrl.split(',')[1], 'base64'))
            evidence.differenceFile = differenceFile
          }
          report.screenshots.push(evidence)
        }
        const url = new URL(page.url())
        results.push({
          id: scenario.id, viewport: scenario.viewport, title: await page.title(),
          route: url.pathname + url.search + url.hash, assertions, storage,
          ...(scenario.localStorageKeys?.length ? { localStorage: await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), scenario.localStorageKeys) } : {}),
          externalRequests, consoleProblems,
        })
      } finally { await context.close() }
    }
    await comparisonPage.close()
    report.scenarios = results
    const actual = { schemaVersion: 2, environment, scenarios: results }
    await writeFile(resolve(outputRoot, 'browser-results.json'), JSON.stringify(actual, null, 2) + '\n')
    if (results.some((item) => item.consoleProblems.length || item.externalRequests.length)) throw new Error('浏览器存在错误、警告或未登记的外部请求，不能建立或通过基线。')
    if (!updateBaseline) {
      // Version 1 stored only the URL hash. Compare in its original format before
      // recording the full route; this never substitutes new screenshots.
      const comparable = adoptLegacy
        ? { schemaVersion: 1, scenarios: results.map((item) => ({ ...item, route: new URL('http://localhost' + item.route).hash })) }
        : actual
      if (JSON.stringify(comparable) !== JSON.stringify(baseline)) throw new Error('浏览器操作结果与冻结基线不一致。')
      if (report.screenshots.some((item) => item.changedPixels > 0 || item.dimensionMismatch)) throw new Error('截图存在像素或尺寸变化，查看 report.json 和对应 .diff.png。')
    }
    if (updateBaseline || adoptLegacy) {
      let previous
      try { previous = await readFile(baselineFile) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (previous) {
        const archive = resolve(baselineRoot, '.previous-browser-' + randomUUID())
        await mkdir(archive, { recursive: true })
        await writeFile(resolve(archive, 'browser-results.json'), previous)
        await cp(screenshotRoot, resolve(archive, 'screenshots'), { recursive: true })
        report.previousBaseline = archive
      }
      await mkdir(screenshotRoot, { recursive: true })
      if (updateBaseline) {
        for (const name of names) await copyFile(resolve(outputRoot, name), resolve(screenshotRoot, name))
      }
      await writeFile(baselineFile, JSON.stringify(actual, null, 2) + '\n')
      report.status = adoptLegacy ? 'legacy-environment-adopted' : 'baseline-recorded'
      console.log(`${adoptLegacy ? 'BROWSER_LEGACY_ENVIRONMENT_ADOPTED' : 'BROWSER_BASELINE_UPDATED'} scenarios=${results.length}`)
    } else {
      report.status = 'passed'
      console.log(`BROWSER_REGRESSION_PASSED scenarios=${results.length} pixelDiff=0`)
    }
    await saveReport()
  } finally {
    if (browser) await browser.close()
    await new Promise((done) => { server.close(done); server.closeAllConnections() })
  }
}

await main().catch(async (error) => {
  report.error = error.message
  await saveReport()
  console.error('BROWSER_REGRESSION_ERROR ' + error.message)
  process.exitCode = 1
})
