import { arch, platform, release } from 'node:os'

// Missing options keep old configuration files usable. The baseline records the
// resolved values so a later machine or configuration change cannot pass silently.
export function browserEnvironment(config, browserVersion) {
  const settings = config.environment ?? {}
  const allowed = new Set(['locale', 'timezoneId', 'colorScheme', 'deviceScaleFactor', 'fixedTime'])
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) throw new Error(`未知浏览器环境设置：${key}`)
  }
  const context = {
    locale: settings.locale ?? 'zh-CN',
    timezoneId: settings.timezoneId ?? 'Asia/Shanghai',
    colorScheme: settings.colorScheme ?? 'light',
    deviceScaleFactor: settings.deviceScaleFactor ?? 1,
  }
  if (typeof context.locale !== 'string' || !context.locale.trim()) throw new Error('locale 必须是语言名称。')
  if (typeof context.timezoneId !== 'string' || !context.timezoneId.trim()) throw new Error('timezoneId 必须是时区名称。')
  new Intl.DateTimeFormat(context.locale, { timeZone: context.timezoneId })
  if (!['light', 'dark', 'no-preference'].includes(context.colorScheme)) throw new Error('colorScheme 必须是 light、dark 或 no-preference。')
  if (!Number.isFinite(context.deviceScaleFactor) || context.deviceScaleFactor <= 0) throw new Error('deviceScaleFactor 必须大于 0。')
  let fixedTime = settings.fixedTime ?? null
  if (fixedTime !== null) {
    if (typeof fixedTime !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(fixedTime) || !Number.isFinite(Date.parse(fixedTime))) {
      throw new Error('fixedTime 必须包含时区，例如 2026-01-01T00:00:00.000Z；无需固定日期时使用 null。')
    }
    fixedTime = new Date(fixedTime).toISOString()
  }
  const environmentId = process.env.PROTOTYPE_BROWSER_ENVIRONMENT ?? config.environmentId ?? 'default'
  if (!/^[a-zA-Z0-9_-]+$/.test(environmentId)) throw new Error('environmentId 只能使用字母、数字、下划线或连字符。')
  return {
    environmentId, context, fixedTime,
    browser: browserVersion, platform: platform(), osRelease: release(), arch: arch(),
  }
}

export function assertComparableEnvironment(baseline, environment, adoptLegacy = false) {
  if (baseline.schemaVersion === 1 && !baseline.environment) {
    if (adoptLegacy) return 'legacy'
    throw new Error('旧浏览器基线没有环境记录。先保持改前页面、数据和环境，运行 pnpm run test:browser --adopt-legacy-environment；仅当前后结果与截图一致时补充记录。')
  }
  if (baseline.schemaVersion !== 2 || !baseline.environment) throw new Error('不支持的浏览器基线格式。')
  if (adoptLegacy) throw new Error('当前基线已有环境记录，无需采用旧基线。')
  if (JSON.stringify(baseline.environment) !== JSON.stringify(environment)) {
    throw new Error('浏览器环境与基线不一致。恢复原环境，或为新环境使用独立 environmentId 并检查后记录；不要覆盖旧基线消除失败。')
  }
  return 'current'
}

export async function configurePage(page, environment) {
  // Only Date is fixed. Timers and animation callbacks keep running.
  if (environment.fixedTime !== null) await page.clock.setFixedTime(new Date(environment.fixedTime))
}
