export async function performStep(page, step, assertions) {
  const locator = step.selector ? page.locator(step.selector) : null
  if (step.action === 'clearSessionStorage') await page.evaluate(() => sessionStorage.clear())
  else if (step.action === 'clearLocalStorage') await page.evaluate(() => localStorage.clear())
  else if (step.action === 'reload') await page.reload({ waitUntil: 'networkidle' })
  else if (step.action === 'waitFor') await locator.waitFor({ state: step.state ?? 'visible' })
  else if (step.action === 'click') await locator.click()
  else if (step.action === 'fill') await locator.fill(step.value ?? '')
  else if (step.action === 'selectOption') await locator.selectOption(step.value)
  else if (step.action === 'hover') await locator.hover()
  else if (step.action === 'focus') await locator.focus()
  else if (step.action === 'press') {
    if (!step.key) throw new Error('press 动作必须填写 key，例如 Tab 或 Enter。')
    if (locator) await locator.press(step.key)
    else await page.keyboard.press(step.key)
  } else if (['assertText', 'assertVisible', 'assertHidden', 'assertEnabled', 'assertFocused'].includes(step.action)) {
    let actual
    if (step.action === 'assertText') actual = await locator.innerText()
    else if (step.action === 'assertVisible') actual = await locator.isVisible()
    else if (step.action === 'assertHidden') actual = !(await locator.isVisible())
    else if (step.action === 'assertEnabled') actual = await locator.isEnabled()
    else actual = await locator.evaluate((element) => element === document.activeElement)
    const expected = step.action === 'assertText' ? step.equals : true
    assertions.push({ label: step.label ?? step.selector, actual })
    if (actual !== expected) throw new Error(`${step.label ?? step.selector} 检查失败：期望 ${expected}，实际 ${actual}`)
  } else throw new Error(`不支持的浏览器动作：${step.action}`)
}
