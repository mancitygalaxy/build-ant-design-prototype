import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { deliveryConfig } from './project-config.mjs'

const root = process.cwd()
const config = JSON.parse(await readFile(resolve(root, 'prototype.project.json'), 'utf8'))
const errors = []

if (config.schemaVersion !== 1) errors.push('prototype.project.json 的 schemaVersion 必须为 1。')
if (config.initialized !== true) errors.push('起步模板尚未初始化：请替换示例页面、示例契约和示例浏览器场景后，将 initialized 设为 true。')
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(config.projectId ?? '')) errors.push('projectId 必须是 3—64 位小写字母、数字或连字符。')
try { deliveryConfig(config) } catch (error) { errors.push(error.message) }

const markerFiles = ['src', 'prototype.acceptance.json', 'prototype.browser.json', 'prototype.performance.json', 'index.html']
const forbiddenMarkers = [
  'demo-counter',
  'demo-increment',
  'demo-count',
  'prototype.starter.counter',
  'replace-with-real',
  '__REPLACE',
  'starterCopy',
  'StarterCopy',
  '高质量原型，从清晰边界开始',
  '这个示例只用于验证工程',
  'Ant Design 原型起步工程',
]
const forbiddenPaths = ['src/data/demo.ts']

async function collectText(entry) {
  const { readdir, stat } = await import('node:fs/promises')
  const path = resolve(root, entry)
  const info = await stat(path)
  if (info.isFile()) return readFile(path, 'utf8')
  let output = ''
  for (const name of (await readdir(path)).sort()) output += await collectText(`${entry}/${name}`)
  return output
}

if (config.initialized === true) {
  for (const entry of markerFiles) {
    const text = await collectText(entry)
    for (const marker of forbiddenMarkers) {
      if (text.includes(marker)) errors.push(`${entry} 仍包含起步模板标记：${marker}`)
    }
  }
  const { stat } = await import('node:fs/promises')
  for (const path of forbiddenPaths) {
    try {
      await stat(resolve(root, path))
      errors.push(`${path} 是起步模板示例文件，正式初始化前必须删除或替换。`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`INITIALIZATION_ERROR ${error}`)
  process.exit(1)
}

console.log(`PROJECT_INITIALIZED projectId=${config.projectId} deliveryFile=${config.deliveryFile}`)
