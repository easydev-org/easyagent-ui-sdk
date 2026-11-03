import { describe, expect, it } from 'vitest'
import {
  cardDataMessage,
  cardHeightFrom,
  cardSrc,
  isCardReady,
  isThemeReady,
  openViewFrom,
  panelSrc,
  MSG_CARD_DATA,
  MSG_CARD_HEIGHT,
  MSG_OPEN_VIEW,
} from '../src/host.js'

/**
 * The HOST side: what a console needs from the same contract.
 *
 * THESE ARE VALIDATORS, so every test is about refusing something. A host receives messages from a
 * document it does not control; a malformed one that reaches navigation or sizing produces a blank
 * page with no error, which is the failure mode this file exists to prevent.
 */

describe('openViewFrom', () => {
  it('accepts a well-formed request', () => {
    const got = openViewFrom({ type: MSG_OPEN_VIEW, ext: 'gitdev', route: '/files/a/b', title: 'Files' })
    expect(got).toEqual({ type: MSG_OPEN_VIEW, ext: 'gitdev', route: '/files/a/b', title: 'Files' })
  })

  it('defaults a missing title rather than dropping the request', () => {
    // THE HOST CAN DERIVE A TITLE, so a frame that omits one must not lose the navigation.
    const got = openViewFrom({ type: MSG_OPEN_VIEW, ext: 'gitdev', route: '/x' })
    expect(got?.title).toBe('')
    expect(got?.route).toBe('/x')
  })

  it('refuses an empty ext or route', () => {
    // `/ext//` is a blank screen with no error; ignoring the message is the better answer.
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: '', route: '/x' })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: 'gitdev', route: '' })).toBeNull()
    expect(openViewFrom({ type: MSG_OPEN_VIEW, ext: 'gitdev' })).toBeNull()
  })

  it('refuses the wrong message type and non-objects', () => {
    expect(openViewFrom({ type: MSG_CARD_DATA, ext: 'a', route: '/x' })).toBeNull()
    expect(openViewFrom(null)).toBeNull()
    expect(openViewFrom('nope')).toBeNull()
    expect(openViewFrom(42)).toBeNull()
  })
})

describe('cardHeightFrom', () => {
  it('returns a rounded positive height', () => {
    expect(cardHeightFrom({ type: MSG_CARD_HEIGHT, height: 120.4 })).toBe(121)
  })

  it('refuses zero, negative, non-finite and non-numeric heights', () => {
    // A ZERO-HEIGHT CARD IS INVISIBLE, and a negative or NaN one collapses the conversation layout.
    for (const h of [0, -5, Number.NaN, Infinity, '120', null, undefined]) {
      expect(cardHeightFrom({ type: MSG_CARD_HEIGHT, height: h })).toBe(0)
    }
  })

  it('refuses the wrong message type', () => {
    expect(cardHeightFrom({ type: MSG_OPEN_VIEW, height: 100 })).toBe(0)
  })
})

describe('readiness predicates', () => {
  it('recognises each announcement and nothing else', () => {
    expect(isCardReady({ type: 'easyagent:card-ready' })).toBe(true)
    expect(isThemeReady({ type: 'easyagent:theme:ready' })).toBe(true)
    // Crossed wires are the bug: a card announcing theme-readiness must not be read as card-readiness.
    expect(isCardReady({ type: 'easyagent:theme:ready' })).toBe(false)
    expect(isThemeReady({ type: 'easyagent:card-ready' })).toBe(false)
    expect(isCardReady(null)).toBe(false)
  })
})

describe('cardDataMessage', () => {
  it('adds the discriminator the frame validates', () => {
    // A PAYLOAD WITHOUT `type` RENDERS NOTHING with no error on either side, which is why the host
    // builds it here rather than at each call site.
    const msg = cardDataMessage({ tool: 't', input: {}, data: {}, output: '', error: '' })
    expect(msg.type).toBe(MSG_CARD_DATA)
    expect(msg.tool).toBe('t')
  })
})

describe('url builders', () => {
  it('puts the theme in the query so the frame can apply it before first paint', () => {
    expect(cardSrc('gitdev', 'pr', 'dark')).toBe('/ext/gitdev/?theme=dark#/card/pr')
  })

  it('carries the session when there is one, and omits it when there is not', () => {
    expect(cardSrc('gitdev', 'pr', 'light', 's1')).toContain('session=s1')
    expect(cardSrc('gitdev', 'pr', 'light')).not.toContain('session=')
  })

  it('normalises a route for a panel and encodes a template for a card', () => {
    expect(panelSrc('sandbox', 'jobs/1', 'dark')).toBe('/ext/sandbox/?theme=dark#/jobs/1')
    // A template with a slash must not become a second path segment.
    expect(cardSrc('gitdev', 'a/b', 'light')).toContain('/card/a%2Fb')
  })
})
