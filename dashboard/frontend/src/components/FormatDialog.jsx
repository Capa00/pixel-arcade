import { useEffect, useState } from 'react'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  ADVANTAGED_SIDES,
  FORMATS,
  GRAND_FINALS,
  GRAND_SERIES,
  LEGS,
  SEEDINGS,
  SEMI_SERIES,
  SERIES,
  advantagedLabel,
  defaultOptions,
  fitSeries,
  fixedSeriesLabel,
  formatReady,
  formatStartable,
  grandFinalLabel,
  grandFinalOf,
  grandSeriesLabel,
  grandSeriesOf,
  hasAdvantagedSide,
  leagueOptions,
  legsLabel,
  pointChoices,
  semiLabel,
  seriesChoices,
  seriesLabel,
  stepWeight,
  walkoverChoices,
  weightLabel,
} from '../lib/tournament.js'
import settingsStyles from '../views/Settings.module.css'
import styles from './FormatDialog.module.css'

const VERTICAL = { up: -1, down: 1 }
const HORIZONTAL = { left: -1, right: 1 }

/** Valore a un passo `dir` nell'elenco `values`, circolare. */
function cycle(values, current, dir) {
  const index = Math.max(0, values.indexOf(current))
  return values[(index + dir + values.length) % values.length]
}

/** Valore `value` con le opzioni del girone cambiate da `changes` e la serie riportata tra quelle ammesse. */
function withLeague(value, changes) {
  const options = { ...leagueOptions(value), ...changes }
  return { ...value, options, roundSeries: fitSeries(value.roundSeries, seriesChoices('round_robin', options)) }
}

/** Righe di una lista di numeri `key` (punti o punteggio a tavolino) del girone. */
function numberRow(id, label, note, key, index, choicesOf) {
  return (value) => {
    const list = leagueOptions(value)[key]
    return {
      id,
      label,
      note,
      text: String(list[index]),
      step: (current, dir) => {
        const now = leagueOptions(current)[key]
        const next = [...now]
        next[index] = cycle(choicesOf(now, index), now[index], dir)
        return withLeague(current, { [key]: next })
      },
    }
  }
}

/**
 * Righe del girone: andata/ritorno, pareggi, serie degli incontri (fissa
 * con i pareggi), punti solo con i pareggi (senza conta chi vince di più),
 * punteggio e, con il punteggio, quello a tavolino.
 */
function leagueRows(value) {
  const options = leagueOptions(value)
  const legs = LEGS.find((item) => item.id === options.legs) || LEGS[0]
  const rows = [
    {
      id: 'legs',
      label: 'Andata e ritorno',
      text: legsLabel(options.legs),
      note: legs.note || null,
      step: (current, dir) => withLeague(current, {
        legs: cycle(LEGS.map((item) => item.id), leagueOptions(current).legs, dir),
      }),
    },
    {
      id: 'draws',
      label: 'Pareggi ammessi',
      text: options.draws ? 'Sì' : 'No',
      note: options.draws ? 'Ogni incontro ha un numero fisso di partite' : 'Ogni incontro ha un vincitore',
      step: (current) => withLeague(current, { draws: !leagueOptions(current).draws }),
    },
    {
      id: 'rounds',
      label: 'Serie degli incontri',
      text: options.draws ? fixedSeriesLabel(value.roundSeries) : seriesLabel(value.roundSeries),
      note: options.draws ? 'Vince chi vince più partite, altrimenti è pari' : null,
      step: (current, dir) => ({
        ...current,
        roundSeries: cycle(seriesChoices('round_robin', leagueOptions(current)), current.roundSeries, dir),
      }),
    },
  ]
  if (options.draws) {
    rows.push(
      numberRow('pointsWin', 'Punti per la vittoria', null, 'points', 0, pointChoices)(value),
      numberRow('pointsDraw', 'Punti per il pareggio', null, 'points', 1, pointChoices)(value),
      numberRow('pointsLoss', 'Punti per la sconfitta', null, 'points', 2, pointChoices)(value),
    )
  }
  rows.push({
    id: 'score',
    label: 'Registra il punteggio',
    text: options.score ? 'Sì' : 'No',
    note: 'Punteggio di ogni partita, dichiarato insieme al vincitore',
    step: (current) => withLeague(current, { score: !leagueOptions(current).score }),
  })
  if (options.score) {
    rows.push(
      numberRow('walkoverWin', 'Punteggio a tavolino: vincitore', 'Vale per ogni incontro vinto a tavolino',
        'walkoverScore', 0, walkoverChoices)(value),
      numberRow('walkoverLoss', 'Punteggio a tavolino: perdente', null, 'walkoverScore', 1, walkoverChoices)(value),
    )
  }
  return rows
}

