import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function deliveryConfig(project) {
  const mode = project.deliveryMode ?? 'single-html'
  if (!['single-html', 'web'].includes(mode)) throw new Error('deliveryMode 只允许 single-html 或 web。')
  const target = mode === 'single-html' ? project.deliveryFile : project.deliveryDirectory
  if (typeof target !== 'string' || !target || /[/\\:\0]/.test(target) || target.startsWith('.') || target.includes('__REPLACE')) {
    throw new Error('交付目标必须是 delivery 内的单个有效名称。')
  }
  if (target === 'manifest.json') throw new Error('manifest.json 是保留名称。')
  if (mode === 'single-html' && !target.endsWith('.html')) throw new Error('deliveryFile 必须以 .html 结尾。')
  return { mode, target }
}
export async function readProject(root = process.cwd()) {
  const project = JSON.parse(await readFile(resolve(root, 'prototype.project.json'), 'utf8'))
  return { ...project, delivery: deliveryConfig(project) }
}

