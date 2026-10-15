import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { arch, cpus, platform, release } from 'node:os'
import { chromium } from 'playwright-core'
import { verifyBuild } from './build-assets.mjs'
import { startPreview } from './preview-server.mjs'
import { digest, evaluateScenario, scenarioContract, summarize, timingRegression, validateConfig } from './performance-model.mjs'
import { measureSample } from './performance-browser.mjs'

const root = process.cwd()
const record = process.argv.includes('--record-baseline')
const replace = process.argv.includes('--replace-baseline')
const reason = process.argv.find((arg) => arg.startsWith('--reason='))?.slice(9)
const selection = process.argv.find((arg) => arg.startsWith('--scenarios='))?.slice(12).split(',')
const output = resolve(root, 'test-results/performance')
await mkdir(output, { recursive: true })
const report = { schemaVersion: 1, status: 'blocked', createdAt: new Date().toISOString(), scenarios: [] }
let browser
let server
try {
  const config = JSON.parse(await readFile(resolve(root, 'prototype.performance.json'), 'utf8'))
  const settings = validateConfig(config)
  const environmentId = process.env.PROTOTYPE_PERFORMANCE_ENVIRONMENT ?? config.environmentId
  if (!/^[a-zA-Z0-9_-]+$/.test(environmentId)) throw new Error('environmentId 只能使用字母、数字、下划线或连字符。')
  const baselineFile = resolve(root, 'test-baselines/performance', environmentId + '.json')
  let previous
  try { previous = JSON.parse(await readFile(baselineFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (record && selection) throw new Error('记录基线必须覆盖已登记的全部场景。')
  if (record && previous && (!replace || !reason?.trim())) throw new Error('基线已存在；变更必须显式 --replace-baseline --reason=原因，技术优化不得重写。')
  if (!record && !previous) {
    report.status = 'needs-baseline'
    throw new Error('缺少冻结基线。先登记目标并记录基线，再运行检查；记录成功不等于达标。')
  }
  const { project, source, files } = await verifyBuild(root)
  const resourceBytes = Object.values(files).reduce((sum, file) => sum + file.bytes, 0)
  browser = await chromium.launch({ headless: true })
  const preview = await startPreview(root)
  server = preview.server
  const runnerFiles = ['check-performance.mjs', 'performance-model.mjs', 'performance-browser.mjs', 'preview-server.mjs']
  const runnerHash = digest(await Promise.all(runnerFiles.map(async (name) => digest(await readFile(resolve(root, 'scripts', name))))))
  const environment = { environmentId, browser: browser.version(), platform: platform(), osRelease: release(),
    arch: arch(), cpu: cpus()[0]?.model, nodeMajor: process.versions.node.split('.')[0],
    deliveryMode: project.delivery.mode, projectId: project.projectId, runnerHash,
    server: 'loopback-static-production-build', transferMetric: 'cdp-encoded-response-bytes-including-headers' }
  Object.assign(report, { environment, source, settings })
  if (!record && (previous.schemaVersion !== 1 || digest(environment) !== digest(previous.environment))) {
    throw new Error('基线环境、浏览器、执行器或交付模式不同，结果不可比较。保留旧记录，建立同条件证据。')
  }
  const scenarios = selection ? config.scenarios.filter((scenario) => selection.includes(scenario.id)) : config.scenarios
  if (!scenarios.length || (selection && scenarios.length !== new Set(selection).size)) throw new Error('选择了不存在的性能场景。')
  // Compare every input before running any scenario, so mixed input cannot produce a partial pass.
  const contracts = new Map()
  for (const scenario of scenarios) {
    const contract = await scenarioContract(root, scenario, settings)
    contracts.set(scenario.id, contract)
    const old = previous?.scenarios.find((item) => item.id === scenario.id)
    if (!record && (!old || old.contract.hash !== contract.hash)) throw new Error('场景 ' + scenario.id + ' 的输入、规模、完成条件或预算不同，无法比较。')
  }
  for (const scenario of scenarios) {
    async function round() {
      const samples = []
      for (let index = 0; index < settings.runs; index++) samples.push(await measureSample(browser, preview.origin, scenario, settings, resourceBytes))
      return { samples, summary: summarize(samples) }
    }
    const first = await round()
    const old = previous?.scenarios.find((item) => item.id === scenario.id)
    const result = evaluateScenario(scenario, first, record ? undefined : old, settings)
    const entry = { id: scenario.id, fixture: scenario.fixture, cache: scenario.cache,
      viewport: scenario.viewport ?? { width: 1280, height: 800 },
      contract: contracts.get(scenario.id), ...first, ...result, status: 'passed' }
    if (!record && result.needsRetest) {
      entry.retest = await round()
      const second = evaluateScenario(scenario, entry.retest, old, settings)
      entry.failures.push(...second.failures.map((failure) => ({ ...failure, round: 2 })))
      if (timingRegression(entry.retest.summary.durationMs, old.summary.durationMs, settings)) {
        entry.failures.push({ metric: 'timingRegression', baseline: old.summary.durationMs,
          first: first.summary.durationMs, second: entry.retest.summary.durationMs })
      }
    }
    if (entry.failures.length) entry.status = 'failed'
    else if (entry.historical.length) entry.status = 'passed-with-existing-debt'
    report.scenarios.push(entry)
  }
  if (record) {
    // Preserve the previous record and never write baseline from normal checks.
    await mkdir(resolve(root, 'test-baselines/performance'), { recursive: true })
    if (previous) await copyFile(baselineFile, baselineFile + '.previous-' + Date.now())
    report.status = 'baseline-recorded'
    report.reason = reason ?? 'initial-record'
    report.targetAssessment = report.scenarios.some((item) => item.status === 'failed') ? 'failed' :
      report.scenarios.some((item) => item.historical.length) ? 'existing-debt' : 'within-budget'
    await writeFile(baselineFile, JSON.stringify(report, null, 2) + '\n')
    console.log('PERFORMANCE_BASELINE_RECORDED targetAssessment=' + report.targetAssessment + '; run check:performance to verify')
  } else {
    report.status = report.scenarios.some((item) => item.status === 'failed') ? 'failed' :
      report.scenarios.some((item) => item.historical.length) ? 'passed-with-existing-debt' : 'passed'
    console.log('PERFORMANCE_' + report.status.toUpperCase().replaceAll('-', '_') + ' scenarios=' + report.scenarios.length)
    if (report.status === 'failed') process.exitCode = 1
  }
} catch (error) {
  report.error = error.message
  console.error('PERFORMANCE_' + report.status.toUpperCase().replaceAll('-', '_') + ' ' + error.message)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((done) => server.close(done))
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}

