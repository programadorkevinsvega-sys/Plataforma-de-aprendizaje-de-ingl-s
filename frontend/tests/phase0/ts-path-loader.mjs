import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const extensions = ['.ts', '.js', '.mjs', '.json']

function resolveFile(basePath) {
  const candidates = path.extname(basePath)
    ? [basePath]
    : [basePath, ...extensions.map((extension) => basePath + extension),
       ...extensions.map((extension) => path.join(basePath, 'index' + extension))]
  return candidates.find((candidate) => existsSync(candidate) && !candidate.endsWith('.tsx'))
}

export async function resolve(specifier, context, nextResolve) {
  let candidate

  if (specifier.startsWith('@/')) {
    candidate = resolveFile(path.join(sourceRoot, specifier.slice(2)))
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  ) {
    const parentPath = fileURLToPath(context.parentURL)
    candidate = resolveFile(path.resolve(path.dirname(parentPath), specifier))
  }

  if (candidate) {
    return { url: pathToFileURL(candidate).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
      },
      fileName: fileURLToPath(url),
      reportDiagnostics: true,
    })
    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
    if (errors.length > 0) {
      const message = errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
        .join('\n')
      throw new Error(`Unable to transpile ${url}: ${message}`)
    }
    return { format: 'module', source: result.outputText, shortCircuit: true }
  }

  return nextLoad(url, context)
}
