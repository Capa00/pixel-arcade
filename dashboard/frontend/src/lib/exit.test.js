import { describe, expect, it } from 'vitest'
import { EXIT_CHOICE, exitQuestion } from './exit.js'

describe('conferma di uscita', () => {
  it('domanda con una frase', () => {
    expect(exitQuestion(['1 operazione in corso'])).toBe('1 operazione in corso. Continuarli dopo la chiusura?')
  })

  it('domanda con più frasi, unite da «·»', () => {
    expect(exitQuestion(['2 operazioni in corso', '1 copia in corso'])).toBe(
      '2 operazioni in corso · 1 copia in corso. Continuarli dopo la chiusura?',
    )
  })

  it('«Sì» evidenziata all\'apertura', () => {
    expect(EXIT_CHOICE).toBe('yes')
  })
})
