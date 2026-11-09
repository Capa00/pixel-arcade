import { useEffect, useState } from 'react'
import FilterPanel from './FilterPanel.jsx'
import MultiPickerMenu from './MultiPickerMenu.jsx'
import PickerMenu from './PickerMenu.jsx'
import {
  ALL,
  MODE,
  allSelected,
  filterItems,
  groupRows,
  jumpGroup,
  keepCursor,
  moveCursor,
  toggle,
  toggleAll,
} from './multiPicker.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { openKeyboard, setPickerFilter } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'

const VERTICAL = { up: -1, down: 1 }
// Lunghezza massima del testo cercato nei menu dei valori.
const MENU_FILTER_MAX = 40

/**
 * Pannello dei filtri con i suoi menu (src/components/FilterPanel.jsx,
 * MultiPickerMenu e PickerMenu), usato dalla libreria e dalle playlist nelle
 * Impostazioni. Le righe `rows` (`{id, label, value, active, kind, disabled,
 * section}`) le prepara chi lo usa: `kind` vale `multi` (menu a scelta
 * multipla), `single` (menu a scelta singola), `text` (testo, `onText`) o
 * `action` (`onAction`).
 *
 * `menuFor(id)` dà il menu di un filtro: `{title, items, selected, excluded}`
 * (`multi`, id spuntati; con `excluded` booleano il menu ha la riga «Modo»,
 * Mostra solo / Nascondi) o `{title, items, current}` (`single`, id scelto).
 * Con «Applica» (o la scelta nel menu singolo) arriva `onApply(id, valore,
 * nascondi)`, dove `nascondi` vale solo per i menu con la riga «Modo»; Y su una riga
 * chiama `onClear(id)`, X `onSearch(pad)` (ricerca per titolo, se c'è),
 * B o SELECT `onClose()`. Una riga `disabled` si può evidenziare ma A non fa
 * nulla (o mostra `onDisabled(row)`, se c'è).
 *
 * Gli eventi arrivano da `inputRef.current(event)`; `onContext(nome)` indica
 * la legenda (`filters`, `filterMenu`, `picker`). La ricerca nei menu usa la
 * tastiera a schermo (`purpose: 'filter'`, testo in `state.pickerFilter`).
 */