function semiOf(value) {
  const semi = value.options ? value.options.semiSeries : null
  return semi === undefined ? null : semi
}

/**
 * Righe delle opzioni per il valore `value` e i lati `sides`: con `general`
 * prima le comuni (teste di serie, pesi solo col misto, lato vantaggiato solo
 * con lati alternati o sorteggiati), poi quelle del formato. Nella doppia: serie dei
 * turni, finali dei tabelloni, gran finale e sua serie (non con «Nessuna»);
 * il 3° posto non c'è (è chi perde la finale dei perdenti). Ogni riga è
 * `{id, label, text, note, step(value, dir)}`.
 */
function optionRows(value, sides, general) {
  const rows = general ? [
    {
      id: 'seeding',
      label: 'Teste di serie',
      text: (SEEDINGS.find((item) => item.id === value.seeding) || SEEDINGS[0]).label,
      note: (SEEDINGS.find((item) => item.id === value.seeding) || SEEDINGS[0]).note,
      step: (current, dir) => ({ ...current, seeding: cycle(SEEDINGS.map((item) => item.id), current.seeding, dir) }),
    },
  ] : []
  if (general && value.seeding === 'mix') {
    rows.push({
      id: 'weight',
      label: 'Pesi',
      text: weightLabel(value.seedingWeight),
      slider: value.seedingWeight,
      step: (current, dir) => ({ ...current, seedingWeight: stepWeight(current.seedingWeight, dir) }),
    })
  }
  if (general && hasAdvantagedSide(sides)) {
    rows.push({
      id: 'advantaged',
      label: 'Lato vantaggiato',
      text: advantagedLabel(value.advantagedSide),
      note: 'La testa di serie migliore parte nell’altro lato',
      step: (current, dir) => ({
        ...current,
        advantagedSide: cycle(ADVANTAGED_SIDES.map((item) => item.id), current.advantagedSide, dir),
      }),
    })
  }
  if (value.format === 'single') {
    rows.push(
      {
        id: 'rounds',
        label: 'Serie dei turni',
        text: seriesLabel(value.roundSeries),
        step: (current, dir) => ({ ...current, roundSeries: cycle(SERIES, current.roundSeries, dir) }),
      },
      {
        id: 'semi',
        label: 'Serie della semifinale',
        text: semiLabel(semiOf(value)),
        step: (current, dir) => ({
          ...current,
          options: { ...current.options, semiSeries: cycle(SEMI_SERIES, semiOf(current), dir) },
        }),
      },
      {
        id: 'final',
        label: 'Serie della finale',
        text: seriesLabel(value.finalSeries),
        step: (current, dir) => ({ ...current, finalSeries: cycle(SERIES, current.finalSeries, dir) }),
      },
      {
        id: 'third',
        label: 'Finale per il 3° posto',
        text: value.thirdPlace ? 'Sì' : 'No',
        note: 'Si gioca prima della finale',
        step: (current) => ({ ...current, thirdPlace: !current.thirdPlace }),
      },
    )
  }
  if (value.format === 'double') {
    const grand = grandFinalOf(value)
    const grandEntry = GRAND_FINALS.find((item) => item.id === grand) || GRAND_FINALS[0]
    rows.push(
      {
        id: 'rounds',
        label: 'Serie dei turni',
        text: seriesLabel(value.roundSeries),
        step: (current, dir) => ({ ...current, roundSeries: cycle(SERIES, current.roundSeries, dir) }),
      },
      {
        id: 'final',
        label: 'Finali dei tabelloni',
        text: seriesLabel(value.finalSeries),
        note: 'Finale dei vincenti e finale dei perdenti',
        step: (current, dir) => ({ ...current, finalSeries: cycle(SERIES, current.finalSeries, dir) }),
      },
      {
        id: 'grand',
        label: 'Gran finale',
        text: grandFinalLabel(grand),
        note: grandEntry.note,
        step: (current, dir) => ({
          ...current,
          options: { ...current.options, grandFinal: cycle(GRAND_FINALS.map((item) => item.id), grandFinalOf(current), dir) },
        }),
      },
    )
    if (grand !== 'none') {
      rows.push({
        id: 'grandSeries',
        label: 'Serie della gran finale',
        text: grandSeriesLabel(grandSeriesOf(value)),
        note: grand === 'reset' ? 'Vale anche per la rivincita' : null,
        step: (current, dir) => ({
          ...current,
          options: { ...current.options, grandSeries: cycle(GRAND_SERIES, grandSeriesOf(current), dir) },
        }),
      })
    }
  }
  if (value.format === 'round_robin') {
    rows.push(...leagueRows(value))
  }
  return rows
}

