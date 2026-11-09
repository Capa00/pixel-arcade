import { describe, expect, it } from 'vitest'
import {
  NEW_FOLDER,
  canPickMany,
  toggleAllFiles,
  toggleFile,
  SHOWN_MAX,
  biosRows,
  cleanName,
  coreNote,
  destinationItems,
  firstFocus,
  focusedRow,
  hiddenCount,
  importTarget,
  missingCores,
  missingText,
  rootOf,
  differentText,
  rowNote,
  splitPath,
  statusLabel,
  stepRoot,
  visibleEntries,
} from './bios.js'

function file(extra) {
  return { id: 'info:scph5501.bin', source: 'info', path: 'scph5501.bin', name: 'scph5501.bin', note: 'PS1 US BIOS',
    required: true, status: 'missing', folder: false, removable: false, ...extra }
}

const PAGE = {
  system: 'ps2',
  folders: ['pcsx2', 'pcsx2/bios'],
  cores: [
    { core: 'play', label: 'Play!', installed: true, files: [] },
    {
      core: 'pcsx2',
      label: 'LRPS2',
      installed: false,
      files: [
        file({ id: 'info:pcsx2/bios', path: 'pcsx2/bios', name: 'bios', note: '', folder: true }),
        file({ id: 'folderFile:pcsx2/bios/a.bin', source: 'folderFile', path: 'pcsx2/bios/a.bin', name: 'a.bin',
          required: false, status: 'present', removable: true }),
      ],
    },
  ],
}

describe('pagina «BIOS»', () => {
  it('righe per core, con «Aggiungi un BIOS…»', () => {
    const rows = biosRows(PAGE)
    expect(rows.map((row) => row.kind)).toEqual(['heading', 'add', 'heading', 'file', 'file', 'add'])
    expect(rows[1].focus).toBe('bios:play:manual')
    expect(focusedRow(rows, 'bios:pcsx2:info:pcsx2/bios').row.folder).toBe(true)
    expect(focusedRow(rows, 'manca')).toBeNull()
    expect(firstFocus(rows, 'pcsx2')).toBe('bios:pcsx2:info:pcsx2/bios')
    expect(firstFocus(rows, null)).toBe('bios:play:manual')
    expect(biosRows(null)).toEqual([])
  })

  it('stato, note e riassunto dei core', () => {
    expect(statusLabel(file())).toBe('Mancante')
    expect(statusLabel(file({ status: 'ok' }))).toBe('Presente ✓')
    expect(rowNote(file())).toBe('Obbligatorio · PS1 US BIOS')
    expect(rowNote(file({ source: 'manual', note: 'Aggiunto a mano' }))).toBe('Aggiunto a mano')
    expect(rowNote(file({ status: 'different' }))).toBe('Obbligatorio · PS1 US BIOS · Può bloccare i giochi (schermo nero)')
    expect(coreNote(PAGE.cores[0])).toContain('non dichiara BIOS')
    expect(coreNote(PAGE.cores[1])).toBe('Manca un file obbligatorio')
    expect(coreNote({ installed: false, files: [file({ status: 'ok' })] })).toBe('Core non ancora installato')
    expect(missingCores(PAGE)).toEqual({ play: false, pcsx2: true })
    expect(missingText('mednafen_psx_hw', ['scph5501.bin', 'scph5502.bin']))
      .toBe('Al core mednafen_psx_hw mancano i BIOS scph5501.bin, scph5502.bin: senza, il gioco potrebbe non partire.')
    expect(missingText('pcsx2', ['pcsx2/bios'])).toBe('Al core pcsx2 manca il BIOS pcsx2/bios: senza, il gioco potrebbe non partire.')
    expect(differentText([])).toBeNull()
    expect(differentText(undefined)).toBeNull()
    expect(differentText(['scph5502.bin']))
      .toBe('Il BIOS scph5502.bin non è la versione originale: se il gioco si è bloccato, la causa può essere questa.')
    expect(differentText(['a.bin', 'b.bin'])).toBe('I BIOS a.bin, b.bin non sono la versione originale: se il gioco si è bloccato, la causa può essere questa.')
  })

  it('destinazione della copia', () => {
    expect(importTarget(file())).toEqual({ target: 'info:scph5501.bin', folder: null, name: null })
    expect(importTarget(PAGE.cores[1].files[1])).toEqual({ target: 'info:pcsx2/bios', folder: null, name: null })
    expect(importTarget(file({ source: 'manual', path: 'play/x.bin' }))).toEqual({ target: 'manual', folder: 'play', name: 'x.bin' })
    expect(splitPath('a.bin')).toEqual({ folder: '', name: 'a.bin' })
    const items = destinationItems(PAGE.folders, 'play')
    expect(items.map((item) => item.id)).toEqual(['', 'pcsx2', 'pcsx2/bios', NEW_FOLDER])
    expect(cleanName('  scph.bin ')).toBe('scph.bin')
    for (const bad of ['', '..', 'a/b', ' ']) {
      expect(cleanName(bad)).toBe('')
    }
  })
})

