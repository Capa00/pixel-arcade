/**
 * Registro delle estensioni del frontend (src/addons/<id>/index.jsx). Solo
 * funzioni pure: `index.js` le applica ai moduli trovati da Vite.
 *
 * Un modulo di estensione esporta:
 * - `id` (obbligatorio): stesso nome della cartella del backend;
 * - `HeaderItem({state, holdProgress, command, host})`: elemento nell'intestazione;
 * - `commands(state)`: comandi disponibili nella libreria, ciascuno
 *   `{id, hold: {button, ms}, key, label, run}` (tasto tenuto, tasto della
 *   tastiera, azione);
 * - `Layer({inputRef, onContext, host})`: livello che riceve gli eventi prima
 *   della vista (`inputRef.current(event)` restituisce vero se li usa);
 * - `legends`: `{library: [voci], contexts: {nome: [voci]}}` per la barra comandi;
 * - `Decor({state})`: decorazioni sopra lo sfondo del tema e dietro il
 *   contenuto (non devono ricevere mouse né tocco);
 * - `SplashItem({ready})`: elemento sopra la schermata iniziale;
 * - `onSplash()` (facoltativa): azioni in più al ritorno a «PRESS START»,
 *   prima della chiusura generica (src/addons/splash.js). Le finestre dei
 *   `Layer` si chiudono da sole (App li ricrea); uno store esterno si chiude
 *   iscrivendosi con `subscribeSplash` di src/addons/splash.js;
 * - `consoles`: console senza giochi, con una scheda in coda a quelle dei
 *   giochi (`[{id, name, accent, logo}]`; `id` diverso dalle cartelle di
 *   `games/`). `logo` (facoltativo) è l'URL di un'immagine, di solito
 *   importata dalla cartella dell'estensione: nella riga prende il posto del nome;
 * - `watchConsoles(host, show)` (facoltativa): controlla quando mostrare le
 *   sue `consoles`, chiamando `show(id, visibile)`; restituisce la funzione
 *   che lo ferma. Finché non la chiama, le sue console restano nascoste;
 * - `ConsoleView({console, host})`: contenuto al posto della libreria quando
 *   è selezionata una delle sue `consoles`. `host.capture(handler)` manda
 *   tutti gli eventi a `handler` (senza combinazioni, comandi tenuti e
 *   giocatori) finché non si chiama `host.capture(null)`;
 * - `consoleSettings`: impostazioni di una delle sue `consoles` nella scheda
 *   Console delle Impostazioni, `{console, load(request), save(request,
 *   values), summary(values), fields(values, ctx)}`. `load` e `save`
 *   restituiscono i valori salvati; `fields` le voci della finestra
 *   (`{id, label, value, note, onActivate}`), con `ctx` = `{change(patch)`
 *   (bozza, salvata con «Salva»), `choose(picker)` (menu `{title, items,
 *   index, empty, onPick}`), `ask({text, onYes})` (conferma), `request`,
 *   `toast(message, variant)}`. Con `subscribe(listener)` e `getSnapshot()`
 *   (store esterno) la finestra si aggiorna quando cambia lo stato, passato a
 *   `fields` come terzo argomento;
 * - `settingsTab`: una scheda in coda a quelle delle Impostazioni, `{id,
 *   label, title, Tab}`. `Tab({scope, ask, choose, inputRef, onMode,
 *   overlayHost})` è il contenuto, montato solo con la scheda aperta:
 *   `scope` è l'ambito di navigazione delle Impostazioni (`scope.item(id,
 *   onActivate)` per le voci), `ask(confirm)` e `choose(picker)` aprono
 *   conferma e menu delle Impostazioni, `inputRef.current(event)` riceve
 *   gli eventi prima delle Impostazioni (vero se li usa, per esempio con una
 *   finestra aperta), `onMode(contesto)` cambia la legenda (`null` = quella
 *   delle Impostazioni) e `overlayHost` è l'elemento dove portare le
 *   finestre (`createPortal`).
 */

/** Estensioni valide fra i moduli di `import.meta.glob`, ordinate per `id`. */
export function collect(modules) {
  const result = []
  for (const [path, module] of Object.entries(modules || {})) {
    if (!module || typeof module.id !== 'string' || !module.id) {
      console.warn('Estensione senza id ignorata: ' + path)
      continue
    }
    result.push(module)
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Console delle estensioni (`consoles`), ciascuna con l'`addon` di provenienza. */
export function addonConsoles(addons) {
  const result = []
  for (const addon of addons) {
    for (const entry of addon.consoles || []) {
      if (entry && typeof entry.id === 'string' && entry.id) {
        result.push({ ...entry, addon: addon.id })
      }
    }
  }
  return result
}

/** Schede delle Impostazioni delle estensioni (`settingsTab`), ciascuna con l'`addon` di provenienza. */
export function addonSettingsTabs(addons) {
  const result = []
  for (const addon of addons) {
    const tab = addon.settingsTab
    if (tab && typeof tab.id === 'string' && tab.id && typeof tab.Tab === 'function') {
      result.push({ ...tab, addon: addon.id })
    }
  }
  return result
}

/** Comandi delle estensioni per lo stato `state`, in un'unica lista con l'`addon` di provenienza. */
export function holdCommands(addons, state) {
  const result = []
  for (const addon of addons) {
    const commands = (addon.commands && addon.commands(state)) || []
    for (const command of commands) {
      result.push({ ...command, addon: addon.id })
    }
  }
  return result
}

function append(items, extra) {
  const ids = new Set(items.map((item) => item.id))
  const added = extra.filter((item) => !ids.has(item.id))
  return added.length ? [...items, ...added] : items
}

/**
 * Legende di `base` con quelle delle estensioni: i contesti nuovi di
 * `legends.contexts` e le voci di `legends.library`, aggiunte in coda a
 * `library` e `players` senza duplicare gli `id`.
 */
export function mergeLegends(base, addons) {
  const result = { ...base }
  for (const addon of addons) {
    const legends = addon.legends || {}
    for (const [name, items] of Object.entries(legends.contexts || {})) {
      if (!result[name]) {
        result[name] = items
      }
    }
    const library = legends.library || []
    if (library.length) {
      result.library = append(result.library || [], library)
      result.players = append(result.players || [], library)
      // Stessa griglia aperta dalla scheda TUTTE (legende `libraryAll` e `playersAll`).
      for (const name of ['libraryAll', 'playersAll']) {
        if (result[name]) {
          result[name] = append(result[name], library)
        }
      }
    }
  }
  return result
}

/** Tasto logico di un comando delle estensioni (`cmd:<id>`). */
export function commandButton(id) {
  return 'cmd:' + id
}

/** Id del comando per il tasto logico `button`, oppure `null` se non è un comando. */
export function commandId(button) {
  return typeof button === 'string' && button.startsWith('cmd:') ? button.slice(4) : null
}

/** Tasti della tastiera dei comandi (`{g: 'cmd:<id>'}`). */
export function commandKeys(commands) {
  const result = {}
  for (const command of commands) {
    if (command.key) {
      result[command.key.toLowerCase()] = commandButton(command.id)
    }
  }
  return result
}

/**
 * Voci della legenda `items` senza quelle dei comandi delle estensioni non
 * disponibili ora (`commands`), così per esempio «Gestione giochi» compare
 * solo sulle console abilitate.
 */
export function availableItems(items, commands) {
  const ids = new Set(commands.map((command) => command.id))
  return items.filter((item) => {
    const id = commandId(item.command)
    return id === null || ids.has(id)
  })
}
