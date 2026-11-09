import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import Avatar from '../components/Avatar.jsx'
import ChallengeList from '../components/ChallengeList.jsx'
import WrappedPeriods from '../components/WrappedPeriods.jsx'
import { useFocusScope } from '../input/useFocusScope.js'
import { stepId } from '../input/wrap.js'
import { coverStyle } from '../lib/covers.js'
import { dayTime } from '../lib/format.js'
import { hideBrokenImage } from '../lib/saves.js'
import {
  clickSlot,
  closeProfile,
  gotoGame,
  leaveSlot,
  openSettings,
  patchProfile,
  setFocus,
  showToast,
  toggleFavorite,
} from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO } from '../state/players.js'
import { gameKey, profileOf, profileTabs, splitKey } from '../state/profiles.js'
import ProfileOverview from './ProfileOverview.jsx'
import ProfilePrefs from './ProfilePrefs.jsx'
import ProfileRaGame from './ProfileRaGame.jsx'
import ProfileSaves from './ProfileSaves.jsx'
import ProfileStats from './ProfileStats.jsx'
import ProfileTrophies from './ProfileTrophies.jsx'
import styles from './Profile.module.css'

const MISSING_GAME = 'Gioco non più presente nella libreria.'
const SCOPE = 'profile'

function padLabel(slot) {
  return slot.pad === null ? 'Tastiera e mouse' : `Joypad ${slot.pad + 1}`
}

/**
 * Giochi con salvataggi del profilo registrato `accountId` (`null` per un
 * ospite, che non ne ha): `null` finché la risposta non arriva. Si rilegge
 * quando cambia `version` (le partite del profilo e le operazioni sui
 * salvataggi), cioè dopo ogni partita e ogni modifica.
 */
function useSaves(accountId, version) {
  const [games, setGames] = useState(null)
  useEffect(() => {
    if (accountId === null) {
      setGames([])
      return undefined
    }
    let alive = true
    api.saves(accountId)
      .then((data) => {
        if (alive) {
          setGames(data.games)
        }
      })
      .catch(() => {
        if (alive) {
          setGames([])
        }
      })
    return () => {
      alive = false
    }
  }, [accountId, version])
  return games
}

/**
 * Schede in alto: una sola visibile alla volta, si cambiano con LB/RB (o
 * [ ]) e col clic, come nelle Impostazioni.
 */
function Tabs({ tabs, current, onSelect }) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === current
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Salvataggi del profilo (scheda «Salvataggi»): una scheda per gioco con la
 * miniatura del «Riprendi»; A apre la modale del gioco con `onOpen(game)`.
 */
