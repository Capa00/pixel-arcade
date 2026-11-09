import { useState } from 'react'
import BrandIcon, { hasBrandIcon } from './BrandIcons.jsx'

/**
 * Loghi delle console e delle marche, scaricati da dashboard/tools/fetch_logos.py
 * in `/logos/<preset>.png` e `/logos/brand-<marca>.png` (esclusi dalla repo).
 * Se il logo manca si mostra il nome. Sull'immagine:
 * - `data-dark`: logo nero o grigio scuro (misurato nel browser), da schiarire
 *   sul fondo scuro con `filter: invert(1) hue-rotate(180deg)`;
 * - `data-outlined`: logo con una parte nera su altri colori, da contornare.
 * I filtri li decide chi usa il componente, nel proprio CSS.
 */

// Marche con un logo scaricato; computer e arcade hanno un'icona a pixel (BrandIcons.jsx).
const BRAND_LOGOS = new Set(['nintendo', 'sega', 'sony', 'atari', 'nec', 'snk', 'bandai'])
// Loghi con una parte nera su altri colori.
const OUTLINED = new Set(['nes', 'neogeocd', 'dreamcast'])
// Sotto questa luminosità media (canale più chiaro, 0–1) il logo è scuro.
const DARK_TONE = 0.35
const tones = new Map()

/** Vero se l'immagine caricata è un logo scuro; il risultato resta in memoria per `img.src`. */
function darkLogo(img) {
  if (tones.has(img.src)) {
    return tones.get(img.src)
  }
  let dark = false
  try {
    const width = 64
    const height = Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(img, 0, 0, width, height)
    const data = context.getImageData(0, 0, width, height).data
    let sum = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 128) {
        sum += Math.max(data[i], data[i + 1], data[i + 2]) / 255
        count += 1
      }
    }
    dark = count > 0 && sum / count < DARK_TONE
  } catch {
    dark = false
  }
  tones.set(img.src, dark)
  return dark
}

function Logo({ src, className, outlined, fallback }) {
  const [broken, setBroken] = useState(false)
  const [dark, setDark] = useState(() => tones.get(src) || false)
  if (broken) {
    return fallback
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      decoding="async"
      data-dark={dark ? '' : undefined}
      data-outlined={outlined ? '' : undefined}
      onLoad={(event) => setDark(darkLogo(event.currentTarget))}
      onError={() => setBroken(true)}
    />
  )
}

/** Logo della console `system` (serve `preset`), oppure `fallback` (di solito il nome). */
export function ConsoleLogo({ system, className, fallback }) {
  if (!system || !system.preset) {
    return fallback
  }
  return (
    <Logo
      src={`/logos/${system.preset}.png`}
      className={className}
      outlined={OUTLINED.has(system.preset)}
      fallback={fallback}
    />
  )
}

/** Logo della marca `brand`, l'icona a pixel (computer, arcade) con `iconClassName`, oppure `fallback`. */
export function BrandLogo({ brand, className, iconClassName, fallback }) {
  if (hasBrandIcon(brand)) {
    return <BrandIcon brand={brand} className={iconClassName ? `${className} ${iconClassName}` : className} />
  }
  if (!BRAND_LOGOS.has(brand)) {
    return fallback
  }
  return <Logo src={`/logos/brand-${brand}.png`} className={className} outlined={false} fallback={fallback} />
}
