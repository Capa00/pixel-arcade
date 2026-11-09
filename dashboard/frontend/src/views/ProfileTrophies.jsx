import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { hideBrokenImage } from '../lib/saves.js'
import { openKeyboard, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import profileStyles from './Profile.module.css'
import styles from './ProfileTrophies.module.css'

// Destinazioni del testo della tastiera a schermo durante il collegamento.
const USER_TARGET = 'raUser'
const PASSWORD_TARGET = 'raPassword'
const USER_MAX = 32
const PASSWORD_MAX = 128
// Trofei mostrati: ultimi del sito e ultimi vinti in coppia.
const RECENT_MAX = 6
const COOP_MAX = 4

const SCOPE = 'profile'

/** Rank come «#1.234 su 90.000». */
function rankLabel(summary) {
  if (!summary || !summary.rank) {
    return 'senza rank'
  }
  const total = summary.totalRanked ? ` su ${summary.totalRanked.toLocaleString('it-IT')}` : ''
  return `#${summary.rank.toLocaleString('it-IT')}${total}`
}

function Badge({ name }) {
  if (!name) {
    return <span className={styles.badge} aria-hidden="true" />
  }
  return <img className={styles.badge} src={api.raBadgeUrl(name)} alt="" loading="lazy" onError={hideBrokenImage} />
}

/** Data del sito («2026-10-01 17:30:00» o ISO) come «01/10/2026», oppure vuota. */
function shortDate(value) {
  const at = Date.parse(String(value || '').replace(' ', 'T'))
  return Number.isNaN(at) ? '' : new Date(at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function plural(count, one, many) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

/** Spiegazione per chi non ha ancora collegato l'account (o non conosce RetroAchievements). */
function Intro() {
  return (
    <div className={styles.intro}>
      <p className={styles.introTitle}>Hai un account su retroachievements.org?</p>
      <p className={styles.introText}>
        Collegalo da qui con «Collega account»: vedrai i tuoi punti, il rank e tutti i trofei che hai preso, anche
        fuori da Pixel Arcade.
      </p>
      <p className={styles.introText}>
        RetroAchievements è un sito gratuito che aggiunge trofei ai giochi retrò. Se non hai un account, puoi crearlo
        su retroachievements.org e poi collegarlo qui. La password serve solo per collegarlo e non viene salvata.
      </p>
    </div>
  )
}

/**
 * Sezione «Trofei» della pagina profilo: collegamento dell'account
 * RetroAchievements e trofei del profilo `accountId`: punti e rank, i giochi
 * in cui l'account ha preso trofei (30 per volta, A su un gioco chiama
 * `onOpenGame(game)` per la finestra con tutti i suoi trofei), gli ultimi
 * trofei del sito e quelli vinti in coppia.
 *
 * Il collegamento chiede nome utente e password con la tastiera a schermo
 * (fisica o del joypad `pad`); la password compare come pallini e il backend
 * la usa solo per ottenere il token. `item(id, onActivate)` sono le voci
 * navigabili della pagina; `version` cambia dopo ogni partita, per rileggere
 * i trofei; `onLinked` ricarica i profili.
 */
export default function ProfileTrophies({ accountId, raUser, pad, item, version, onLinked, onOpenGame }) {
  const { state, dispatch } = useApp()
  const [info, setInfo] = useState(null)
  const [reload, setReload] = useState(0)
  // Passo del collegamento: null, `user` o `password` (con il nome già scritto).
  const [step, setStep] = useState(null)
  const [busy, setBusy] = useState(false)
  // Giochi dell'account: `{status, message, games, more}`, con «Mostra altri» in corso (`loadingMore`).
  const [games, setGames] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Al primo arrivo dei giochi il focus va sul primo (non su «Scollega»).
  const placed = useRef(false)

  useEffect(() => {
    let alive = true
    api
      .raProfileGames(accountId)
      .then((data) => {
        if (!alive) {
          return
        }
        setGames(data)
        if (!placed.current && data.games.length) {
          placed.current = true
          dispatch(setFocus(SCOPE, `ragame-${data.games[0].id}`))
        }
      })
      .catch((error) => alive && setGames({ status: 'offline', message: error.message, games: [], more: false }))
    return () => {
      alive = false
    }
  }, [accountId, raUser, version, reload, dispatch])

  const loadMore = () => {
    if (loadingMore || !games || !games.more) {
      return
    }
    setLoadingMore(true)
    api
      .raProfileGames(accountId, games.offset + games.games.length)
      .then((data) => {
        setGames((current) => ({ ...data, offset: current.offset, games: [...current.games, ...data.games] }))
        if (data.games.length) {
          dispatch(setFocus(SCOPE, `ragame-${data.games[0].id}`))
        }
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setLoadingMore(false))
  }

  useEffect(() => {
    let alive = true
    api
      .raProfile(accountId)
      .then((data) => alive && setInfo(data))
      .catch((error) => alive && setInfo({ status: 'offline', message: error.message, session: [], recent: [] }))
    return () => {
      alive = false
    }
  }, [accountId, raUser, version, reload])

  // Tastiera chiusa: dopo il nome si chiede la password, dopo la password si collega l'account.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!step || keyboardOpen) {
      return
    }
    const target = keyboardText && keyboardText.target
    const value = keyboardText ? keyboardText.value.trim() : ''
    if (step.kind === 'user') {
      if (!target || target.kind !== USER_TARGET || !value) {
        setStep(null)
        return
      }
      setStep({ kind: 'password', username: value })
      dispatch(openKeyboard('text', {
        owner: pad,
        max: PASSWORD_MAX,
        secret: true,
        title: `Password di ${value}`,
        placeholder: 'Password di RetroAchievements',
        target: { kind: PASSWORD_TARGET },
      }))
      return
    }
    setStep(null)
    if (!target || target.kind !== PASSWORD_TARGET || !keyboardText.value) {
      return
    }
    setBusy(true)
    api
      .raLink(accountId, step.username, keyboardText.value)
      .then((data) => {
        dispatch(showToast(`Account RetroAchievements collegato: ${data.username}.`))
        onLinked()
        setReload((count) => count + 1)
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setBusy(false))
  }, [step, keyboardOpen, keyboardText, accountId, pad, dispatch, onLinked])

  const link = () => {
    if (busy || state.osk) {
      return
    }
    setStep({ kind: 'user' })
    dispatch(openKeyboard('text', {
      owner: pad,
      max: USER_MAX,
      title: 'Utente RetroAchievements',
      placeholder: 'Nome utente del sito',
      target: { kind: USER_TARGET },
    }))
  }

  const unlink = () => {
    if (busy) {
      return
    }
    setBusy(true)
    api
      .raUnlink(accountId)
      .then(() => {
        dispatch(showToast('Account RetroAchievements scollegato.'))
        onLinked()
        setReload((count) => count + 1)
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setBusy(false))
  }

  const user = info ? info.user : raUser
  const summary = info && info.summary
  const recent = info ? info.recent.slice(0, RECENT_MAX) : []
  const coop = info ? info.session.filter((entry) => entry.coop).slice(0, COOP_MAX) : []
  const status = info ? info.status : null
  const owned = games && games.status === 'ok' ? games.games : []

  let accountText = null
  if (!info) {
    accountText = 'Caricamento…'
  } else if (status === 'no_key') {
    accountText = (
      'Per mostrare i trofei la dashboard ha bisogno della chiave Web API di RetroAchievements. Inseriscila in '
      + 'Impostazioni → Configurazioni (si trova su retroachievements.org, nelle impostazioni del tuo account, '
      + 'alla voce Keys).'
    )
  } else if (status !== 'ok' && status !== 'not_linked') {
    accountText = info.message
  }

  return (
    <>
      <section className={profileStyles.section}>
        <div className={profileStyles.sectionHead}>
          <h2 className={profileStyles.sectionTitle}>RetroAchievements</h2>
          {user && <span className={profileStyles.sectionCount}>Account · {user}</span>}
        </div>
        {status === 'not_linked' && <Intro />}
        <div className={styles.account}>
          {summary ? (
            <span className={styles.points}>
              <strong>{summary.softcorePoints.toLocaleString('it-IT')}</strong> punti · rank {rankLabel(summary)}
            </span>
          ) : (
            <span className={`${profileStyles.emptyText} ${styles.points}`}>{accountText}</span>
          )}
          {user ? (
            <button type="button" className={profileStyles.ghost} data-autofocus {...item('ra-unlink', unlink)}>
              {busy ? 'Attendi…' : 'Scollega'}
            </button>
          ) : (
            <button type="button" className={profileStyles.ghost} data-autofocus {...item('ra-link', link)}>
              {busy ? 'Collegamento…' : 'Collega account'}
            </button>
          )}
        </div>
        {summary && info.message && <span className={profileStyles.emptyText}>{info.message}</span>}
      </section>

      {user && status === 'ok' && (
        <section className={profileStyles.section}>
          <div className={profileStyles.sectionHead}>
            <h2 className={profileStyles.sectionTitle}>I tuoi giochi</h2>
            {games && games.status === 'ok' && (
              <span className={profileStyles.sectionCount}>{plural(games.total, 'gioco', 'giochi')} con trofei</span>
            )}
          </div>
          {owned.length ? (
            <div className={styles.games}>
              {owned.map((game) => {
                const percent = game.total ? Math.round((game.earned / game.total) * 100) : 0
                const last = shortDate(game.lastAt)
                return (
                  <button key={game.id} type="button" className={styles.gameRow} {...item(`ragame-${game.id}`, () => onOpenGame(game))}>
                    {game.icon ? (
                      <img className={styles.icon} src={api.raIconUrl(game.icon)} alt="" loading="lazy" onError={hideBrokenImage} />
                    ) : (
                      <span className={styles.icon} aria-hidden="true" />
                    )}
                    <span className={styles.text}>
                      <span className={styles.title}>{game.title}</span>
                      <span className={styles.game}>
                        {game.console}
                        {last ? ` · ultimo trofeo il ${last}` : ''}
                      </span>
                    </span>
                    <span className={styles.progress} aria-label={`${percent}% dei trofei`}>
                      <span className={styles.progressFill} style={{ width: `${percent}%` }} />
                    </span>
                    <span className={styles.count}>
                      {game.earned}/{game.total}
                    </span>
                  </button>
                )
              })}
              {games.more && (
                <button type="button" className={`${profileStyles.ghost} ${styles.more}`} {...item('ragame-more', loadMore)}>
                  {loadingMore ? 'Caricamento…' : 'Mostra altri'}
                </button>
              )}
            </div>
          ) : (
            <span className={profileStyles.emptyText}>
              {!games ? 'Caricamento…' : games.status === 'ok' ? 'Nessun trofeo preso finora.' : games.message}
            </span>
          )}
        </section>
      )}

      {(recent.length > 0 || coop.length > 0) && (
        <section className={profileStyles.section}>
          <h2 className={profileStyles.sectionTitle}>Ultimi trofei</h2>
          {recent.length > 0 && (
            <ul className={styles.list} aria-label="Ultimi trofei">
              {recent.map((entry) => (
                <li key={entry.id} className={styles.trophy}>
                  <Badge name={entry.badge} />
                  <span className={styles.text}>
                    <span className={styles.title}>{entry.title}</span>
                    <span className={styles.game}>{entry.game}</span>
                  </span>
                  <span className={styles.value}>{entry.points}</span>
                </li>
              ))}
            </ul>
          )}
          {coop.length > 0 && (
            <ul className={styles.list} aria-label="Trofei in coppia">
              {coop.map((entry) => (
                <li key={`${entry.sessionId}-${entry.achievementId}`} className={styles.trophy}>
                  <span className={`${styles.badge} ${styles.coopBadge}`} aria-hidden="true">2P</span>
                  <span className={styles.text}>
                    <span className={styles.title}>{entry.title}</span>
                    <span className={styles.game}>
                      In coppia con {entry.earnerName || 'un ospite'}: sul sito è andato a P1
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
