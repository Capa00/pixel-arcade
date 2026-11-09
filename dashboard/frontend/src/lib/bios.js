/**
 * Pagina «BIOS» di una console e selettore dei file (src/components/BiosModal.jsx,
 * src/components/FileBrowser.jsx). Solo funzioni pure.
 *
 * `GET /api/bios` dà `{system, systemDir, folders, cores: [{core, label,
 * installed, files}]}`; ogni file è `{id, source, path, name, note,
 * required, status, folder, removable}` con `source` `info` (dal `.info` del
 * core), `option` (da un'opzione del core), `manual` (aggiunto a mano) o
 * `folderFile` (file dentro una cartella dichiarata) e `status` `ok`,
 * `present`, `different` o `missing`.
 */

/** Nel selettore, senza «Mostra tutti», i file più grandi di così non compaiono: un BIOS è piccolo. */
export const SHOWN_MAX = 64 * 1024 * 1024
export const MANUAL = 'manual'
/** Voce «Nuova sottocartella…» nel menu della destinazione. */
export const NEW_FOLDER = '__new'
/** Voce «Cambia il nome…» nel menu del nome. */
export const RENAME = '__rename'
export const KEEP_NAME = '__keep'

const STATUS_LABELS = {
  ok: 'Presente ✓',
  present: 'Presente',
  different: 'Versione diversa',
  missing: 'Mancante',
}

export function statusLabel(row) {
  return STATUS_LABELS[row.status] || row.status
}

/** Nota sotto il nome: obbligatorio o facoltativo (solo per i file del `.info`), descrizione e rischio di una versione diversa. */
export function rowNote(row) {
  const parts = []
  if (row.source === 'info') {
    parts.push(row.required ? 'Obbligatorio' : 'Facoltativo')
  }
  if (row.note) {
    parts.push(row.note)
  }
  if (row.status === 'different') {
    parts.push('Può bloccare i giochi (schermo nero)')
  }
  return parts.join(' · ')
}

export function rowFocus(core, id) {
  return `bios:${core}:${id}`
}

/**
 * Righe della pagina: per ogni core un'intestazione, i suoi file e
 * «＋ Aggiungi un BIOS…». `{kind: 'heading'|'file'|'add', core, focus, row}`.
 */
export function biosRows(page) {
  const rows = []
  for (const entry of page ? page.cores : []) {
    rows.push({ kind: 'heading', core: entry.core, entry })
    for (const row of entry.files) {
      rows.push({ kind: 'file', core: entry.core, focus: rowFocus(entry.core, row.id), row })
    }
    rows.push({ kind: 'add', core: entry.core, focus: rowFocus(entry.core, MANUAL) })
  }
  return rows
}

export function focusedRow(rows, focused) {
  return rows.find((row) => row.focus && row.focus === focused) || null
}

/** Primo elemento da evidenziare: la prima riga del core `core`, se c'è. */
export function firstFocus(rows, core) {
  const own = rows.find((row) => row.focus && row.core === core)
  const first = rows.find((row) => row.focus)
  return (own || first || {}).focus || null
}

/** Cartella e nome di un percorso relativo: `{folder, name}`. */
export function splitPath(path) {
  const at = path.lastIndexOf('/')
  return at < 0 ? { folder: '', name: path } : { folder: path.slice(0, at), name: path.slice(at + 1) }
}

/**
 * Destinazione della copia per una riga: `{target, folder, name}` per
 * `POST /api/bios/import`. Un file aggiunto a mano si sostituisce allo
 * stesso posto; un file di una cartella dichiarata ne aggiunge un altro alla cartella.
 */
export function importTarget(row) {
  if (row.source === MANUAL) {
    return { target: MANUAL, ...splitPath(row.path) }
  }
  if (row.source === 'folderFile') {
    return { target: `info:${splitPath(row.path).folder}`, folder: null, name: null }
  }
  return { target: row.id, folder: null, name: null }
}

/**
 * Vero se per la riga si possono scegliere più file insieme: una cartella
 * dichiarata (o un suo file) e «Aggiungi un BIOS…» (`row` nulla). Un file
 * con un nome fisso ne vuole uno solo.
 */
export function canPickMany(row) {
  return !row || row.folder || row.source === 'folderFile'
}

/** Spunta tutti i file di `entries`; se lo sono già, toglie la spunta solo a quelli. */
export function toggleAllFiles(checked, entries) {
  const files = entries.filter((entry) => !entry.dir)
  const next = new Map(checked)
  const all = files.length > 0 && files.every((entry) => next.has(entry.path))
  for (const entry of files) {
    if (all) {
      next.delete(entry.path)
    } else {
      next.set(entry.path, entry)
    }
  }
  return next
}

