/**
 * Icone a pixel delle marche senza logo nella scheda TUTTE: un computer anni
 * '80 (`computer`) e un cabinato (`arcade`). Disegni originali, in SVG.
 * `className` riceve gli stessi stili dei loghi (grigio o a colori).
 */
function Rects({ rects }) {
  return rects.map(([x, y, width, height, fill], index) => (
    <rect key={index} x={x} y={y} width={width} height={height} fill={fill} />
  ))
}

const BEIGE = '#d9d0b4'
const BEIGE_DARK = '#a89f84'
const KEY = '#5b5647'
const SCREEN = '#1c2f63'
const TEXT = '#7cf08a'

// Monitor con il prompt sullo schermo, sopra la tastiera.
const COMPUTER = [
  [3, 0, 18, 13, BEIGE],
  [3, 12, 18, 1, BEIGE_DARK],
  [5, 2, 14, 8, SCREEN],
  [6, 3, 5, 1, TEXT],
  [6, 5, 8, 1, TEXT],
  [6, 7, 2, 1, TEXT],
  [9, 7, 1, 1, '#ffffff'],
  [17, 11, 2, 1, '#e5484d'],
  [9, 13, 6, 2, BEIGE_DARK],
  [0, 15, 24, 6, BEIGE],
  [0, 20, 24, 1, BEIGE_DARK],
  [2, 16, 2, 1, KEY], [5, 16, 2, 1, KEY], [8, 16, 2, 1, KEY], [11, 16, 2, 1, KEY], [14, 16, 2, 1, KEY],
  [17, 16, 2, 1, KEY], [20, 16, 2, 1, KEY],
  [3, 18, 2, 1, KEY], [6, 18, 12, 1, KEY], [19, 18, 2, 1, KEY],
]

const BODY = '#3346c8'
const BODY_DARK = '#1f2b80'
const MARQUEE = '#f5c542'
const PANEL = '#e5484d'

// Cabinato: insegna, schermo con gli invasori, plancia con joystick e pulsanti, sportello delle monete.
const ARCADE = [
  [2, 0, 12, 4, MARQUEE],
  [4, 1, 1, 2, PANEL], [6, 1, 1, 2, PANEL], [8, 1, 1, 2, PANEL], [10, 1, 1, 2, PANEL],
  [2, 4, 12, 20, BODY],
  [2, 4, 1, 20, BODY_DARK],
  [13, 4, 1, 20, BODY_DARK],
  [4, 5, 8, 6, '#0d0d14'],
  [5, 6, 1, 1, TEXT], [7, 6, 1, 1, TEXT], [9, 6, 1, 1, TEXT],
  [6, 8, 1, 1, '#ff7ad9'], [8, 8, 1, 1, '#ff7ad9'],
  [7, 9, 2, 1, '#ffffff'],
  [1, 13, 14, 3, PANEL],
  [1, 15, 14, 1, '#a8323a'],
  [4, 12, 1, 1, '#0d0d14'],
  [3, 11, 3, 1, PANEL],
  [9, 13, 1, 1, MARQUEE],
  [11, 13, 1, 1, '#4fd1ff'],
  [6, 18, 4, 5, BODY_DARK],
  [7, 19, 1, 2, '#ff9f1c'],
  [8, 19, 1, 2, '#ff9f1c'],
]

const ICONS = {
  computer: { viewBox: '0 0 24 21', rects: COMPUTER },
  arcade: { viewBox: '0 0 16 24', rects: ARCADE },
}

/** Vero se la marca `brand` ha un'icona a pixel. */
export function hasBrandIcon(brand) {
  return Boolean(ICONS[brand])
}

export default function BrandIcon({ brand, className }) {
  const icon = ICONS[brand]
  if (!icon) {
    return null
  }
  return (
    <svg className={className} viewBox={icon.viewBox} shapeRendering="crispEdges" aria-hidden="true">
      <Rects rects={icon.rects} />
    </svg>
  )
}
