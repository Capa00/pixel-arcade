import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { attempts, clock, daysLeft } from '../lib/challenges.js'
import { requestChallenge, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './ChallengeList.module.css'

// Righe della classifica su ogni scheda.
const RANKING_ROWS = 3

function Card({ challenge, account, item, onPlay, autofocus }) {
  const { record } = challenge
  return (
    <button
      type="button"
      className={challenge.open ? styles.card : `${styles.card} ${styles.closed}`}
      data-autofocus={autofocus || undefined}
      {...item(`challenge-${challenge.id}`, () => onPlay(challenge))}
    >
      <span className={styles.top}>
        {challenge.thumb
          ? <img className={styles.thumb} src={api.challengeThumbUrl(challenge.id)} alt="" />
          : <span className={`${styles.thumb} ${styles.star}`}>★</span>}
        <span className={styles.info}>
          <span className={styles.trophy}>{challenge.achievementTitle}</span>
          <span className={styles.game}>{challenge.title}</span>
          <span className={styles.meta}>
            {challenge.creator.id === account ? 'La tua sfida' : `Di ${challenge.creator.name}`}
            {' · '}
            {challenge.open ? daysLeft(challenge.daysLeft) : 'conclusa'}
          </span>
        </span>
      </span>
      <span className={styles.numbers}>
        <span className={styles.number}>
          <span className={styles.label}>Record</span>
          <span className={`pix ${styles.value}`}>{record ? clock(record.seconds) : '–'}</span>
          {record && <span className={styles.holder}>{record.name}</span>}
        </span>
        <span className={styles.number}>
          <span className={styles.label}>Il tuo</span>
          <span className={`pix ${styles.value}`}>{clock(challenge.myBest)}</span>
          <span className={styles.holder}>{attempts(challenge.myAttempts)}</span>
        </span>
      </span>
      {challenge.ranking.length > 1 && (
        <ol className={styles.ranking}>
          {challenge.ranking.slice(0, RANKING_ROWS).map((row) => (
            <li key={row.account} className={row.account === account ? styles.me : ''}>
              <span className={styles.who}>{row.name}</span>
              <span className={styles.time}>{clock(row.best)}</span>
            </li>
          ))}
        </ol>
      )}
      {challenge.open && <span className={`pix ${styles.play}`}>{challenge.creator.id === account ? 'MIGLIORA IL TEMPO' : 'GIOCA'}</span>}
    </button>
  )
}

/**
 * Scheda «Sfide» del profilo `account` (README «Sfida trofeo»): sfide aperte
 * di altri, sfide lanciate dal profilo (con «Migliora il tempo» finché sono
 * aperte) e sfide concluse a cui ha partecipato, ognuna con record, tempo
 * del profilo e classifica. A (o il clic) su una sfida aperta la gioca;
 * senza account RetroAchievements compare l'invito a collegarlo. L'elenco
 * si rilegge dopo ogni partita.
 */
export default function ChallengeList({ account, item }) {
  const { state, dispatch } = useApp()
  const [data, setData] = useState(null)
  const runSeq = state.run.lastResult ? state.run.lastResult.seq : 0
  useEffect(() => {
    let alive = true
    api.challenges(account)
      .then((reply) => alive && setData(reply))
      .catch(() => alive && setData({ open: [], mine: [], ended: [], linked: false }))
    return () => {
      alive = false
    }
  }, [account, runSeq])

  if (!data) {
    return <span className={styles.empty}>Caricamento…</span>
  }
  const play = (challenge) => {
    if (!challenge.open) {
      return
    }
    if (!data.linked) {
      dispatch(showToast('Per giocare le sfide collega il tuo account RetroAchievements nella scheda Trofei.', 'error'))
      return
    }
    dispatch(requestChallenge(challenge))
  }
  const sections = [
    { id: 'open', title: 'Da giocare', list: data.open, empty: 'Nessuna sfida aperta: le lancia chi sblocca un trofeo, a fine partita.' },
    { id: 'mine', title: 'Lanciate da te', list: data.mine, empty: 'Non hai ancora lanciato sfide.' },
    { id: 'ended', title: 'Concluse', list: data.ended, empty: null },
  ]
  const first = sections.find((section) => section.list.length)
  return (
    <div className={styles.sections}>
      {!data.linked && (
        <p className={styles.warning}>
          Per giocare le sfide collega il tuo account RetroAchievements nella scheda Trofei.
        </p>
      )}
      {sections.map((section) => (
        (section.list.length || section.empty) && (
          <section key={section.id} className={styles.section}>
            <h3 className={styles.title}>{section.title}</h3>
            {section.list.length ? (
              <div className={styles.cards}>
                {section.list.map((challenge, position) => (
                  <Card
                    key={challenge.id}
                    challenge={challenge}
                    account={account}
                    item={item}
                    onPlay={play}
                    autofocus={first === section && position === 0}
                  />
                ))}
              </div>
            ) : (
              <span className={styles.empty}>{section.empty}</span>
            )}
          </section>
        )
      ))}
    </div>
  )
}
