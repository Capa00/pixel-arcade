import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Cartella src/ del frontend.
const SRC = fileURLToPath(new URL('..', import.meta.url))

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return cssFiles(path)
    }
    return name.endsWith('.css') ? [path] : []
  })
}

/*
 * In Chrome `scrollbar-width` (tranne `none`) e `scrollbar-color` annullano
 * le regole `::-webkit-scrollbar` di src/styles/base.css e tornano le barre
 * di sistema: i moduli possono solo nascondere la barra.
 */
describe('barre di scorrimento', () => {
  it('nessun modulo cambia lo stile della barra', () => {
    const problems = []
    for (const path of cssFiles(SRC)) {
      const lines = readFileSync(path, 'utf8').split('\n')
      lines.forEach((line, at) => {
        const width = line.match(/scrollbar-width\s*:\s*([^;]+);/)
        if ((width && width[1].trim() !== 'none') || /scrollbar-color\s*:/.test(line)) {
          problems.push(`${relative(SRC, path)}:${at + 1}: ${line.trim()}`)
        }
      })
    }
    expect(problems).toEqual([])
  })
})
