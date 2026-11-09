import { LOGO_RECTS, LOGO_SIZE } from '../lib/logo.js'

/** Logo pixel della demo. Le dimensioni arrivano dal CSS tramite `className`. */
export default function Logo({ className }) {
  return (
    <svg className={className} viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
      {LOGO_RECTS.map((rect) => (
        <rect key={`${rect.x},${rect.y},${rect.width},${rect.height}`} {...rect} />
      ))}
    </svg>
  )
}
