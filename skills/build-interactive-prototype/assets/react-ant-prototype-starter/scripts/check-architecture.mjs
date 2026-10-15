import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const config = JSON.parse(await readFile(resolve(root, 'prototype-architecture.json'), 'utf8'))
const sourceRoot = resolve(root, 'src')
const warnings = []
const errors = []

async function walk(directory, output = []) {
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name)
    const info = await stat(path)
    if (info.isDirectory()) await walk(path, output)
    else output.push(path)
  }
  return output
}

function normalized(file) {
  return relative(root, file).split('\\').join('/')
}

function layerFor(file) {
  const name = normalized(file)
  if (/\.(css|scss)$/.test(name)) return 'style'
  if (name.startsWith('src/app/')) return 'app'
  if (name.startsWith('src/pages/')) return 'page'
  if (name.startsWith('src/components/')) return 'component'
  if (name.startsWith('src/features/')) return 'feature'
  if (name.startsWith('src/domain/')) return 'domain'
  if (name.startsWith('src/data/')) return 'data'
  return 'other'
}

const tsconfigPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
const parsedConfig = tsconfigPath
  ? ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfigPath, ts.sys.readFile).config, ts.sys, root)
  : { options: {} }

function collectSpecifiers(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const specifiers = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        specifiers.push(node.arguments[0].text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function resolveProjectImport(file, specifier) {
  const result = ts.resolveModuleName(specifier, file, parsedConfig.options, ts.sys).resolvedModule
  if (!result?.resolvedFileName) return null
  const resolvedFile = resolve(result.resolvedFileName.replace(/\.d\.ts$/, '.ts'))
  return normalized(resolvedFile).startsWith('src/') ? resolvedFile : null
}

function boundaryError(from, targetLayer, specifier, file) {
  const name = normalized(file)
  if (from === 'page' && targetLayer === 'page') return `${name}：页面不得导入其他页面（${specifier}）。`
  if (from === 'component' && ['app', 'page', 'feature'].includes(targetLayer)) return `${name}：展示组件不得导入 ${targetLayer} 层（${specifier}）。`
  if (from === 'feature' && ['app', 'page'].includes(targetLayer)) return `${name}：业务模块不得导入 ${targetLayer} 层（${specifier}）。`
  if (from === 'domain' && ['app', 'page', 'feature', 'component'].includes(targetLayer)) return `${name}：domain 层只能保留类型、纯函数和业务规则（${specifier}）。`
  if (from === 'data' && ['app', 'page', 'feature', 'component'].includes(targetLayer)) return `${name}：data 层不得依赖界面或业务编排层（${specifier}）。`
  return null
}

const files = await walk(sourceRoot)
const sourceFiles = files.filter((file) => ['.ts', '.tsx'].includes(extname(file)))
const dependencyGraph = new Map()
const externalGraph = new Map()
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  const projectImports = []
  const externalImports = []
  for (const specifier of collectSpecifiers(file, source)) {
    const target = resolveProjectImport(file, specifier)
    if (target) projectImports.push({ specifier, target })
    else externalImports.push(specifier)
  }
  dependencyGraph.set(file, projectImports)
  externalGraph.set(file, externalImports)
}

function reachableTargets(start, seen = new Set()) {
  if (seen.has(start)) return []
  seen.add(start)
  const output = []
  for (const edge of dependencyGraph.get(start) ?? []) {
    output.push(edge)
    for (const nested of reachableTargets(edge.target, seen)) output.push({ specifier: `${edge.specifier} -> ${nested.specifier}`, target: nested.target })
  }
  return output
}

let importantCount = 0
let antSelectorCount = 0
for (const file of files) {
  const extension = extname(file)
  if (!['.ts', '.tsx', '.css', '.scss'].includes(extension)) continue
  const source = await readFile(file, 'utf8')
  const name = normalized(file)
  const layer = layerFor(file)
  const lines = source.split(/\r?\n/).length
  const limits = config.lineLimits?.[layer]
  const debtLimit = config.existingDebt?.lines?.[name] ?? 0
  if (limits && lines > limits.error && lines > debtLimit) errors.push(`${name}：${lines} 行，超过 ${layer} 阻断线 ${limits.error}。`)
  else if (limits && lines > limits.warn) warnings.push(`${name}：${lines} 行，超过 ${layer} 预警线 ${limits.warn}。`)

  if (['.ts', '.tsx'].includes(extension)) {
    const found = new Set()
    for (const edge of reachableTargets(file)) {
      const message = boundaryError(layer, layerFor(edge.target), edge.specifier, file)
      if (message && !found.has(message)) { errors.push(message); found.add(message) }
    }
    if (layer === 'domain' && (externalGraph.get(file) ?? []).some((item) => item === 'react' || item.startsWith('antd'))) {
      errors.push(`${name}：domain 层不得依赖 React 或 Ant Design。`)
    }
    if (['component', 'domain', 'data'].includes(layer) && /\b(sessionStorage|localStorage)\b/.test(source)) errors.push(`${name}：${layer} 层不得直接读写浏览器存储。`)
  }
  if (['.css', '.scss'].includes(extension)) {
    importantCount += (source.match(/!important\b/g) ?? []).length
    antSelectorCount += (source.match(/\.ant-[a-zA-Z0-9_-]+/g) ?? []).length
  }
}

const importantAllowed = Math.max(config.styleBudget?.important ?? 0, config.existingDebt?.styles?.important ?? 0)
const antAllowed = Math.max(config.styleBudget?.antSelectors ?? 0, config.existingDebt?.styles?.antSelectors ?? 0)
if (importantCount > importantAllowed) errors.push(`样式中 !important 为 ${importantCount} 个，超过允许上限 ${importantAllowed}。`)
if (antSelectorCount > antAllowed) warnings.push(`样式中 .ant-* 选择器为 ${antSelectorCount} 个，超过登记上限 ${antAllowed}；请优先使用 token 或局部组件边界。`)

for (const warning of warnings) console.warn(`ARCHITECTURE_WARNING ${warning}`)
for (const error of [...new Set(errors)]) console.error(`ARCHITECTURE_ERROR ${error}`)
if (errors.length > 0) process.exit(1)
console.log(`ARCHITECTURE_CHECK_PASSED files=${files.length} warnings=${warnings.length}`)

