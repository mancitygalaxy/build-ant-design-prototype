// Decode through the pinned browser's public Canvas API; no private Playwright
// dependencies or platform image library is required. RGBA differences stay strict.
export async function compareScreenshotPixels(page, expected, actual) {
  return page.evaluate(async ({ expectedPng, actualPng }) => {
    async function decode(encoded) {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(bitmap, 0, 0)
        return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data }
      } finally { bitmap.close() }
    }
    const [before, after] = await Promise.all([decode(expectedPng), decode(actualPng)])
    const width = Math.max(before.width, after.width)
    const height = Math.max(before.height, after.height)
    const difference = new OffscreenCanvas(width, height)
    const context = difference.getContext('2d')
    const output = context.createImageData(width, height)
    let changedPixels = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = (y * before.width + x) * 4
        const b = (y * after.width + x) * 4
        const out = (y * width + x) * 4
        const beforeExists = x < before.width && y < before.height
        const afterExists = x < after.width && y < after.height
        const changed = beforeExists !== afterExists || (beforeExists && afterExists &&
          [0, 1, 2, 3].some((channel) => before.pixels[a + channel] !== after.pixels[b + channel]))
        if (changed) {
          changedPixels++
          output.data.set([255, 0, 70, 255], out)
        } else {
          const gray = afterExists ? Math.round((after.pixels[b] + after.pixels[b + 1] + after.pixels[b + 2]) / 6 + 127) : 255
          output.data.set([gray, gray, gray, 255], out)
        }
      }
    }
    const result = {
      changedPixels,
      expectedSize: { width: before.width, height: before.height },
      actualSize: { width: after.width, height: after.height },
      dimensionMismatch: before.width !== after.width || before.height !== after.height,
    }
    if (changedPixels > 0) {
      context.putImageData(output, 0, 0)
      const blob = await difference.convertToBlob({ type: 'image/png' })
      result.differenceDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }
    return result
  }, { expectedPng: expected.toString('base64'), actualPng: actual.toString('base64') })
}
