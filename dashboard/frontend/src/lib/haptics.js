/**
 * Vibrazione del joypad (sprint 08): breve impulso all'avvio di un gioco e
 * al cambio di un preferito, solo se il giocatore ha «Vibrazione joypad».
 * Se il joypad o Chrome non la supportano non succede nulla.
 */

export const PULSE = { duration: 60, strongMagnitude: 0.3, weakMagnitude: 0.3 }

/** Impulso breve sul joypad `padIndex` (indice della Gamepad API); ignorato senza joypad. */
export function pulse(padIndex) {
  if (padIndex === null || padIndex === undefined || typeof navigator === 'undefined' || !navigator.getGamepads) {
    return
  }
  try {
    const pad = navigator.getGamepads()[padIndex]
    const actuator = pad && pad.vibrationActuator
    if (actuator && actuator.playEffect) {
      actuator.playEffect('dual-rumble', PULSE).catch(() => {})
    }
  } catch {
    // Vibrazione non disponibile: nessun effetto.
  }
}