describe('selettore dei file', () => {
  const listing = {
    path: '/home/utente/Scaricati',
    hidden: 2,
    entries: [
      { name: 'BIOS', path: '/home/utente/Scaricati/BIOS', dir: true, size: null },
      { name: 'scph39001.bin', path: '/home/utente/Scaricati/scph39001.bin', dir: false, size: 4194304 },
      { name: 'film.mkv', path: '/home/utente/Scaricati/film.mkv', dir: false, size: SHOWN_MAX + 1 },
    ],
  }
  const roots = [
    { id: 'home', path: '/home/utente' },
    { id: 'games', path: '/home/utente/retrogames/games' },
    { id: 'root', path: '/' },
  ]

  it('file grandi, ricerca e nascosti', () => {
    expect(visibleEntries(listing, false, '').map((entry) => entry.name)).toEqual(['BIOS', 'scph39001.bin'])
    expect(visibleEntries(listing, true, '')).toHaveLength(3)
    expect(visibleEntries(listing, false, ' SCPH ').map((entry) => entry.name)).toEqual(['scph39001.bin'])
    expect(hiddenCount(listing, false)).toBe(3)
    expect(hiddenCount(listing, true)).toBe(0)
    expect(visibleEntries(null, false, '')).toEqual([])
  })

  it('scelta di più file', () => {
    expect(canPickMany(null)).toBe(true)
    expect(canPickMany(file({ folder: true }))).toBe(true)
    expect(canPickMany(file({ source: 'folderFile' }))).toBe(true)
    expect(canPickMany(file())).toBe(false)
    const [, bin, film] = listing.entries
    let checked = toggleFile(new Map(), bin)
    expect([...checked.keys()]).toEqual([bin.path])
    expect(toggleFile(checked, bin).size).toBe(0)
    // Le cartelle non si spuntano; con tutti i file già spuntati, Y toglie la spunta.
    checked = toggleAllFiles(checked, listing.entries)
    expect([...checked.keys()]).toEqual([bin.path, film.path])
    expect(toggleAllFiles(checked, listing.entries).size).toBe(0)
    const other = { name: 'x.bin', path: '/altrove/x.bin', dir: false, size: 1 }
    expect(toggleAllFiles(toggleFile(new Map(), other), [bin]).size).toBe(2)
  })

  it('punti di partenza', () => {
    expect(rootOf(roots, '/home/utente/retrogames/games/ps2').id).toBe('games')
    expect(rootOf(roots, '/home/utentex').id).toBe('root')
    expect(rootOf(roots, '/home/utente').id).toBe('home')
    expect(stepRoot(roots, roots[2], 1).id).toBe('home')
    expect(stepRoot(roots, roots[0], -1).id).toBe('root')
    expect(stepRoot(roots, null, 1).id).toBe('home')
    expect(stepRoot([], null, 1)).toBeNull()
  })
})
