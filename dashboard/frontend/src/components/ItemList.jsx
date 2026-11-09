import styles from './ItemList.module.css'

/**
 * Lista semplice (per esempio i core di una console, già nell'ordine
 * automatico), con in fondo le righe di `actions` (`{id, label, onActivate}`,
 * per esempio «Aggiungi core…»). Ogni riga è selezionabile col joypad tramite
 * `item(id, onActivate)` di `useFocusScope`; gli id sono `${id}:item:${valore}`
 * e `${id}:action:${action.id}`. Sulla riga a fuoco X toglie il valore (lo
 * gestisce la vista); col mouse lo stesso comando è il pulsante ✕ della riga.
 * `renderItem(valore)` disegna il contenuto, `muted(valore)` attenua la riga.
 */
export default function ItemList({ id, items, renderItem, muted, item, actions, onActivateItem, onRemove }) {
  return (
    <ul className={styles.list}>
      {items.map((value) => (
        <li
          key={value}
          className={muted && muted(value) ? `${styles.row} ${styles.muted}` : styles.row}
          {...item(`${id}:item:${value}`, () => onActivateItem(value))}
        >
          <span className={styles.content}>{renderItem(value)}</span>
          <span className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              aria-label="Togli dalla lista"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(value)
              }}
            >
              ✕
            </button>
          </span>
        </li>
      ))}
      {actions.map((action) => (
        <li key={action.id} className={`${styles.row} ${styles.add}`} {...item(`${id}:action:${action.id}`, action.onActivate)}>
          <span className={`pix ${styles.plus}`}>+</span>
          <span className={styles.content}>{action.label}</span>
        </li>
      ))}
    </ul>
  )
}