/**
 * Modale del formato del torneo (README «Torneo»). A sinistra i formati
 * (▲ ▼ circolare; quelli non ancora pronti sono grigi con «in arrivo» e non
 * si scelgono), a destra le opzioni del formato evidenziato. ▶ (o A) passa
 * alle opzioni, dove ▲ ▼ scelgono la riga e ◀ ▶ cambiano il valore; B torna
 * all'elenco. START conferma; B sull'elenco chiude senza cambiare nulla.
 *
 * Non chiama l'API: riceve `value` (`{format, options, seeding,
 * seedingWeight, advantagedSide, roundSeries, finalSeries, thirdPlace}`) e
 * `sides` (lati P1/P2 del torneo, per il lato vantaggiato) e restituisce il
 * nuovo valore con `onConfirm(value)`; `onCancel()` chiude. Gli eventi di
 * input arrivano da `inputRef.current(event)`; `onContext(nome)` indica la
 * legenda (`tournamentFormat` o `tournamentFormatOptions`). Con
 * `startableOnly` (schermata «Avvia») si scelgono solo i formati che si
 * avviano già. Con `general` falso (Impostazioni) mancano teste di serie,
 * pesi e lato vantaggiato, che lì sono righe del modulo; nella schermata
 * «Avvia» ci sono tutte.
 */
