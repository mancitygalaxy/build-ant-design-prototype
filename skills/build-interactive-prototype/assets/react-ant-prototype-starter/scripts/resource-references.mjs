import { parse } from 'parse5'
import ts from 'typescript'

// Parse HTML syntax instead of treating bundled script strings as DOM.
export function resourceReferences(source, extension) {
  const refs = []
  function css(text) {
    const plain = text.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of plain.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi)) refs.push(match[1] ?? match[2] ?? match[3])
    for (const match of plain.matchAll(/@import\s+["']([^"']+)["']/gi)) refs.push(match[1])
  }
  function js(text) {
    const tree = ts.createSourceFile('resource.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) refs.push(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(node.arguments[0] ?? {})) refs.push(node.arguments[0].text)
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2 &&
          ts.isStringLiteralLike(node.arguments[0]) && node.arguments[1].getText(tree) === 'import.meta.url') refs.push(node.arguments[0].text)
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  function srcset(value) {
    // Consume URL tokens including commas inside data URIs, then optional descriptors.
    let remaining = value.trim()
    while (remaining) {
      remaining = remaining.replace(/^[,\s]+/, '')
      const match = remaining.match(/^\S+/)
      if (!match) break
      let url = match[0]
      remaining = remaining.slice(url.length)
      if (url.endsWith(',')) { url = url.replace(/,+$/, ''); refs.push(url); continue }
      refs.push(url)
      const comma = remaining.indexOf(',')
      remaining = comma >= 0 ? remaining.slice(comma + 1) : ''
    }
  }
  if (extension === '.css') css(source)
  else if (extension === '.js') js(source)
  else if (extension === '.html') {
    function walk(node) {
      const attrs = Object.fromEntries((node.attrs ?? []).map((attr) => [attr.name, attr.value]))
      if (node.tagName === 'base' && attrs.href && attrs.href !== './') throw new Error('交付入口不支持重写资源根路径的 base 标签。')
      const tag = node.tagName
      if (['script', 'img', 'source', 'video', 'audio', 'iframe', 'embed', 'input'].includes(tag) && attrs.src) refs.push(attrs.src)
      if (tag === 'video' && attrs.poster) refs.push(attrs.poster)
      if (tag === 'object' && attrs.data) refs.push(attrs.data)
      const resourceLink = tag === 'link' && /(?:^|\s)(?:stylesheet|icon|preload|modulepreload|prefetch|manifest|apple-touch-icon)(?:\s|$)/.test(attrs.rel ?? '')
      if (resourceLink && attrs.href) refs.push(attrs.href)
      if (resourceLink && attrs.imagesrcset) srcset(attrs.imagesrcset)
      if (['use', 'image'].includes(tag) && attrs.href) refs.push(attrs.href)
      if (['img', 'source'].includes(tag) && attrs.srcset) srcset(attrs.srcset)
      if (attrs.style) css(attrs.style)
      if (tag === 'style') css((node.childNodes ?? []).map((child) => child.value ?? '').join(''))
      if (tag === 'script' && !attrs.src && (!attrs.type || ['module', 'text/javascript', 'application/javascript'].includes(attrs.type))) {
        js((node.childNodes ?? []).map((child) => child.value ?? '').join(''))
      }
      for (const child of node.childNodes ?? []) walk(child)
      if (node.content) walk(node.content)
    }
    walk(parse(source))
  }
  return refs.filter(Boolean)
}

