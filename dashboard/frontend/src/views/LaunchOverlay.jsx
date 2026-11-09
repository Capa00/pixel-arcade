import { useEffect, useMemo, useState } from 'react'
import FaceButton from '../components/FaceButton.jsx'
import InsertAnimation from '../components/InsertAnimation.jsx'
import ShoulderButton from '../components/ShoulderButton.jsx'
import { downloadPercent, phaseLabel } from '../lib/run.js'
import { TIP_MS, launchTips, nextTip } from '../lib/tips.js'
import styles from './LaunchOverlay.module.css'

/** Consigli a rotazione in fondo alla schermata (src/lib/tips.js): il primo è casuale. */
function Tips({ quitCombo, saveCombo, rescueCombo }) {
  const tips = useMemo(() => launchTips({ quitCombo, saveCombo, rescueCombo }), [quitCombo, saveCombo, rescueCombo])
  const [index, setIndex] = useState(() => Math.floor(Math.random() * tips.length))
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => nextTip(current, tips.length)), TIP_MS)
    return () => window.clearInterval(timer)
  }, [tips.length])
  const tip = tips[index % tips.length]
  return (
    <div className={styles.tips}>
      <span className={`pix ${styles.tipsHead}`}>CONSIGLIO</span>
      <div key={tip.id} className={styles.tip}>
        {tip.shoulder.length > 0 && <ShoulderButton pressed={tip.shoulder} />}
        <span>{tip.text}</span>
      </div>
    </div>
  )
}

/**
 * Schermata di avvio e di gioco (livello 30, come nella demo): animazione di
 * inserimento del gioco (src/components/InsertAnimation.jsx, con la copertina
 * di `libraryGame` se c'è), fase, titolo e barra. La barra segue il download; nelle altre fasi
 * è animata. `armed` è vero dopo il primo B: un secondo B interrompe
 * (`onStop`, anche col clic sul pulsante). `versus` è la riga dei giocatori
 * («NOME1 vs NOME2», «NOME1 · 1 giocatore» o vuota); `trophies` è l'account
 * RetroAchievements del P1, che riceve i trofei della partita (o `null`);
 * `quitCombo` è l'uscita dal gioco della partita (del gioco, della console o
 * `input.quit_combo`), scritta in partita. In fondo i consigli a rotazione,
 * con `saveCombo` e `rescueCombo` le combinazioni dei salvataggi e di emergenza.
 */
export default function LaunchOverlay({
  run,
  system,
  libraryGame = null,
  armed,
  versus,
  trophies = null,
  quitCombo,
  saveCombo,
  rescueCombo,
  onStop,
}) {
  const game = run.game || {}
  const done = downloadPercent(run)
  return (
    <div className={styles.overlay} style={{ '--accent': system ? system.accent : 'var(--text-1)' }}>
      <InsertAnimation system={system} game={libraryGame || game} title={game.title} />
      <div className={`pix pulse ${styles.phase}`}>{phaseLabel(run, quitCombo)}</div>
      <div className={styles.title}>{game.title}</div>
      {versus && <div className={styles.versus}>{versus}</div>}
      {trophies && <div className={styles.versus}>★ Trofei RetroAchievements a {trophies}</div>}
      <div className={styles.bar}>
        {done === null ? (
          <div className={styles.load} />
        ) : (
          <div className={styles.fill} style={{ width: `${done}%` }} />
        )}
      </div>
      <button type="button" className={armed ? `${styles.stop} ${styles.armed}` : styles.stop} onClick={onStop}>
        <FaceButton position="east" />
        {armed ? 'Premi di nuovo per interrompere' : 'Interrompi'}
      </button>
      <Tips quitCombo={quitCombo} saveCombo={saveCombo} rescueCombo={rescueCombo} />
    </div>
  )
}
