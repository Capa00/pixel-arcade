// Versione dell'avatar di ogni profilo in questa sessione: cresce quando si
// collega, cambia o scollega l'email Gravatar, così il browser non mostra
// l'immagine vecchia rimasta in memoria con lo stesso indirizzo.
const versions = new Map()

/** Segna come cambiato l'avatar del profilo `id`. */
export function bumpAvatar(id) {
  versions.set(id, (versions.get(id) || 0) + 1)
}

/**
 * Indirizzo dell'avatar Gravatar del profilo `id` tra gli `accounts`
 * caricati, oppure `null` se non ha un Gravatar collegato (o è un ospite).
 */
export function avatarSrc(accounts, id) {
  if (!Number.isInteger(id)) {
    return null
  }
  const account = (accounts || []).find((entry) => entry.id === id)
  if (!account || !account.avatar) {
    return null
  }
  return `/api/profiles/avatar?id=${id}&v=${versions.get(id) || 0}`
}
