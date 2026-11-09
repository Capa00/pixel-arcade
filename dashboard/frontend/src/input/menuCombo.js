/**
 * Menu rapido di RetroArch col joypad (impostazione `input.menu_combo`,
 * backend: `MENU_COMBOS` in config.py e `MENU_COMBO_VALUES` in
 * retroarch_cfg.py). Lo apre RetroArch, non la dashboard: qui ci sono le
 * scelte e i tasti di ognuna. Il controllo con le altre combinazioni lo fa il
 * backend al salvataggio. Solo funzioni pure.
 */

export const DEFAULT_MENU_COMBO = 'l1_r1_start_select'

// `buttons`: tasti logici premuti insieme (`down` è la croce in basso).
export const MENU_COMBOS = [
  {
    id: 'l1_r1_start_select',
    buttons: ['lb', 'rb', 'start', 'select'],
    note: 'Difficile da premere per caso',
  },
  {
    id: 'l2_r2',
    buttons: ['lt', 'rt'],
    note: 'Si apre anche nei giochi che usano i due grilletti insieme',
  },
  {
    id: 'l1_r1',
    buttons: ['lb', 'rb'],
    note: 'Si apre anche nei giochi che usano i due dorsali insieme',
  },
  {
    id: 'down_select',
    buttons: ['down', 'select'],
    note: 'Giù sulla croce e SELECT',
  },
  {
    id: 'none',
    buttons: [],
    note: 'Il menu si apre solo con F1 dalla tastiera',
  },
]

/** Combinazione con quell'id; quella predefinita se sconosciuta. */
export function menuComboById(id) {
  return MENU_COMBOS.find((combo) => combo.id === id) || MENU_COMBOS[0]
}
