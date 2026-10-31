import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MSG_CARD_DATA,
  MSG_CARD_HEIGHT,
  MSG_CARD_READY,
  MSG_OPEN_VIEW,
  MSG_THEME,
} from './protocol.js'
import { receiveCardData, reportCardHeight, requestOpenView } from './card.js'
import { applyTheme, currentTheme, listenForTheme, onThemeChange } from './theme.js'

/**
 * These tests are about the MESSAGES, because that is the whole contract: an extension and the console
 * are deployed separately, and the only thing holding them together is that both sides send and accept
 * the same shapes. A unit test of the internals would prove nothing about that.
 */

const posted: Array<Record<string, unknown>> = []

function dispatch(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

beforeEach(() => {
  posted.length = 0
  // jsdom has no `parent`; a stand-in that records is exactly what these tests need.
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage: (m: Record<string, unknown>) => posted.push(m) },
  })
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('theme', () => {
  it('applies only the two valid values', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset['theme']).toBe('dark')
    expect(currentTheme()).toBe('dark')

    // ANYTHING ELSE IS IGNORED rather than written: a value from a future version, or from a hostile
    // frame, must not become a dataset attribute the stylesheet then fails to match.
    applyTheme('chartreuse')
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })

  it('adopts the URL-applied theme instead of defaulting to light', () => {
    // The page's bootstrap wrote the `?theme=` value before any module ran.
    document.documentElement.dataset['theme'] = 'dark'
    const off = listenForTheme()
    expect(currentTheme()).toBe('dark')
    off()
  })

  it('updates on a host message, and tells subscribers', () => {
    const seen: string[] = []
    const offListen = listenForTheme()
    const offSub = onThemeChange(m => {
      seen.push(m)
    })

    dispatch({ type: MSG_THEME, theme: 'dark' })
    expect(currentTheme()).toBe('dark')
    // The subscriber gets the value immediately AND on change — a card that subscribed late must not
    // sit in the wrong palette until somebody toggles the theme.
    expect(seen).toEqual(['light', 'dark'])

    offSub()
    offListen()
  })

  it('ignores messages of other kinds', () => {
    const off = listenForTheme()
    dispatch({ type: 'something-else', theme: 'dark' })
    expect(currentTheme()).toBe('light')
    off()
  })
})

describe('card data', () => {
  it('announces ready AFTER it can hear the answer', () => {
    const off = receiveCardData(() => {})
    expect(posted).toContainEqual({ type: MSG_CARD_READY })
    off()
  })

  it('hands over the five fields, defaulting what is missing', () => {
    let got: unknown = null
    const off = receiveCardData(p => {
      got = p
    })
    dispatch({ type: MSG_CARD_DATA, tool: 'x', input: { a: 1 }, data: {}, output: 'o', error: '' })
    expect(got).toEqual({ tool: 'x', input: { a: 1 }, data: {}, output: 'o', error: '' })

    // A malformed payload must still produce a usable card rather than throwing inside the listener,
    // where the failure would be invisible.
    dispatch({ type: MSG_CARD_DATA })
    expect(got).toEqual({ tool: '', input: {}, data: {}, output: '', error: '' })
    off()
  })

  it('stops listening when the returned function is called', () => {
    let calls = 0
    const off = receiveCardData(() => {
      calls++
    })
    dispatch({ type: MSG_CARD_DATA, tool: 'a' })
    off()
    dispatch({ type: MSG_CARD_DATA, tool: 'b' })
    expect(calls).toBe(1)
  })
})

describe('height', () => {
  it('reports the body height', () => {
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      height: 123.4,
    } as DOMRect)
    // jsdom has no ResizeObserver; the module returns a no-op when it is absent, so provide one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    )
    const off = reportCardHeight()
    expect(posted).toContainEqual({ type: MSG_CARD_HEIGHT, height: 124 })
    off()
    vi.unstubAllGlobals()
  })

  it('is a no-op where ResizeObserver does not exist', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const off = reportCardHeight()
    expect(posted.filter(m => m['type'] === MSG_CARD_HEIGHT)).toHaveLength(0)
    off()
    vi.unstubAllGlobals()
  })
})

describe('open view', () => {
  it('names the extension, taken from the mount path', () => {
    // jsdom's location is http://localhost:3000/ by default; override pathname.
    const spy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/ext/gitdev/',
    } as Location)
    requestOpenView('/ws/abc', 'my workspace')
    expect(posted).toContainEqual({
      type: MSG_OPEN_VIEW,
      ext: 'gitdev',
      route: '/ws/abc',
      title: 'my workspace',
    })
    spy.mockRestore()
  })

  it('posts nothing when there is no parent frame', () => {
    Object.defineProperty(window, 'parent', { configurable: true, value: window })
    requestOpenView('/x', 'y')
    expect(posted).toHaveLength(0)
  })
})
