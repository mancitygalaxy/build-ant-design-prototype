import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const templateRoot = process.cwd()
const checker = resolve(templateRoot, 'scripts/check-architecture.mjs')
const fixture = await mkdtemp(resolve(tmpdir(), 'prototype-architecture-gate-'))

function runChecker() {
  return spawnSync(process.execPath, [checker], { cwd: fixture, encoding: 'utf8' })
}

try {
  await cp(resolve(templateRoot, 'prototype-architecture.json'), resolve(fixture, 'prototype-architecture.json'))
  await writeFile(resolve(fixture, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      baseUrl: '.',
      paths: { '@/*': ['src/*'] },
      jsx: 'react-jsx',
    },
    include: ['src'],
  }, null, 2)}\n`)
  for (const directory of ['components', 'pages', 'features', 'domain']) await mkdir(resolve(fixture, `src/${directory}`), { recursive: true })
  await writeFile(resolve(fixture, 'src/pages/HomePage.tsx'), 'export function HomePage() { return <main /> }\n')
  await writeFile(resolve(fixture, 'src/components/Good.tsx'), "import { useState } from 'react'\nexport function Good() { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(!open)}>{String(open)}</button> }\n")
  await writeFile(resolve(fixture, 'src/domain/math.ts'), 'export const add = (a: number, b: number) => a + b\n')

  const passing = runChecker()
  if (passing.status !== 0) throw new Error(`合规样例未通过：\n${passing.stdout}\n${passing.stderr}`)

  await writeFile(resolve(fixture, 'src/bridge.ts'), "export { HomePage } from './pages/HomePage'\n")
  await writeFile(resolve(fixture, 'src/components/BadAlias.tsx'), "import { HomePage } from '@/pages/HomePage'\nexport const BadAlias = HomePage\n")
  await writeFile(resolve(fixture, 'src/components/BadBarrel.tsx'), "import { HomePage } from '../bridge'\nexport const BadBarrel = HomePage\n")
  await writeFile(resolve(fixture, 'src/features/BadDynamic.ts'), "export const load = () => import('../pages/HomePage')\n")
  await writeFile(resolve(fixture, 'src/domain/BadReexport.ts'), "export { Good } from '../components/Good'\n")
  const failing = runChecker()
  const evidence = `${failing.stdout}\n${failing.stderr}`
  const expected = ['BadAlias', 'BadBarrel', 'BadDynamic', 'BadReexport']
  if (failing.status === 0 || !evidence.includes('ARCHITECTURE_ERROR') || expected.some((name) => !evidence.includes(name))) {
    throw new Error(`别名、桶文件、动态导入或重导出的违规样例没有被完整捕获：\n${evidence}`)
  }
  console.log('ARCHITECTURE_GATE_SELF_TEST_PASSED cases=alias,barrel,dynamic-import,re-export')
} finally {
  await rm(fixture, { recursive: true, force: true })
}