/** Spunta o toglie la spunta a un file. */
export function toggleFile(checked, entry) {
  const next = new Map(checked)
  if (next.has(entry.path)) {
    next.delete(entry.path)
  } else {
    next.set(entry.path, entry)
  }
  return next
}

/** Testo del riassunto di un core: «Questo core non usa il BIOS» se non ha file. */
export function coreNote(entry) {
  if (!entry.files.length) {
    return 'Questo core non dichiara BIOS: puoi aggiungerne uno a mano se la sua guida lo chiede'
  }
  const missing = entry.files.filter((row) => row.required && row.status === 'missing').length
  if (missing) {
    return missing === 1 ? 'Manca un file obbligatorio' : `Mancano ${missing} file obbligatori`
  }
  return entry.installed ? '' : 'Core non ancora installato'
}

/** Menu «Dove metterlo?» per un BIOS aggiunto a mano. */
export function destinationItems(folders, core) {
  return [
    { id: '', label: 'Cartella dei BIOS', note: 'La usano quasi tutti i core' },
    ...folders.map((folder) => ({ id: folder, label: folder, note: 'Sottocartella' })),
    { id: NEW_FOLDER, label: 'Nuova sottocartella…', note: `Per esempio ${core}` },
  ]
}

/** Menu «Nome del file» per un BIOS aggiunto a mano. */
export function nameItems(name) {
  return [
    { id: KEEP_NAME, label: name, note: 'Nome del file scelto' },
    { id: RENAME, label: 'Cambia il nome…', note: 'Se la guida del core chiede un nome preciso' },
  ]
}

/** Nome di sottocartella o di file scritto con la tastiera: senza `/`, spazi ai lati, `.` e `..`. */
export function cleanName(text) {
  const value = (text || '').trim()
  return value && value !== '.' && value !== '..' && !/[/\\]/.test(value) ? value : ''
}

/** Core della pagina a cui manca un file obbligatorio: `{core: vero | falso}`. */
export function missingCores(page) {
  const result = {}
  for (const entry of page ? page.cores : []) {
    result[entry.core] = entry.files.some((row) => row.required && row.status === 'missing')
  }
  return result
}

/** Testo dell'avviso prima di giocare. */
export function missingText(core, missing) {
  const names = missing.join(', ')
  const which = missing.length === 1 ? `manca il BIOS ${names}` : `mancano i BIOS ${names}`
  return `Al core ${core} ${which}: senza, il gioco potrebbe non partire.`
}

/** Notifica a fine partita se il core ha usato BIOS con una versione diversa da quella del `.info`; `null` se non ce ne sono. */
export function differentText(different) {
  if (!different || !different.length) {
    return null
  }
  const names = different.join(', ')
  const which = different.length === 1 ? `Il BIOS ${names} non è la versione originale` : `I BIOS ${names} non sono la versione originale`
  return `${which}: se il gioco si è bloccato, la causa può essere questa.`
}

export const MISSING_CHOICES = [
  { id: 'choose', label: 'Scegli il BIOS…', tone: 'ok' },
  { id: 'play', label: 'Avvia comunque' },
  { id: 'no', label: 'Annulla' },
]

/** Voci del selettore: senza `showAll` niente file oltre `SHOWN_MAX`; con `filter` solo i nomi che lo contengono. */
export function visibleEntries(listing, showAll, filter) {
  const text = (filter || '').trim().toLowerCase()
  return (listing ? listing.entries : []).filter((entry) =>
    (showAll || entry.dir || entry.size <= SHOWN_MAX) && (!text || entry.name.toLowerCase().includes(text)))
}

/** Quante voci restano fuori senza «Mostra tutti»: nascoste (col punto) e file grandi. */
export function hiddenCount(listing, showAll) {
  if (!listing || showAll) {
    return 0
  }
  const big = listing.entries.filter((entry) => !entry.dir && entry.size > SHOWN_MAX).length
  return listing.hidden + big
}

/** Punto di partenza che contiene `path` (il più specifico), oppure `null`. */
export function rootOf(roots, path) {
  let found = null
  for (const root of roots || []) {
    const inside = path === root.path || path.startsWith(root.path === '/' ? '/' : `${root.path}/`)
    if (inside && (!found || root.path.length > found.path.length)) {
      found = root
    }
  }
  return found
}

/** Punto di partenza successivo (`dir` 1) o precedente (-1), in cerchio. */
export function stepRoot(roots, current, dir) {
  if (!roots || !roots.length) {
    return null
  }
  const at = current ? roots.findIndex((root) => root.id === current.id) : -1
  const next = at < 0 ? (dir > 0 ? 0 : roots.length - 1) : (at + dir + roots.length) % roots.length
  return roots[next]
}