function SavesList({ accountId, games, item, onOpen }) {
  const { state } = useApp()
  const systemOf = (id) => state.systems.find((entry) => entry.id === id) || null
  const now = Date.now()
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Salvataggi</h2>
        {games && games.length > 0 && (
          <span className={styles.sectionCount}>{games.length === 1 ? '1 gioco' : `${games.length} giochi`}</span>
        )}
      </div>
      {games && games.length ? (
        <div className={styles.saves}>
          {games.map((game, position) => {
            const key = gameKey(game.system, game.id)
            const system = systemOf(game.system)
            const at = Date.parse(game.resumeAt || game.updatedAt)
            return (
              <button
                key={key}
                type="button"
                className={game.missing ? `${styles.save} ${styles.missing}` : styles.save}
                style={system ? { '--accent': system.accent } : undefined}
                data-autofocus={position === 0 || undefined}
                {...item(`save-${key}`, () => onOpen(game))}
              >
                <span className={styles.saveThumb} style={{ background: coverStyle(system, game.id).bg }}>
                  {game.thumb && (
                    <img
                      className={styles.saveImage}
                      src={api.saveThumbUrl(accountId, game.system, game.id, 0, game.resumeAt)}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenImage}
                    />
                  )}
                </span>
                <span className={styles.saveText}>
                  <span className={styles.saveTitle}>{game.title}</span>
                  <span className={`pix ${styles.saveSystem}`}>{game.missing ? 'Non più presente' : game.systemName}</span>
                  <span className={styles.saveDate}>
                    {Number.isNaN(at) ? '' : `${game.resumeAt ? 'Riprendi' : 'Salvato'} · ${dayTime(at, now)}`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <span className={styles.emptyText}>{games ? 'Nessun salvataggio' : 'Caricamento…'}</span>
      )}
    </section>
  )
}

/**
 * Pagina profilo del giocatore dello slot `state.profileSlot`: intestazione
 * con livello e azioni, sempre visibile, e schede (src/state/profiles.js,
 * `PROFILE_TABS`): Panoramica (src/views/ProfileOverview.jsx), Statistiche
 * (src/views/ProfileStats.jsx), Trofei (src/views/ProfileTrophies.jsx),
 * Salvataggi, Wrapped (src/components/WrappedPeriods.jsx), Sfide
 * (src/components/ChallengeList.jsx) e Preferenze
 * (src/views/ProfilePrefs.jsx). Un ospite ha solo
 * Panoramica e Preferenze.
 *
 * Si naviga con `useFocusScope('profile')`; gli eventi arrivano da App con
 * `inputRef.current(event)`, solo dal joypad del giocatore (più tastiera e
 * mouse). LB/RB cambiano scheda, in cerchio; B e SELECT tornano alla
 * libreria; Y su un preferito lo toglie. A su un gioco della scheda
 * «Salvataggi» apre la sua modale (src/views/ProfileSaves.jsx) e su un gioco
 * della scheda «Trofei» la finestra dei suoi trofei (src/views/ProfileRaGame.jsx):
 * ricevono gli eventi finché sono aperte. `onContext(nome)` indica ad App la legenda:
 * `profile` nella Panoramica, `profileTab` nelle altre schede, quella della
 * modale quando è aperta.
 */
export default function Profile({ inputRef, onContext }) {
  const { state, dispatch, loadProfiles } = useApp()
  const slotKey = state.profileSlot
  const slot = slotKey ? state.players[slotKey] : null
  const profile = slotKey ? profileOf(state, slotKey) : null
  const scope = useFocusScope(SCOPE)

  const accountId = profile && !profile.guest && Number.isInteger(profile.id) ? profile.id : null
  const tabs = profileTabs(accountId !== null)
  const [tab, setTab] = useState(tabs[0].id)
  const current = tabs.some((entry) => entry.id === tab) ? tab : tabs[0].id
  // Gioco con la modale dei salvataggi aperta, e modifiche fatte (per rileggere l'elenco).
  const [openSave, setOpenSave] = useState(null)
  const [changes, setChanges] = useState(0)
  // Gioco RetroAchievements con la finestra dei trofei aperta.
  const [openRaGame, setOpenRaGame] = useState(null)
  const [modalContext, setModalContext] = useState(null)
  const savesInput = useRef(null)
  const raGameInput = useRef(null)
  const savedGames = useSaves(accountId, `${profile ? profile.sessions : 0}-${changes}`)
  const closeSaves = useCallback(() => setOpenSave(null), [])
  const closeRaGame = useCallback(() => setOpenRaGame(null), [])
  const savesChanged = useCallback(() => setChanges((count) => count + 1), [])

  useEffect(() => {
    onContext(modalContext || (current === 'overview' ? 'profile' : 'profileTab'))
  }, [modalContext, current, onContext])

  useEffect(() => () => onContext(null), [onContext])

  // Cambio di scheda: il focus va sulla prima voce della nuova scheda.
  const showTab = (id) => {
    if (id !== current) {
      setTab(id)
      dispatch(setFocus(SCOPE, null))
    }
  }

  const goTo = (summary) => {
    if (summary.missing) {
      dispatch(showToast(MISSING_GAME, 'error'))
    } else {
      dispatch(gotoGame(summary.system, summary.id))
    }
  }

  const remove = (key) => {
    const { system, id } = splitKey(key)
    dispatch(toggleFavorite(slotKey, system, id))
  }

  const handle = (event) => {
    if (openSave || openRaGame) {
      const modal = openSave ? savesInput.current : raGameInput.current
      if (modal) {
        modal(event)
      }
      return
    }
    if (event.kind === 'release' || scope.handle(event) || event.kind !== 'press') {
      return
    }
    if (event.button === 'lb' || event.button === 'rb') {
      showTab(stepId(tabs, current, event.button === 'lb' ? -1 : 1))
    } else if (event.button === 'b' || event.button === 'select') {
      dispatch(closeProfile())
    } else if (event.button === 'y' && current === 'overview') {
      // Y sul preferito evidenziato (copertina o cuore) lo toglie.
      const match = /^(?:fav|unfav)-(.+)$/.exec(scope.focused || '')
      if (match) {
        remove(match[1])
      }
    }
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  if (!profile) {
    return null
  }

  const info = PLAYER_INFO[slotKey]
  const patch = (value) => dispatch(patchProfile(slotKey, value))
  const systemOf = (id) => state.systems.find((entry) => entry.id === id) || null

  return (
    <>
      <div className={styles.profile} style={{ '--player': info.color, '--profile': profile.color }} ref={scope.ref}>
        <div className={styles.head}>
          <button type="button" className={styles.iconButton} aria-label="Torna alla libreria" {...scope.item('back', () => dispatch(closeProfile()))}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Avatar id={accountId} name={profile.name} className={styles.avatar} />
          <div className={styles.identity}>
            <div className={styles.labelRow}>
              <span className={styles.name}>{profile.name}</span>
              <span className={`pix ${styles.tag}`}>{info.tag}</span>
              <span className={styles.pad}>{padLabel(slot)}</span>
              {profile.guest && <span className={styles.guest}>Ospite · nulla viene salvato</span>}
            </div>
            <div className={styles.levelRow}>
              <span className={styles.title}>{profile.title}</span>
              <span>Livello {profile.level}</span>
              <span className={styles.bar} aria-label={`${profile.xpPercent}% verso il livello ${profile.level + 1}`}>
                <span className={styles.fill} style={{ width: `${profile.xpPercent}%` }} />
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} {...scope.item('switch', () => dispatch(clickSlot(slotKey)))}>
              Cambia profilo
            </button>
            <button type="button" className={`${styles.ghost} ${styles.leave}`} {...scope.item('leave', () => dispatch(leaveSlot(slotKey)))}>
              Esci
            </button>
            <button type="button" className={styles.ghost} {...scope.item('settings', () => dispatch(openSettings()))}>
              Impostazioni
            </button>
          </div>
        </div>

        <Tabs tabs={tabs} current={current} onSelect={showTab} />

        <div className={styles.content}>
          {current === 'overview' && (
            <ProfileOverview profile={profile} color={info.color} item={scope.item} goTo={goTo} remove={remove} />
          )}
          {current === 'stats' && (
            <ProfileStats accountId={accountId} version={profile.sessions} item={scope.item} goTo={goTo} />
          )}
          {current === 'trophies' && (
            <ProfileTrophies
              accountId={accountId}
              raUser={profile.raUser || null}
              pad={slot.pad}
              item={scope.item}
              version={profile.sessions}
              onLinked={loadProfiles}
              onOpenGame={setOpenRaGame}
            />
          )}
          {current === 'saves' && (
            <SavesList accountId={accountId} games={savedGames} item={scope.item} onOpen={setOpenSave} />
          )}
          {current === 'wrapped' && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Wrapped</h2>
                <span className={styles.sectionCount}>Il riepilogo di ogni mese e di ogni anno</span>
              </div>
              <WrappedPeriods
                account={accountId}
                item={scope.item}
                empty="Ancora nessun Wrapped: arriva a fine mese, dopo almeno 3 partite."
              />
            </section>
          )}
          {current === 'challenges' && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Sfide trofeo</h2>
                <span className={styles.sectionCount}>Riparti dallo stato e sblocca il trofeo prima degli altri</span>
              </div>
              <ChallengeList account={accountId} item={scope.item} />
            </section>
          )}
          {current === 'prefs' && (
            <ProfilePrefs profile={profile} accountId={accountId} pad={slot.pad} item={scope.item} patch={patch} />
          )}
        </div>
      </div>
      {openSave && accountId !== null && (
        <ProfileSaves
          key={gameKey(openSave.system, openSave.id)}
          inputRef={savesInput}
          owner={{ id: accountId, name: profile.name, color: profile.color }}
          pad={slot.pad}
          game={openSave}
          system={systemOf(openSave.system)}
          onClose={closeSaves}
          onChanged={savesChanged}
          onContext={setModalContext}
        />
      )}
      {openRaGame && accountId !== null && (
        <ProfileRaGame
          key={openRaGame.id}
          inputRef={raGameInput}
          accountId={accountId}
          game={openRaGame}
          onClose={closeRaGame}
          onContext={setModalContext}
        />
      )}
    </>
  )
}
