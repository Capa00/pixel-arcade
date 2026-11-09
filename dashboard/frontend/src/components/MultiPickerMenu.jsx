import { useEffect, useRef } from 'react'
import { pointerActive } from '../input/pointer.js'
import { ALL, MODE } from './multiPicker.js'
import styles from './PickerMenu.module.css'

/** Spunta di una voce: ✓ verde, oppure ✕ rossa in modo «Nascondi» (`excluded`). */
function Check({ on, excluded = false }) {
  let className = styles.check
  if (on) {
    className = `${styles.check} ${excluded ? styles.crossed : styles.checked}`
  }
  return (
    <span className={className} aria-hidden="true">
      {on ? (excluded ? '✕' : '✓') : ''}
    </span>
  )
}

/**
 * Menu a comparsa (livello 50) a selezione multipla, con ricerca e gruppi.
 * `rows` sono le righe filtrate (src/components/multiPicker.js, `groupRows`),
 * `cursor` l'id della riga evidenziata (`ALL` per «Seleziona tutte»),
 * `selected` gli id spuntati, anche quelli nascosti dal filtro.
 * Joypad e tastiera li gestisce la vista; col mouse il passaggio evidenzia
 * (`onHover(id)`), il clic su una voce la spunta (`onToggle(id)`), il clic
 * su «Seleziona tutte» chiama `onToggleAll`, quello sul campo «Cerca»
 * `onFilter`, quello su «Aggiungi» `onConfirm` e il clic fuori dal pannello
 * `onClose`. Con `keyboard` (tastiera a schermo aperta) il pannello si sposta
 * a destra, così resta visibile accanto alla tastiera. `confirmLabel` è la
 * scritta del pulsante di conferma («Aggiungi»); con `confirmEmpty` si può
 * confermare anche senza voci spuntate. Con `mode` (`'include'` o
 * `'exclude'`) in testa c'è la riga «Modo» (cursore `MODE`): il clic chiama
 * `onMode`; in modo `'exclude'` le voci spuntate hanno una ✕ e si nascondono.
 */
export default function MultiPickerMenu({
  title,
  rows,
  cursor,
  selected,
  filter,
  count,
  allChecked,
  empty,
  keyboard,
  onHover,
  onToggle,
  onToggleAll,
  onFilter,
  onConfirm,
  onClose,
  confirmLabel = 'Aggiungi',
  confirmEmpty = false,
  mode,
  onMode,
}) {
  const listRef = useRef(null)

  useEffect(() => {
    const list = listRef.current
    const active = list && Array.from(list.querySelectorAll('[data-cursor]')).find((node) => node.dataset.cursor === cursor)
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [cursor, rows])

  const hover = (id) => (event) => {
    if (pointerActive(event)) {
      onHover(id)
    }
  }

  const itemClass = (id) => (id === cursor ? `${styles.item} ${styles.active}` : styles.item)

  return (
    <div
      className={keyboard ? `${styles.overlay} ${styles.besideKeyboard}` : styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={`${styles.panel} ${styles.wide}`} role="dialog" aria-label={title}>
        <div className={styles.head}>
          <span className={`pix ${styles.title}`}>{title}</span>
          <span className={styles.counter}>{selected.length === 1 ? '1 selezionata' : `${selected.length} selezionate`}</span>
        </div>
        <button type="button" className={keyboard ? `${styles.search} ${styles.searching}` : styles.search} onClick={onFilter}>
          <span className={styles.searchLabel}>Cerca</span>
          <span className={filter ? styles.searchValue : `${styles.searchValue} ${styles.placeholder}`}>
            {filter || 'Scrivi una parte del nome'}
          </span>
        </button>
        <ul className={styles.list} ref={listRef} role="listbox" aria-multiselectable="true">
          {mode && (
            <li role="presentation">
              <button
                type="button"
                data-cursor={MODE}
                className={`${itemClass(MODE)} ${styles.modeRow}`}
                onPointerEnter={hover(MODE)}
                onClick={onMode}
              >
                <span className={styles.label}>Modo</span>
                <span className={mode === 'exclude' ? `${styles.mode} ${styles.modeExclude}` : styles.mode}>
                  {mode === 'exclude' ? 'Nascondi i giochi scelti' : 'Mostra solo i giochi scelti'}
                </span>
              </button>
            </li>
          )}
          <li role="option" aria-selected={allChecked}>
            <button
              type="button"
              data-cursor={ALL}
              className={`${itemClass(ALL)} ${styles.allRow}`}
              disabled={!count}
              onPointerEnter={hover(ALL)}
              onClick={onToggleAll}
            >
              <Check on={allChecked} />
              <span className={styles.label}>
                {allChecked ? `Deseleziona le ${count} filtrate` : `Seleziona tutte le ${count} filtrate`}
              </span>
            </button>
          </li>
          {rows.map((row) =>
            row.kind === 'group' ? (
              <li key={`group:${row.group}`} className={`pix ${styles.group}`} role="presentation">
                {row.group}
              </li>
            ) : (
              <li key={row.item.id} role="option" aria-selected={selected.includes(row.item.id)}>
                <button
                  type="button"
                  data-cursor={row.item.id}
                  className={itemClass(row.item.id)}
                  onPointerEnter={hover(row.item.id)}
                  onClick={() => onToggle(row.item.id)}
                >
                  <Check on={selected.includes(row.item.id)} excluded={mode === 'exclude'} />
                  <span className={styles.label}>{row.item.label}</span>
                  {row.item.note && <span className={styles.note}>{row.item.note}</span>}
                </button>
              </li>
            ),
          )}
        </ul>
        {!count && <p className={styles.empty}>{empty}</p>}
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={onClose}>
            Chiudi
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={!confirmEmpty && !selected.length}
            onClick={onConfirm}
          >
            {selected.length ? `${confirmLabel} (${selected.length})` : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
