import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const measuredAreas = ['domain', 'application', 'infrastructure', 'shared']

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(absolutePath)))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(absolutePath)
    }
  }

  return files
}

test('frontend domain, application and infrastructure modules load for coverage', async () => {
  const files = (
    await Promise.all(
      measuredAreas.map((area) => collectTypeScriptFiles(path.join(sourceRoot, area))),
    )
  )
    .flat()
    .sort()

  assert.ok(files.length > 0, 'expected TypeScript source modules to measure')

  const failures = []
  for (const file of files) {
    try {
      await import(pathToFileURL(file).href)
    } catch (error) {
      failures.push({
        file: path.relative(sourceRoot, file),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  assert.deepEqual(failures, [], 'all measured non-UI TypeScript modules must import')
})
