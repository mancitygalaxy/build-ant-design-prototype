import { performance } from 'node:perf_hooks'

export async function steps(page, items = []) {
  for (const step of items) {
    const locator = step.selector ? page.locator(step.selector) : null
    if (step.action === 'click') await locator.click()
    else if (step.action === 'fill') await locator.fill(step.value ?? '')
    else if (step.action === 'selectOption') await locator.selectOption(step.value)
    else if (step.action === 'reload') await page.reload({ waitUntil: 'domcontentloaded' })
    else if (step.action === 'waitFor') await locator.waitFor({ state: 'visible' })
    else if (step.action === 'assertText') {
      if (await locator.innerText() !== step.equals) throw new Error('操作结果不一致：' + step.selector)
    } else throw new Error('不支持的性能场景动作：' + step.action)
  }
}
export async function ready(page, assertions, timeout) {
  // Text/count/enabled are business-result contracts, not a network-idle proxy.
  await page.waitForFunction((items) => items.every((item) => {
    const elements = [...document.querySelectorAll(item.selector)]
    const visible = (element) => element.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(element).visibility)
    if (item.count !== undefined && elements.length !== item.count) return false
    if (elements.some((element) => !visible(element))) return false
    const element = elements[0]
    if (item.equals !== undefined && (!element || element.textContent.trim() !== item.equals)) return false
    if (item.enabled && (!element || element.matches(':disabled') || element.closest('[aria-disabled="true"]'))) return false
    return true
  }), assertions, { timeout })
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}
export async function measureSample(browser, origin, scenario, settings, resourceBytes) {
  const context = await browser.newContext({ viewport: scenario.viewport ?? { width: 1280, height: 800 },
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(settings.timeoutMs)
  page.setDefaultNavigationTimeout(settings.timeoutMs)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const requests = new Map()
  const records = []
  const errors = []
  let measuring = false
  cdp.on('Network.requestWillBeSent', (event) => {
    if (!measuring || !/^https?:/.test(event.request.url)) return
    if (!event.request.url.startsWith(origin + '/')) errors.push('检测到未支持的外部请求；请使用项目已有测量入口。')
    if (event.redirectResponse && requests.has(event.requestId)) {
      Object.assign(requests.get(event.requestId), { done: true, bytes: event.redirectResponse.encodedDataLength, durationMs: (event.timestamp - requests.get(event.requestId).start) * 1000 })
    }
    const entry = { done: false, bytes: 0, start: event.timestamp, url: new URL(event.request.url).pathname }
    requests.set(event.requestId, entry)
    records.push(entry)
  })
  cdp.on('Network.responseReceived', (event) => {
    const request = requests.get(event.requestId)
    if (request && event.response.status >= 400) errors.push('资源或接口返回 ' + event.response.status + '：' + request.url)
  })
  cdp.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (request) Object.assign(request, { done: true, bytes: event.encodedDataLength, durationMs: (event.timestamp - request.start) * 1000 })
  })
  cdp.on('Network.loadingFailed', (event) => {
    const request = requests.get(event.requestId)
    if (request) { request.done = true; errors.push('请求失败：' + request.url) }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    const url = origin + scenario.route
    if (scenario.kind === 'interaction' || scenario.cache.browser === 'repeat-visit') {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await ready(page, scenario.setupReady ?? scenario.ready, settings.timeoutMs)
      await steps(page, scenario.setup)
    } else if (scenario.setup?.length) throw new Error('首次导航不能在计时前操作页面；改用交互场景。')
    measuring = true
    const start = performance.now()
    if (scenario.kind === 'navigation') await page.goto(url, { waitUntil: 'domcontentloaded' })
    else await steps(page, scenario.actions)
    await ready(page, scenario.ready, settings.timeoutMs)
    const durationMs = performance.now() - start
    // Include late requests after ready in a declared observation window, outside user-visible timing.
    await new Promise((done) => setTimeout(done, settings.observationMs))
    const deadline = performance.now() + settings.timeoutMs
    while ([...requests.values()].some((request) => !request.done)) {
      if (performance.now() > deadline) throw new Error('必要请求未完成，测量受阻。')
      await new Promise((done) => setTimeout(done, 20))
    }
    measuring = false
    if (errors.length) throw new Error([...new Set(errors)].join('\n'))
    return { durationMs, requestCount: records.length,
      transferBytes: records.reduce((sum, request) => sum + request.bytes, 0),
      resourceBytes, requests: records.map(({ url: path, bytes, durationMs: elapsed }) => ({ path, bytes, durationMs: elapsed })) }
  } finally { await context.close() }
}

