import { useEffect } from 'react'
import Avatar from '../components/Avatar.jsx'
import FaceButton from '../components/FaceButton.jsx'
import { useFocusScope } from '../input/useFocusScope.js'
import {
  closeLogin,
  leaveSlot,
  login,
  loginForm,
  loginGuest,
  loginStep,
  openKeyboard,
  reserveGame,
  setFocus,
  showToast,
} from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { DEFAULT_NAME, NAME_MAX, PLAYER_INFO, SWATCHES } from '../state/players.js'
import styles from './LoginModal.module.css'

const OTHER = { p1: 'p2', p2: 'p1' }

function padLabel(slot) {
  return slot.pad === null ? 'Tastiera e mouse' : `Joypad ${slot.pad + 1}`
}

function consoleName(systems, id) {
  const system = systems.find((entry) => entry.id === id)
  return system ? system.name : null
}

function accountSub(account, systems) {
  const parts = [`Livello ${account.level}`, account.title]
  const name = consoleName(systems, account.favConsole)
  if (name) {
    parts.push(name)
  }
  parts.push(`${account.favorites.length} preferiti`)
  return parts.join(' · ')
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Finestra di accesso di uno slot (`slotKey`: `p1` a sinistra, `p2` a
 * destra), come nella demo: «Chi gioca?» con l'ospite, il nuovo profilo, i
 * profili ed «Esci»; oppure «Nuovo profilo» con nome e colore (la console
 * preferita si sceglie poi nella scheda TUTTE). Si naviga con `useFocusScope`, un focus per giocatore;
 * `register(slotKey, handle)` consegna a LoginLayer la funzione che riceve
 * gli eventi del giocatore. `dual` è vero con entrambe le finestre aperte
 * (o con la classifica accanto): si dividono lo schermo senza sovrapporsi.
 * `away` è vero quando il joypad è nella classifica: il cursore qui non si vede
 * e un clic nella finestra lo riporta qui (`onReturn`).
 *
 * Con un gioco prenotato dalla classifica (`state.reservedGame`) una fascia
 * lo ricorda; X o la sua ✕ lo tolgono.
 */
export default function LoginModal({ slotKey, dual = false, away = false, onReturn, register }) {
  const { state, dispatch, createProfile } = useApp()
  const slot = state.players[slotKey]
  const other = state.players[OTHER[slotKey]]
  const info = PLAYER_INFO[slotKey]
  const isNew = slot.step === 'new'
  const scope = useFocusScope(`login-${slotKey}-${slot.step}`)
  const reserved = state.reservedGame && state.reservedGame.slot === slotKey ? state.reservedGame : null

  const close = () => dispatch(closeLogin(slotKey))
  const back = () => dispatch(loginStep(slotKey, 'choose'))

  const editName = () => {
    if (state.osk) {
      dispatch(showToast('La tastiera a schermo è già in uso: aspetta che l\'altro giocatore finisca.'))
      return
    }
    dispatch(openKeyboard('profileName', {
      owner: slot.pad,
      value: slot.form.name,
      max: NAME_MAX,
      position: slotKey === 'p1' ? 'left' : 'right',
      title: 'Nome giocatore',
      placeholder: 'es. PLAYER_ONE',
      target: { kind: 'profile', slot: slotKey, pad: slot.pad },
      upper: true,
    }))
  }

  const create = () => {
    if (!slot.saving) {
      createProfile(slotKey, { ...slot.form, name: slot.form.name || DEFAULT_NAME })
    }
  }

  const handle = (event) => {
    if (event.kind === 'release' || scope.handle(event) || event.kind !== 'press') {
      return
    }
    if (event.button === 'x' && reserved && !isNew) {
      dispatch(reserveGame(slotKey))
      return
    }
    if (event.button === 'b') {
      if (isNew) {
        back()
      } else {
        close()
      }
    }
  }

  useEffect(() => {
    register(slotKey, handle)
  })

  useEffect(() => () => register(slotKey, null), [register, slotKey])

  // Alla chiusura si dimentica la voce selezionata: la finestra si riapre sempre sulla prima («Gioca come ospite»).
  useEffect(() => () => {
    dispatch(setFocus(`login-${slotKey}-choose`, null))
    dispatch(setFocus(`login-${slotKey}-new`, null))
  }, [dispatch, slotKey])

  // I profili vengono dopo l'ospite e il profilo nuovo (selezionato all'apertura c'è l'ospite):
  // chi non ha un profilo suo non entra col primo della lista.
  const otherId = other.user && !other.user.guest ? other.user.id : null
  const accounts = state.accounts.map((account) => {
    const taken = account.id === otherId
    const focusProps = taken ? {} : scope.item(`account-${account.id}`, () => dispatch(login(slotKey, account)))
    return (
      <button
        key={account.id}
        type="button"
        className={taken ? `${styles.row} ${styles.account} ${styles.taken}` : `${styles.row} ${styles.account}`}
        disabled={taken}
        {...focusProps}
      >
        <Avatar id={account.id} name={account.name} className={styles.avatar} style={{ background: account.color }} />
        <span className={styles.rowText}>
          <span className={styles.accountName}>{account.name}</span>
          <span className={styles.rowSub}>{accountSub(account, state.systems)}</span>
        </span>
        {taken ? <span className={styles.takenBadge}>In uso da {PLAYER_INFO[OTHER[slotKey]].tag}</span> : <Chevron />}
      </button>
    )
  })

  const previewName = slot.form.name || DEFAULT_NAME

  return (
    <section
      className={[styles.modal, slotKey === 'p1' ? styles.left : styles.right, dual ? styles.dual : '', away ? styles.away : ''].join(' ')}
      style={{ '--player': info.color }}
      role="dialog"
      aria-modal="true"
      aria-label={`Accesso ${info.label}`}
      ref={scope.ref}
      onPointerDown={away ? onReturn : undefined}
    >
      <div className={styles.strip} />

      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.labelRow}>
            <span className={`pix ${styles.tag}`}>{info.tag}</span>
            <span className={styles.padText}>
              {info.label} · {padLabel(slot)}
            </span>
          </div>
          <div className={styles.heading}>{isNew ? 'Nuovo profilo' : 'Chi gioca?'}</div>
          <div className={styles.sub}>
            {isNew
              ? 'Bastano un nome e un colore. Potrai cambiare tutto dal profilo.'
              : 'Scegli il tuo profilo per ritrovare preferiti e progressi.'}
          </div>
        </div>
        <button type="button" className={styles.close} aria-label="Chiudi" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {reserved && (
        <div className={styles.reserved}>
          <span className={styles.reservedText}>
            Poi si va a: <strong>{reserved.title}</strong>
          </span>
          <button type="button" className={styles.reservedClear} aria-label="Togli il gioco prenotato" onClick={() => dispatch(reserveGame(slotKey))}>
            <FaceButton position="west" />
            Togli
          </button>
        </div>
      )}

      <div className={styles.body}>
        {isNew ? (
          <>
            <div className={styles.preview}>
              <span className={`${styles.avatar} ${styles.big}`} style={{ background: slot.form.color }}>
                {previewName[0]}
              </span>
              <span className={styles.rowText}>
                <span className={styles.previewName}>{previewName}</span>
                <span className={styles.rowSub}>Livello 1 · Recluta</span>
              </span>
            </div>

            <div className={styles.group}>
              <div className={styles.groupLabel}>NOME GIOCATORE</div>
              <button type="button" className={styles.name} data-autofocus {...scope.item('name', editName)}>
                {slot.form.name ? slot.form.name : <span className={styles.placeholder}>es. PLAYER_ONE</span>}
              </button>
              {slot.error ? (
                <span className={styles.error}>{slot.error}</span>
              ) : (
                <span className={styles.hint}>Massimo 12 caratteri. Si scrive con la tastiera a schermo.</span>
              )}
            </div>

            <div className={styles.group}>
              <div className={styles.groupLabel}>COLORE</div>
              <div className={styles.swatches}>
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={slot.form.color === color ? `${styles.swatch} ${styles.on}` : styles.swatch}
                    style={{ background: color }}
                    aria-label={`Colore ${color}`}
                    aria-pressed={slot.form.color === color}
                    {...scope.item(`color-${color}`, () => dispatch(loginForm(slotKey, { color })))}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.row}
              data-autofocus
              {...scope.item('guest', () => dispatch(loginGuest(slotKey)))}
            >
              <span className={`${styles.avatar} ${styles.icon}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>Gioca come ospite</span>
                <span className={styles.rowSub}>Parti subito, preferiti e progressi non vengono salvati</span>
              </span>
            </button>
            <button type="button" className={styles.row} {...scope.item('new', () => dispatch(loginStep(slotKey, 'new')))}>
              <span className={`${styles.avatar} ${styles.icon}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>Crea un nuovo profilo</span>
                <span className={styles.rowSub}>Nome e colore: niente password</span>
              </span>
            </button>

            <div className={styles.or}>
              <span className={styles.line} />
              oppure
              <span className={styles.line} />
            </div>

            <div className={styles.groupLabel}>PROFILI SU QUESTA CONSOLE</div>
            {accounts.length ? accounts : <div className={styles.none}>Nessun profilo: creane uno qui sopra.</div>}
            {slot.user && (
              <button type="button" className={styles.row} {...scope.item('leave', () => dispatch(leaveSlot(slotKey)))}>
                <span className={`${styles.avatar} ${styles.icon}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 5h4v14h-4M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>Esci</span>
                  <span className={styles.rowSub}>
                    Libera lo slot {info.tag}
                    {slotKey === 'p1' && other.joined ? ': P2 diventa P1' : ''}
                  </span>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.foot}>
        {isNew ? (
          <>
            <button type="button" className={styles.back} {...scope.item('back', back)}>
              Indietro
            </button>
            <button type="button" className={styles.create} disabled={slot.saving} {...scope.item('create', create)}>
              {slot.saving ? 'Creazione…' : 'Crea profilo e gioca'}
            </button>
          </>
        ) : (
          <>
            <span className={styles.quote}>“It&apos;s dangerous to go alone! Take this.” — The Legend of Zelda</span>
            <span className={styles.legend}>
              <FaceButton position="south" />
              Conferma
            </span>
            <span className={styles.legend}>
              <FaceButton position="east" />
              Annulla
            </span>
          </>
        )}
      </div>
    </section>
  )
}
