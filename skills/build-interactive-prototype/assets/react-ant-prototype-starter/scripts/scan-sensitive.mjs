import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const root = process.cwd()
const scanRoots = [
  'src',
  'scripts',
  'test-baselines',
  'dist',
  'delivery',
  'index.html',
  'package.json',
  'prototype.acceptance.json',
  'prototype-architecture.json',
  'prototype.browser.json',
  'prototype.project.json',
  'prototype.performance.json',
]
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.scss', '.css'])
const patterns = [
  { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'gitlab-token', regex: /\bglpat-[A-Za-z0-9_-]{12,}\b/ },
  { name: 'openai-token', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'generic-secret-assignment', regex: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
]
const findings = []
let scanned = 0

async function walk(path) {
  let info
  try {
    info = await stat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await walk(resolve(path, name))
    return
  }
  if (!extensions.has(extname(path))) return
  scanned += 1
  const content = await readFile(path, 'utf8')
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) findings.push(`${relative(root, path)}:${pattern.name}`)
  }
}

for (const entry of scanRoots) await walk(resolve(root, entry))
if (findings.length > 0) {
  for (const finding of findings) console.error(`SENSITIVE_ERROR ${finding}`)
  process.exit(1)
}
console.log(`SENSITIVE_SCAN_PASSED files=${scanned}`)