export default function FormatDialog({ value: initial, sides, inputRef, onConfirm, onCancel, onContext,
  startableOnly = false, general = true }) {
  const usable = (id) => (startableOnly ? formatStartable(id) : formatReady(id))
  const [value, setValue] = useState(() => ({ ...initial, options: { ...(initial.options || {}) } }))
  const [cursor, setCursor] = useState(() => Math.max(0, FORMATS.findIndex((item) => item.id === initial.format)))
  const [panel, setPanel] = useState('list')
  const [row, setRow] = useState(0)
  const highlighted = FORMATS[cursor]
  const ready = usable(highlighted.id)
  const rows = ready ? optionRows(value, sides, general) : []
  const rowIndex = Math.min(row, Math.max(0, rows.length - 1))

  useEffect(() => {
    if (onContext) {
      onContext(panel === 'options' ? 'tournamentFormatOptions' : 'tournamentFormat')
    }
  }, [panel, onContext])

  const moveFormat = (index) => {
    setCursor(index)
    const target = FORMATS[index]
    if (usable(target.id) && target.id !== value.format) {
      // Al cambio restano i valori comuni (serie dei turni e della finale comprese); le opzioni ripartono dai
      // predefiniti e la serie dei turni torna tra quelle ammesse.
      const options = defaultOptions(target.id)
      setValue({ ...value, format: target.id, options,
        roundSeries: fitSeries(value.roundSeries, seriesChoices(target.id, options)) })
    }
  }

  const enterOptions = () => {
    if (ready && rows.length) {
      setPanel('options')
    }
  }

  const changeRow = (index, dir) => {
    const target = rows[index]
    if (target) {
      setRow(index)
      setValue(target.step(value, dir))
    }
  }

  const confirm = () => onConfirm(value)

  const handle = (event) => {
    if (event.kind === 'release') {
      return
    }
    const press = event.kind === 'press'
    if (press && event.button === 'start') {
      confirm()
      return
    }
    if (panel === 'list') {
      if (VERTICAL[event.button]) {
        moveFormat(stepIndex(cursor, VERTICAL[event.button], FORMATS.length, true))
      } else if (press && (event.button === 'right' || event.button === 'a')) {
        enterOptions()
      } else if (press && event.button === 'b') {
        onCancel()
      }
      return
    }
    if (VERTICAL[event.button] && rows.length) {
      setRow(stepIndex(rowIndex, VERTICAL[event.button], rows.length, wraps(event)))
    } else if (HORIZONTAL[event.button]) {
      changeRow(rowIndex, HORIZONTAL[event.button])
    } else if (press && event.button === 'a') {
      changeRow(rowIndex, 1)
    } else if (press && event.button === 'b') {
      setPanel('list')
    }
  }

  // Ad ogni render la funzione dei tasti vede i valori aggiornati.
  useEffect(() => {
    inputRef.current = handle
    return () => {
      inputRef.current = null
    }
  })

  return (
    <div className={settingsStyles.modalOverlay}>
      <section className={`${settingsStyles.modal} ${styles.dialog}`} role="dialog" aria-label="Formato del torneo">
        <div className={settingsStyles.systemHead}>
          <span className={`pix ${settingsStyles.systemName}`}>FORMATO DEL TORNEO</span>
          <button type="button" className={settingsStyles.modalClose} onClick={onCancel}>
            Annulla
          </button>
        </div>
        <div className={styles.body}>
          <ul className={styles.formats}>
            {FORMATS.map((entry, index) => {
              const classes = [styles.format]
              const available = usable(entry.id)
              if (!available) {
                classes.push(styles.soon)
              }
              if (index === cursor) {
                classes.push(panel === 'list' ? styles.active : styles.current)
              }
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={classes.join(' ')}
                    onClick={() => {
                      moveFormat(index)
                      setPanel('list')
                    }}
                  >
                    <span className={styles.formatName}>{entry.label}</span>
                    {available
                      ? entry.id === value.format && <span className={styles.chosen} aria-label="scelto">●</span>
                      : <span className={styles.soonTag}>in arrivo</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className={styles.options}>
            {!ready && (
              <p className={styles.soonText}>
                {highlighted.ready
                  ? `«${highlighted.label}» si sceglie già nelle Impostazioni e si potrà avviare con il prossimo ` +
                    'aggiornamento.'
                  : `«${highlighted.label}» arriva con i prossimi aggiornamenti.`}
              </p>
            )}
            {rows.map((entry, index) => {
              const active = panel === 'options' && index === rowIndex
              return (
                <div key={entry.id} className={active ? `${styles.option} ${styles.optionActive}` : styles.option}>
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{entry.label}</span>
                    {entry.note && <span className={styles.optionNote}>{entry.note}</span>}
                  </span>
                  <span className={styles.value}>
                    <button
                      type="button"
                      className={styles.arrow}
                      aria-label="Valore precedente"
                      onClick={() => {
                        setPanel('options')
                        changeRow(index, -1)
                      }}
                    >
                      ◀
                    </button>
                    <span className={styles.valueText}>
                      {entry.slider !== undefined && (
                        <span className={styles.slider} aria-hidden="true">
                          <span className={styles.sliderFill} style={{ width: `${entry.slider}%` }} />
                        </span>
                      )}
                      {entry.text}
                    </span>
                    <button
                      type="button"
                      className={styles.arrow}
                      aria-label="Valore successivo"
                      onClick={() => {
                        setPanel('options')
                        changeRow(index, 1)
                      }}
                    >
                      ▶
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className={settingsStyles.actions}>
          <span className={settingsStyles.spacer} />
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} onClick={confirm}>
            Conferma
          </button>
        </div>
      </section>
    </div>
  )
}
