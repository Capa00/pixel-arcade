/**
 * Uscita dal gioco col joypad (impostazione `input.quit_combo`, backend:
 * `QUIT_COMBOS` in config.py e `QUIT_COMBO_VALUES` in retroarch_cfg.py). La
 * legge RetroArch, non la dashboard: qui ci sono le scelte, i testi e il
 * controllo con la combinazione di emergenza. Solo funzioni pure.
 */

export const DEFAULT_QUIT_COMBO = 'hold_start'

// `hold` è il tasto da tenere 2 secondi; START+SELECT si preme insieme.
export const QUIT_COMBOS = [
  {
    id: 'hold_start',
    label: 'Tieni premuto START (2 s)',
    note: 'START mette in pausa il gioco: «Riprendi» riparte dalla pausa',
    hint: 'TIENI START PER TORNARE',
    hold: 'start',
  },
  {
    id: 'hold_select',
    label: 'Tieni premuto SELECT (2 s)',
    note: 'Per i giochi in cui START tenuto dà fastidio',
    hint: 'TIENI SELECT PER TORNARE',
    hold: 'select',
  },
  {
    id: 'start_select',
    label: 'START+SELECT',
    note: 'In molti giochi PS1 è anche il reset: «Riprendi» può ripartire dal menu del gioco',
    hint: 'START+SELECT PER TORNARE',
    hold: null,
  },
]

/** Uscita con quell'id; quella predefinita se sconosciuta. */
export function quitComboById(id) {
  return QUIT_COMBOS.find((combo) => combo.id === id) || QUIT_COMBOS[0]
}

/**
 * Tasto da tenere dell'uscita `id` che c'è anche nella combinazione di
 * emergenza `rescue` (`start` o `select`), oppure `null`. Tenuta 2 secondi,
 * l'emergenza farebbe uscire anche RetroArch salvando il «Riprendi»: per
 * questo allora scatta prima (src/input/rescueCombo.js).
 */
export function sharedHold(id, rescue) {
  const { hold } = quitComboById(id)
  return hold && Array.isArray(rescue) && rescue.includes(hold) ? hold : null
}
