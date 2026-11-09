import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { YES_NO, moveChoice } from '../components/confirmChoices.js'
import PickerMenu from '../components/PickerMenu.jsx'
import SavesModal from '../components/SavesModal.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  DELETE_ALL,
  NAME_MAX,
  cleanName,
  copyTargets,
  focusScope,
  ingameConfirmText,
  ingameProgress,
  itemLabel,
  profileTab,
  slotActions,
} from '../lib/saves.js'
import { openKeyboard, request, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'

const VERTICAL = { up: -1, down: 1 }
const NAME_TARGET = 'profileSaveName'
const MISSING_GAME = 'Gioco non più presente nella libreria.'
const NO_TARGETS = 'Nessun altro profilo a cui copiare'

/**
 * Modale «Salvataggi» di un gioco nel Profilo (Sprint 06 dei salvataggi):
 * il profilo `owner` (`{id, name, color}`) gestisce i suoi salvataggi di
 * `game` (riepilogo con `system`, `id`, `title`, `missing`) senza avviarlo.
 *
 * Su una voce si apre il menu dello slot (`slotActions` in modalità
 * `profile`): «Gioca da qui», «Rinomina» (tastiera a schermo comandata dal
 * joypad `pad`), «Proteggi», «Elimina», «Copia a…» (scelta del profilo, poi
 * dello slot di destinazione). In fondo c'è «Elimina tutti i salvataggi»,
 * con doppia conferma. Ogni operazione passa da una conferma e vale solo per
 * `owner`; dopo ogni modifica `onChanged()` fa rileggere l'elenco del
 * Profilo. Se non restano salvataggi la modale si chiude con `onClose()`.
 *
 * Gli eventi arrivano dal Profilo con `inputRef.current(event)`;
 * `onContext(nome | null)` indica la legenda della barra comandi.
 */
export default function ProfileSaves({ inputRef, owner, pad, game, system, onClose, onChanged, onContext }) {
  const { state, dispatch } = useApp()
  const [slots, setSlots] = useState(null)
  const [picker, setPicker] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  // Copia in corso di scelta: `{item, targets, index, target, slots}`; `target` nullo mentre si sceglie il profilo.
  const [copy, setCopy] = useState(null)
  // Slot che si sta rinominando con la tastiera a schermo, oppure `null`.
  const [naming, setNaming] = useState(null)
  const savesInput = useRef(null)
  const copyInput = useRef(null)

  const key = { account: owner.id, system: game.system, game: game.id, scope: 'profile' }
  const targets = copyTargets(state.accounts, owner.id)

  const toastError = useCallback((error) => dispatch(showToast(error.message, 'error')), [dispatch])

  // Slot del profilo per il gioco; ogni apertura parte dalla prima voce.
  const ownerId = owner.id
  const gameSystem = game.system
  const gameId = game.id
  useEffect(() => {
    let active = true
    dispatch(setFocus(focusScope({ account: { id: ownerId } }), null))
    api.gameSaves(gameSystem, gameId, [ownerId])
      .then((data) => {
        if (active) {
          const entry = data.accounts.find((item) => item.id === ownerId)
          setSlots(entry ? entry.slots : [])
        }
      })
      .catch((error) => {
        if (active) {
          toastError(error)
          onClose()
        }
      })
    return () => {
      active = false
    }
  }, [ownerId, gameSystem, gameId, dispatch, toastError, onClose])

  // Tastiera chiusa: con la conferma si chiede se rinominare, con l'annullamento si torna alla modale.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== NAME_TARGET) {
      return
    }
    const name = cleanName(keyboardText.value)
    if (name === cleanName(naming.save && naming.save.name)) {
      return
    }
    setDialog({ text: ingameConfirmText('rename', naming, { name }), choice: 'yes', action: 'rename', item: naming, extra: { name } })
  }, [naming, keyboardOpen, keyboardText])

  // Slot aggiornati dopo un'operazione: se non ne resta nessuno il gioco sparisce dall'elenco e la modale si chiude.
  const updated = (next) => {
    onChanged()
    if (next.length) {
      setSlots(next)
    } else {
      onClose()
    }
  }

  const call = (action, item, extra) => {
    switch (action) {
      case 'rename':
        return api.renameSave(key, item.slot, extra.name)
      case 'protect':
      case 'unprotect':
        return api.protectSave(key, item.slot, action === 'protect')
      case 'delete':
        return api.deleteSave(key, item.slot)
      case 'copy':
        return api.copySave(key, item.slot, extra.other.id, extra.target.slot)
      case DELETE_ALL:
        return api.deleteGameSaves(key)
      default:
        return Promise.reject(new Error('Azione non valida'))
    }
  }

  const perform = async (action, item, extra = {}) => {
    if (action === 'play') {
      onClose()
      dispatch(request('launch', game.system, { id: game.id, title: game.title }, { account: owner.id, slot: item.slot }))
      return
    }
    setBusy(true)
    try {
      const data = await call(action, item, extra)
      const [, after] = ingameProgress(action, item, { ...extra, remaining: data.remaining })
      dispatch(showToast(after))
      if (action !== 'copy') {
        updated(data.slots)
      }
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  const ask = (action, item, extra = {}) => {
    setDialog({ text: ingameConfirmText(action, item, extra), choice: 'yes', action, item, extra })
  }

  const pick = (item) => {
    if (busy) {
      return
    }
    const context = {
      mode: 'profile',
      play: game.missing ? MISSING_GAME : '',
      copy: targets.length ? '' : NO_TARGETS,
    }
    setPicker({ item, items: slotActions(item, context), index: 0 })
  }

  const deleteAll = () => {
    if (!busy) {
      ask(DELETE_ALL, null, { title: game.title, step: 1 })
    }
  }

  const choose = (entry) => {
    const { item } = picker
    if (entry.disabled) {
      dispatch(showToast(entry.reason, 'error'))
      return
    }
    setPicker(null)
    if (entry.id === 'rename') {
      setNaming(item)
      dispatch(openKeyboard('text', {
        owner: pad,
        value: (item.save && item.save.name) || '',
        max: NAME_MAX,
        title: `Nome dello slot ${item.slot}`,
        placeholder: `Slot ${item.slot}`,
        target: { kind: NAME_TARGET, slot: item.slot },
      }))
    } else if (entry.id === 'copy') {
      setCopy({ item, targets, index: 0, target: null, slots: null })
    } else {
      ask(entry.id, item)
    }
  }

  // Profilo di destinazione scelto: si leggono i suoi slot del gioco.
  const chooseTarget = async (index) => {
    const entry = copy.targets[index]
    const target = state.accounts.find((account) => account.id === entry.id)
    if (!target) {
      return
    }
    const { item } = copy
    dispatch(setFocus(focusScope({ account: target }), null))
    setCopy({ ...copy, index, target, slots: null })
    try {
      const data = await api.gameSaves(game.system, game.id, [target.id])
      const found = data.accounts.find((value) => value.id === target.id)
      setCopy((current) => (current && current.item === item && current.target === target
        ? { ...current, slots: found ? found.slots : [] }
        : current))
    } catch (error) {
      setCopy(null)
      toastError(error)
    }
  }

  const pickSlot = (targetItem) => {
    if (!copy || !copy.target || targetItem.disabled) {
      return
    }
    const { item, target } = copy
    setCopy(null)
    ask('copy', item, { other: target, target: targetItem })
  }

  const answer = (choice) => {
    const current = dialog
    setDialog(null)
    if (choice !== 'yes' || !current) {
      return
    }
    if (current.action === DELETE_ALL && current.extra.step === 1) {
      // Seconda conferma, che parte da «No».
      const extra = { ...current.extra, step: 2 }
      setDialog({ ...current, text: ingameConfirmText(DELETE_ALL, null, extra), choice: 'no', extra })
      return
    }
    perform(current.action, current.item, current.extra)
  }

  const handle = (event) => {
    if (event.kind === 'release' || event.kind === 'text') {
      return
    }
    const press = event.kind === 'press'
    if (dialog) {
      const choice = moveChoice(YES_NO, dialog.choice, event.button, wraps(event))
      if (choice !== dialog.choice) {
        setDialog({ ...dialog, choice })
      } else if (press && event.button === 'a') {
        answer(dialog.choice)
      } else if (press && event.button === 'b') {
        answer('no')
      }
      return
    }
    if (picker) {
      if (VERTICAL[event.button]) {
        setPicker({ ...picker, index: stepIndex(picker.index, VERTICAL[event.button], picker.items.length, wraps(event)) })
      } else if (press && event.button === 'a') {
        choose(picker.items[picker.index])
      } else if (press && event.button === 'b') {
        setPicker(null)
      }
      return
    }
    if (copy && !copy.target) {
      if (VERTICAL[event.button]) {
        setCopy({ ...copy, index: stepIndex(copy.index, VERTICAL[event.button], copy.targets.length, wraps(event)) })
      } else if (press && event.button === 'a') {
        chooseTarget(copy.index)
      } else if (press && event.button === 'b') {
        setCopy(null)
      }
      return
    }
    if (busy) {
      return
    }
    if (copy) {
      if (copyInput.current) {
        copyInput.current(event)
      }
      return
    }
    if (savesInput.current) {
      savesInput.current(event)
    }
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  let context = 'savesOne'
  if (dialog) {
    context = 'confirm'
  } else if (picker || (copy && !copy.target)) {
    context = 'picker'
  } else if (copy) {
    context = 'savesCopy'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  const title = { system: game.system, id: game.id, title: game.title }
  const choosing = copy && copy.target && copy.slots
  return (
    <>
      {slots && slots.length > 0 && !choosing && (
        <SavesModal
          game={title}
          system={system}
          tabs={[profileTab(owner, slots)]}
          tab={0}
          mode="profile"
          inputRef={savesInput}
          onTab={() => {}}
          onPick={pick}
          onClose={onClose}
          onDeleteAll={deleteAll}
        />
      )}
      {choosing && (
        <SavesModal
          game={title}
          system={system}
          tabs={[profileTab(copy.target, copy.slots)]}
          tab={0}
          mode="copy"
          kicker={`COPIA LO SLOT ${copy.item.slot} IN`}
          inputRef={copyInput}
          onTab={() => {}}
          onPick={pickSlot}
          onClose={() => setCopy({ ...copy, target: null, slots: null })}
        />
      )}
      {picker && (
        <PickerMenu
          title={itemLabel(picker.item)}
          items={picker.items}
          index={picker.index}
          empty=""
          onHover={(index) => setPicker({ ...picker, index })}
          onPick={(index) => choose(picker.items[index])}
          onClose={() => setPicker(null)}
        />
      )}
      {copy && !copy.target && (
        <PickerMenu
          title={`COPIA LO SLOT ${copy.item.slot} A`}
          items={copy.targets}
          index={copy.index}
          empty={NO_TARGETS}
          onHover={(index) => setCopy({ ...copy, index })}
          onPick={chooseTarget}
          onClose={() => setCopy(null)}
        />
      )}
      {dialog && (
        <ConfirmDialog
          text={dialog.text}
          choice={dialog.choice}
          onHover={(choice) => setDialog({ ...dialog, choice })}
          onChoose={answer}
        />
      )}
    </>
  )
}
