import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const SOURCE_ENTRIES = [
  'src',
  'public',
  'scripts',
  'index.html',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'prototype-architecture.json',
  'prototype.acceptance.json',
  'prototype.browser.json',
  'prototype.project.json',
  'prototype.performance.json',
  '.gitlab-ci.yml',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
]

async function collectFiles(root, entry, files) {
  const absolute = resolve(root, entry)
  let info
  try {
    info = await stat(absolute)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  if (info.isFile()) {
    files.push(absolute)
    return
  }

  for (const name of (await readdir(absolute)).sort()) {
    await collectFiles(root, resolve(absolute, name), files)
  }
}

export async function computeSourceFingerprint(root = process.cwd()) {
  const files = []
  for (const entry of SOURCE_ENTRIES) {
    await collectFiles(root, entry, files)
  }

  const hash = createHash('sha256')
  const relativeFiles = []
  for (const file of files.sort()) {
    const name = relative(root, file)
    relativeFiles.push(name)
    hash.update(name)
    hash.update('\0')
    hash.update(await readFile(file))
    hash.update('\0')
  }

  return {
    files: relativeFiles,
    sha256: hash.digest('hex'),
  }
}
