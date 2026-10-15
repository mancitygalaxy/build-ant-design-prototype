import { performance } from 'node:perf_hooks'

// Stability changes when to capture, never the permitted difference from the baseline.
export async function stableScreenshot(page, timeoutMs = 15000) {
  const deadline = performance.now() + timeoutMs
  await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded', null, { timeout: timeoutMs })
  let previous
  let unchangedSince = performance.now()
  while (performance.now() < deadline) {
    const current = await page.screenshot({ fullPage: true, animations: 'disabled', timeout: Math.max(1, deadline - performance.now()) })
    if (!previous || !current.equals(previous)) unchangedSince = performance.now()
    else if (performance.now() - unchangedSince >= 300) return current
    previous = current
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error('页面截图在限定时间内未稳定；先固定动态状态，不更新基线或放宽差异。')
}

