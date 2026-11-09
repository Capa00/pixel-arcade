/** Cuore dei preferiti (dalla demo): pieno col colore `fill`, oppure solo contorno `stroke`. */
export default function Heart({ className, fill = 'currentColor', stroke = 'none' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.5-9.4-9.2C1.3 7.9 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.6 3.4 4.3 6.8-1.9 4.7-9.4 9.2-9.4 9.2z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2"
      />
    </svg>
  )
}