export default function FilterEditor({
  title,
  accent,
  count,
  rows,
  menuFor,
  inputRef,
  onContext,
  onApply,
  onClear,
  onText,
  onAction,
  onDisabled,
  onSearch,
  onClose,
}) {
  const { state, dispatch } = useApp()
  const [index, setIndex] = useState(0)
  const [menu, setMenu] = useState(null)
  const at = Math.min(index, rows.length - 1)
  const keyboard = Boolean(state.osk)

  let context = 'filters'
  if (menu) {
    context = menu.kind === 'multi' ? 'filterMenu' : 'picker'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])

  useEffect(() => () => dispatch(setPickerFilter('')), [dispatch])

  const openMenu = (row) => {
    const data = menuFor(row.id)
    if (!data) {
      return
    }
    if (row.kind === 'multi') {
      dispatch(setPickerFilter(''))
      setMenu({
        field: row.id,
        kind: 'multi',
        title: data.title,
        items: data.items,
        cursor: ALL,
        selected: [...data.selected],
        mode: typeof data.excluded === 'boolean' ? (data.excluded ? 'exclude' : 'include') : null,
      })
    } else {
      setMenu({
        field: row.id,
        kind: 'single',
        title: data.title,
        items: data.items,
        index: Math.max(0, data.items.findIndex((item) => item.id === data.current)),
      })
    }
  }

  const closeMenu = () => {
    setMenu(null)
    dispatch(setPickerFilter(''))
  }

  const activate = (row, pad) => {
    if (!row) {
      return
    }
    if (row.disabled) {
      if (onDisabled) {
        onDisabled(row)
      }
      return
    }
    if (row.kind === 'multi' || row.kind === 'single') {
      openMenu(row)
    } else if (row.kind === 'text') {
      onText(row.id, pad)
    } else {
      onAction(row.id, pad)
    }
  }

  const applyMulti = () => {
    onApply(menu.field, menu.selected, menu.mode === 'exclude')
    closeMenu()
  }

  const switchMode = () => {
    setMenu({ ...menu, cursor: MODE, mode: menu.mode === 'exclude' ? 'include' : 'exclude' })
  }

  const pickSingle = (position) => {
    const item = menu.items[position]
    if (item) {
      onApply(menu.field, item.id)
      closeMenu()
    }
  }

  const searchMenu = (pad) => {
    if (!keyboard) {
      dispatch(openKeyboard('filter', {
        owner: pad === undefined ? null : pad,
        value: state.pickerFilter,
        max: MENU_FILTER_MAX,
        position: 'left',
        title: 'Cerca',
        placeholder: 'Scrivi una parte del nome',
      }))
    }
  }

  const visible = menu && menu.kind === 'multi' ? filterItems(menu.items, state.pickerFilter) : []
  const cursor = menu && menu.kind === 'multi' ? keepCursor(visible, menu.cursor) : null

  const menuInput = (event) => {
    const press = event.kind === 'press'
    const step = VERTICAL[event.button]
    if (menu.kind === 'single') {
      if (step && (press || event.kind === 'repeat') && menu.items.length) {
        setMenu({ ...menu, index: stepIndex(menu.index, step, menu.items.length, wraps(event)) })
      } else if (press && event.button === 'a') {
        pickSingle(menu.index)
      } else if (press && event.button === 'b') {
        closeMenu()
      }
      return
    }
    if (step && (press || event.kind === 'repeat')) {
      setMenu({ ...menu, cursor: moveCursor(visible, cursor, step, wraps(event), Boolean(menu.mode)) })
    } else if (press && event.button === 'a' && cursor === MODE) {
      switchMode()
    } else if (press && event.button === 'a') {
      const selected = cursor === ALL ? toggleAll(menu.selected, visible) : toggle(menu.selected, cursor)
      setMenu({ ...menu, cursor, selected })
    } else if (press && event.button === 'y') {
      setMenu({ ...menu, cursor, selected: toggleAll(menu.selected, visible) })
    } else if (press && (event.button === 'lb' || event.button === 'rb')) {
      setMenu({ ...menu, cursor: jumpGroup(visible, cursor, event.button === 'lb' ? -1 : 1, true) })
    } else if (press && event.button === 'x') {
      searchMenu(event.pad)
    } else if (press && event.button === 'start') {
      applyMulti()
    } else if (press && event.button === 'b') {
      closeMenu()
    }
  }

  const handle = (event) => {
    if (event.kind === 'release' || event.kind === 'text') {
      return
    }
    if (menu) {
      menuInput(event)
      return
    }
    const press = event.kind === 'press'
    const step = VERTICAL[event.button]
    if (step && (press || event.kind === 'repeat') && rows.length) {
      setIndex(stepIndex(at, step, rows.length, wraps(event)))
    } else if (press && event.button === 'a') {
      activate(rows[at], event.pad)
    } else if (press && event.button === 'x' && onSearch) {
      onSearch(event.pad)
    } else if (press && event.button === 'y') {
      const row = rows[at]
      if (row && (row.kind === 'multi' || row.kind === 'single' || row.kind === 'text')) {
        onClear(row.id)
      }
    } else if (press && (event.button === 'b' || event.button === 'select')) {
      onClose()
    }
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  return (
    <>
      <FilterPanel
        title={title}
        accent={accent}
        rows={rows}
        index={at}
        count={count}
        onHover={setIndex}
        onPick={(position) => {
          if (!keyboard && !menu) {
            setIndex(position)
            activate(rows[position], null)
          }
        }}
        onClose={() => {
          if (!keyboard && !menu) {
            onClose()
          }
        }}
      />
      {menu && menu.kind === 'multi' && (
        <MultiPickerMenu
          title={menu.title}
          rows={groupRows(visible)}
          cursor={cursor}
          selected={menu.selected}
          filter={state.pickerFilter}
          count={visible.length}
          allChecked={allSelected(menu.selected, visible)}
          empty={menu.items.length ? 'Nessuna voce contiene il testo cercato.' : 'Nessun valore disponibile.'}
          keyboard={keyboard}
          confirmLabel="Applica"
          confirmEmpty
          mode={menu.mode}
          onMode={switchMode}
          onHover={(id) => setMenu({ ...menu, cursor: id })}
          onToggle={(id) => setMenu({ ...menu, cursor: id, selected: toggle(menu.selected, id) })}
          onToggleAll={() => setMenu({ ...menu, cursor: ALL, selected: toggleAll(menu.selected, visible) })}
          onFilter={() => searchMenu(null)}
          onConfirm={applyMulti}
          onClose={() => {
            if (!keyboard) {
              closeMenu()
            }
          }}
        />
      )}
      {menu && menu.kind === 'single' && (
        <PickerMenu
          title={menu.title}
          items={menu.items}
          index={menu.index}
          empty="Nessun valore disponibile."
          onHover={(position) => setMenu({ ...menu, index: position })}
          onPick={pickSingle}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
