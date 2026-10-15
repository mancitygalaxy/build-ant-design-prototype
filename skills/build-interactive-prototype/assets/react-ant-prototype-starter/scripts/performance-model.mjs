import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export const digest = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
export const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
export const metrics = ['durationMs', 'requestCount', 'transferBytes', 'resourceBytes']
const finite = (n) => Number.isFinite(n) && n >= 0
export function validateConfig(config) {
  if (config.schemaVersion !== 1 || typeof config.environmentId !== 'string' || !config.environmentId.trim()) throw new Error('必须登记 environmentId 和 schemaVersion=1。')
  if (!Array.isArray(config.scenarios) || !config.scenarios.length) throw new Error('必须登记性能场景。')
  const settings = { runs: 5, regressionPercent: 20, regressionMs: 100, timeoutMs: 15000, observationMs: 200, ...config.measurement }
  if (!Number.isInteger(settings.runs) || settings.runs < 3 || settings.runs % 2 !== 1) throw new Error('runs 必须是至少 3 的奇数，默认 5。')
  for (const key of ['regressionPercent', 'regressionMs', 'timeoutMs', 'observationMs']) {
    if (!finite(settings[key])) throw new Error('无效测量参数：' + key)
  }
  if (!settings.timeoutMs) throw new Error('timeoutMs 必须大于 0。')
  const ids = new Set()
  for (const scenario of config.scenarios) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(scenario.id ?? '') || ids.has(scenario.id)) throw new Error('场景 ID 无效或重复。')
    ids.add(scenario.id)
    if (!['navigation', 'interaction'].includes(scenario.kind)) throw new Error('kind 必须为 navigation 或 interaction。')
    if (typeof scenario.route !== 'string' || !scenario.route.startsWith('/') || scenario.route.startsWith('//')) throw new Error('route 必须是本地绝对路径。')
    if (!['first-visit', 'repeat-visit'].includes(scenario.cache?.browser)) throw new Error('必须登记浏览器访问条件。')
    if (!['unknown', 'not-applicable-static'].includes(scenario.cache?.server)) throw new Error('模板不控制后端缓存；登记 unknown 或静态不适用，不能声称服务端冷启动。')
    if (!scenario.fixture?.label || !Number.isInteger(scenario.fixture.size) || scenario.fixture.size < 1 ||
        !Array.isArray(scenario.fixture.files) || !scenario.fixture.files.length) throw new Error('必须登记实际样本文件、标签和规模。')
    if (!scenario.ready?.length || scenario.ready.some((r) => !r.selector ||
        (r.equals === undefined && r.count === undefined && r.enabled !== true))) throw new Error('必须登记可用结果断言，不能只等待框架出现。')
    if (scenario.kind === 'interaction' && !scenario.actions?.length) throw new Error('交互场景缺少操作。')
    for (const metric of metrics) {
      if (!finite(scenario.budget?.[metric])) throw new Error('缺少有效预算：' + scenario.id + '.' + metric)
      const debt = scenario.existingDebt?.[metric]
      if (debt && (!finite(debt.ceiling) || debt.ceiling < scenario.budget[metric] || !debt.reason || !debt.evidence)) throw new Error('历史问题必须登记证据、原因和不增长上限。')
    }
    if (!scenario.budget.durationMs) throw new Error('耗时目标必须大于 0。')
  }
  return settings
}
export async function scenarioContract(root, scenario, settings) {
  const fixtureHashes = {}
  const realRoot = await realpath(root)
  for (const file of scenario.fixture.files) {
    const target = await realpath(resolve(root, file))
    if (!target.startsWith(realRoot + sep)) throw new Error('样本文件必须位于项目内。')
    fixtureHashes[file] = digest(await readFile(target))
  }
  return { hash: digest({ scenario, settings, fixtureHashes }), fixtureHashes }
}
export function summarize(samples) {
  if (!samples.length || samples.some((s) => metrics.some((key) => !finite(s[key])))) throw new Error('测量不完整。')
  return Object.fromEntries(metrics.map((key) => [key, median(samples.map((sample) => sample[key]))]))
}
export function timingRegression(now, before, settings) {
  const delta = now - before
  return delta >= settings.regressionMs && delta > before * settings.regressionPercent / 100
}
export function evaluateScenario(scenario, round, previous, settings) {
  const failures = []
  const historical = []
  // Non-time budgets use the worst observed sample; one duplicate request must not disappear in a median.
  for (const metric of metrics) {
    const value = metric === 'durationMs' ? round.summary[metric] : Math.max(...round.samples.map((s) => s[metric]))
    const limit = scenario.existingDebt?.[metric]?.ceiling ?? scenario.budget[metric]
    if (value > limit) failures.push({ metric, actual: value, limit })
    else if (value > scenario.budget[metric]) historical.push({ metric, actual: value, target: scenario.budget[metric], ...scenario.existingDebt[metric] })
  }
  return { failures, historical, needsRetest: !!previous && timingRegression(round.summary.durationMs, previous.summary.durationMs, settings) }
}

