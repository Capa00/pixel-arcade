// Sfida trofeo (README «Sfida trofeo»): testi e voci della scelta a fine partita.

/** Tempo della sfida come `m:ss` (`h:mm:ss` oltre l'ora); `–` se non c'è. */
export function clock(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '–'
  }
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** «ancora 1 giorno», «ancora N giorni», «scade oggi» (con meno di un giorno non arriva a 0). */
export function daysLeft(days) {
  if (!days || days < 1) {
    return 'scade oggi'
  }
  return days === 1 ? 'ancora 1 giorno' : `ancora ${days} giorni`
}

/** «1 tentativo», «N tentativi». */
export function attempts(count) {
  return count === 1 ? '1 tentativo' : `${count} tentativi`
}

/** Voci della scelta a fine partita: i trofei, poi «Lancia le sfide (N)» e «Non sfidare». */
export function pickerItems(candidates, chosen) {
  const count = candidates.filter((item) => chosen.has(item.achievementId)).length
  return [
    ...candidates.map((item) => ({ kind: 'trophy', id: `t-${item.achievementId}`, item })),
    { kind: 'launch', id: 'launch', label: count ? `Lancia ${count === 1 ? 'la sfida' : `le sfide (${count})`}` : 'Scegli almeno un trofeo', disabled: !count },
    { kind: 'skip', id: 'skip', label: 'Non sfidare' },
  ]
}

/** Esito di una partita di sfida nel riepilogo: `{tone, title, text}` (`tone`: `record`, `won` o `failed`). */
export function outcomeText(outcome) {
  if (!outcome) {
    return null
  }
  if (!outcome.won) {
    return {
      tone: 'failed',
      title: 'Sfida non riuscita',
      text: `${outcome.achievementTitle}: niente trofeo stavolta (${attempts(outcome.attempts)}). Riprova quando vuoi.`,
    }
  }
  const time = clock(outcome.seconds)
  if (outcome.beatRecord) {
    const previous = outcome.previousRecord
    return {
      tone: 'record',
      title: 'Nuovo record!',
      text: `${outcome.achievementTitle} in ${time}${previous ? `: battuto ${previous.name} (${clock(previous.seconds)})` : ''}.`,
    }
  }
  const record = outcome.record
  if (outcome.personalBest && record && record.seconds === outcome.seconds) {
    return { tone: 'record', title: 'Record migliorato!', text: `${outcome.achievementTitle} in ${time}.` }
  }
  return {
    tone: 'won',
    title: outcome.personalBest ? 'Ce l\'hai fatta, tuo miglior tempo' : 'Ce l\'hai fatta',
    text: record
      ? `${outcome.achievementTitle} in ${time}. Il record resta di ${record.name}: ${clock(record.seconds)}.`
      : `${outcome.achievementTitle} in ${time}.`,
  }
}

/** Avviso di una sfida nuova: `{title, text}`. */
export function noticeText(challenge) {
  const record = challenge.record
  return {
    title: `${challenge.creator.name} ti sfida!`,
    text: `${challenge.achievementTitle} · ${challenge.title}`,
    detail: `Tempo da battere ${clock(record ? record.seconds : challenge.seconds)}${record ? ` (${record.name})` : ''} · ${daysLeft(challenge.daysLeft)}`,
  }
}

/** Riepilogo di una sfida conclusa per il profilo `account`: `{title, text}`. */
export function finalText(challenge, account) {
  const record = challenge.record
  const mine = challenge.creator.id === account
  const winner = record && record.account === account
  let title = 'Sfida conclusa'
  if (winner) {
    title = 'Hai vinto la sfida!'
  } else if (mine && record) {
    title = `${record.name} ha vinto la tua sfida`
  }
  return {
    title,
    text: `${challenge.achievementTitle} · ${challenge.title}`,
  }
}
