import { useEffect, useRef } from 'react'
import * as api from '../api/client.js'
import { BrandLogo, ConsoleLogo } from '../components/ConsoleLogo.jsx'
import { useFocusScope } from '../input/useFocusScope.js'
import Heart from '../components/Heart.jsx'
import { ALL_SCOPES, groupSystems, inRow, normalizePrefs, setForProfile, stepBrand } from '../lib/consoleTabs.js'
import { consolePrefsChanged, patchProfile, selectSystem, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { activeUsers } from '../state/players.js'
import { rowAccount, rowFavorite } from '../state/reducer.js'
import styles from './AllConsolesView.module.css'

// Ambiti di navigazione: marche, console della marca aperta e marca aperta (`state.focus`, così
// restano quando si apre una console e si torna con BACK).
const BRANDS_SCOPE = ALL_SCOPES.brands
const CONSOLES_SCOPE = ALL_SCOPES.consoles
const OPEN_BRAND = ALL_SCOPES.open
// Tasti che passano alla dashboard: cambio console, giocatori e profilo/Impostazioni; il tasto nord tra le marche.
const PASS = new Set(['lb', 'rb', 'start', 'select'])
const BRAND = 'brand:'
const SYS = 'sys:'

function gamesLabel(count) {
  if (count === 0) {
    return 'Nessun gioco'
  }
  return count === 1 ? '1 gioco' : `${count} giochi`
}

/** Etichetta della console: il logo, oppure il nome. */
function Label({ system }) {
  return (
    <ConsoleLogo
      system={system}
      className={styles.logo}
      fallback={<span className={`pix ${styles.fallback}`}>{system.name}</span>}
    />
  )
}

/** Casella della riga: verde con la spunta se la console c'è; col lucchetto se non si può cambiare. */
function CheckBox({ on, locked }) {
  const className = [styles.check, on ? styles.checkOn : ''].filter(Boolean).join(' ')
  return (
    <span className={className} aria-hidden="true">
      {locked ? (
        <svg viewBox="0 0 16 16">
          <rect x="4" y="7.5" width="8" height="6" rx="1" fill="currentColor" />
          <path d="M5.8 7.5V5.6a2.2 2.2 0 0 1 4.4 0v1.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ) : on && (
        <svg viewBox="0 0 16 16">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

/** Lato sinistro di una marca (colonna fissa): il suo logo, l'icona a pixel (computer, arcade) o il nome. */
function BrandSide({ group }) {
  return (
    <span className={styles.brandSide} role="heading" aria-level={2} aria-label={group.name}>
      <BrandLogo
        brand={group.brand}
        className={styles.brandLogo}
        iconClassName={styles.pixelIcon}
        fallback={<span className={`pix ${styles.brandName}`}>{group.name}</span>}
      />
    </span>
  )
}

/**
 * Scheda TUTTE (src/lib/consoleTabs.js): le marche una sotto l'altra, col
 * nome in verticale e accanto la griglia delle loro console. Le frecce
 * scelgono la marca; A ci entra (le altre si attenuano e i loghi diventano a
 * colori), poi le frecce scelgono la console: A la apre (BACK dalla libreria
 * riporta qui), il tasto ovest accende o spegne la sua casella nella riga del
 * profilo del P1, il tasto nord la rende la sua preferita (sempre nella riga,
 * col cuore), B torna alle marche. LT/RT passano alla marca precedente o
 * successiva: tra le marche spostano la selezione, dentro una marca aprono
 * subito l'altra sulla sua prima console (sempre circolari). Navigazione circolare come nella griglia dei giochi.
 * Riceve gli eventi da `inputRef.current(event)` e indica la legenda con `onContext`.
 */
export default function AllConsolesView({ inputRef, onContext }) {
  const { state, dispatch } = useApp()
  const brandsScope = useFocusScope(BRANDS_SCOPE)
  const consolesScope = useFocusScope(CONSOLES_SCOPE)
  const account = rowAccount(state)
  const user = state.players.p1.user
  const players = activeUsers(state.players).length > 0
  const prefs = state.consolePrefs
  const favorite = rowFavorite(state)
  const groups = groupSystems(state.systems)
  const open = groups.find((group) => group.brand === state.focus[OPEN_BRAND]) || null
  const live = useRef(null)
  live.current = { brandsScope, consolesScope, account, favorite, prefs, systems: state.systems, groups, open }

  let context = 'allBrands'
  if (open) {
    context = account !== null ? 'allConsoles' : 'allConsolesGuest'
  }
  const legend = players ? context : `${context}Home`
  useEffect(() => {
    onContext(legend)
  }, [legend, onContext])
  useEffect(() => () => onContext(null), [onContext])

  // Entra nella marca: il focus resta sulla console di prima se è di questa marca, altrimenti la prima.
  const enter = (brand) => {
    const group = live.current.groups.find((entry) => entry.brand === brand)
    if (!group) {
      return
    }
    const stored = (state.focus[CONSOLES_SCOPE] || '').slice(SYS.length)
    if (!group.systems.some((system) => system.id === stored)) {
      dispatch(setFocus(CONSOLES_SCOPE, `${SYS}${group.systems[0].id}`))
    }
    dispatch(setFocus(BRANDS_SCOPE, `${BRAND}${brand}`))
    dispatch(setFocus(OPEN_BRAND, brand))
  }
  const leave = () => dispatch(setFocus(OPEN_BRAND, null))

  // LT/RT: marca precedente o successiva; dentro una marca la apre subito.
  const jumpBrand = (dir) => {
    const current = live.current
    const from = current.open ? current.open.brand : (current.brandsScope.focused || '').slice(BRAND.length)
    const next = stepBrand(current.groups, from, dir)
    if (next === null) {
      return
    }
    if (current.open) {
      enter(next)
    } else {
      dispatch(setFocus(BRANDS_SCOPE, `${BRAND}${next}`))
    }
  }

  // □: accende o spegne la console nella riga del profilo del P1. La riga cambia subito; poi vale la
  // risposta del backend, oppure torna com'era se il salvataggio non riesce.
  const toggle = (id) => {
    const current = live.current
    const system = current.systems.find((entry) => entry.id === id)
    if (!system) {
      return
    }
    if (current.account === null) {
      dispatch(showToast('Entra con un profilo per scegliere le console della tua riga.'))
      return
    }
    if (id === current.favorite) {
      dispatch(showToast('È la tua console preferita: resta nella tua riga.'))
      return
    }
    const previous = current.prefs
    const on = !inRow(previous, current.account, system)
    dispatch(consolePrefsChanged(setForProfile(previous, current.account, id, on)))
    api.toggleConsoleRow(current.account, id, on)
      .then((data) => dispatch(consolePrefsChanged(normalizePrefs(data.consoles))))
      .catch((error) => {
        dispatch(consolePrefsChanged(previous))
        dispatch(showToast(error.message, 'error'))
      })
  }

  // △: la console diventa la preferita del profilo del P1; sulla preferita la toglie.
  const choose = (id) => {
    const current = live.current
    if (current.account === null) {
      dispatch(showToast('Entra con un profilo per scegliere la tua console preferita.'))
      return
    }
    dispatch(patchProfile('p1', { favConsole: id === current.favorite ? null : id }))
  }

  useEffect(() => {
    inputRef.current = (event) => {
      const current = live.current
      if (PASS.has(event.button) || (event.button === 'y' && !current.open)) {
        return false
      }
      const press = event.kind === 'press'
      if (event.button === 'lt' || event.button === 'rt') {
        if (press) {
          jumpBrand(event.button === 'rt' ? 1 : -1)
        }
        return true
      }
      if (!current.open) {
        current.brandsScope.handle(event)
        return true
      }
      if (current.consolesScope.handle(event)) {
        return true
      }
      if (press && event.button === 'b') {
        leave()
      } else if (press && (event.button === 'x' || event.button === 'y')) {
        const id = current.consolesScope.focused || ''
        if (id.startsWith(SYS)) {
          (event.button === 'x' ? toggle : choose)(id.slice(SYS.length))
        }
      }
      return true
    }
  })
  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  const shown = state.systems.filter((system) => inRow(prefs, account, system, favorite)).length
  const owner = account !== null && user ? user.name : 'casa'

  return (
    <div className={open ? `${styles.view} ${styles.entered}` : styles.view}>
      <header className={styles.head}>
        <h1 className={`pix ${styles.title}`}>TUTTE LE CONSOLE</h1>
        <p className={styles.note}>
          {`${state.systems.length} console · ${shown} nella riga di ${owner}`}
          {account === null && ' · entra con un profilo per scegliere le tue'}
        </p>
      </header>

      <div className={styles.brands} ref={open ? undefined : brandsScope.ref}>
        {groups.map((group) => {
          const isOpen = open && open.brand === group.brand
          const className = [styles.brand, isOpen ? styles.open : '', open && !isOpen ? styles.dimmed : '']
            .filter(Boolean)
            .join(' ')
          return (
            <section
              key={group.brand}
              className={className}
              style={{ '--accent': group.systems[0].accent }}
              {...(open ? {} : brandsScope.item(`${BRAND}${group.brand}`, () => enter(group.brand)))}
            >
              <BrandSide group={group} />
              <div className={styles.grid} ref={isOpen ? consolesScope.ref : undefined}>
                {group.systems.map((system) => {
                  const row = inRow(prefs, account, system, favorite)
                  const loved = system.id === favorite
                  const locked = account === null || loved
                  const focusProps = isOpen
                    ? consolesScope.item(`${SYS}${system.id}`, () => dispatch(selectSystem(system.id, true)))
                    : {}
                  return (
                    <div
                      key={system.id}
                      className={row ? styles.cell : `${styles.cell} ${styles.outside}`}
                      style={{ '--accent': system.accent }}
                      role={isOpen ? 'button' : undefined}
                      aria-label={isOpen ? `${system.name}${row ? ', nella riga' : ''}${loved ? ', preferita' : ''}` : undefined}
                      {...focusProps}
                    >
                      <span className={styles.plate}>
                        <Label system={system} />
                      </span>
                      <span className={styles.info}>
                        <span className={styles.title}>
                          <CheckBox on={row} locked={locked} />
                          <span className={styles.name}>{system.name}</span>
                          {loved && <Heart className={styles.fav} fill="var(--danger)" />}
                        </span>
                        <span className={styles.meta}>{gamesLabel(system.count || 0)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
