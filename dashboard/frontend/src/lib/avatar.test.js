import { describe, expect, it } from 'vitest'
import { avatarSrc, bumpAvatar } from './avatar.js'

describe('avatar', () => {
  const accounts = [{ id: 1, avatar: true }, { id: 2, avatar: false }, { id: 3 }]

  it('solo i profili con Gravatar collegato', () => {
    expect(avatarSrc(accounts, 1)).toBe('/api/profiles/avatar?id=1&v=0')
    expect(avatarSrc(accounts, 2)).toBeNull()
    expect(avatarSrc(accounts, 3)).toBeNull()
    expect(avatarSrc(accounts, 9)).toBeNull()
    expect(avatarSrc(accounts, null)).toBeNull()
    expect(avatarSrc(undefined, 1)).toBeNull()
  })

  it('un cambio di email cambia l\'indirizzo', () => {
    bumpAvatar(1)
    expect(avatarSrc(accounts, 1)).toBe('/api/profiles/avatar?id=1&v=1')
    bumpAvatar(1)
    expect(avatarSrc(accounts, 1)).toBe('/api/profiles/avatar?id=1&v=2')
  })
})
