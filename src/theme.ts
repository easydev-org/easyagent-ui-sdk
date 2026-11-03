import {
  asThemeMode,
  MSG_THEME,
  MSG_THEME_READY,
  type ThemeMode,
} from './protocol.js'

type Listener = (mode: ThemeMode) => void

let current: ThemeMode = 'light'
const listeners = new Set<Listener>()

/**
 * The theme the console is using, kept in sync inside this iframe.
 *
 * AN IFRAME HAS ITS OWN `<html>`, so the host's `data-theme` does NOT reach here. Two channels cover it
 * and both are needed:
 *
 *   * `?theme=` in the URL, applied by the page before first paint, so dark mode never flashes light;
 *   * a postMessage on every change, so a switch while the panel is open is not ignored.
 *
 * THE INITIAL VALUE IS READ FROM THE DOM, not from the URL, because the page's own bootstrap has
 * already applied the URL value by the time any module runs. Reading it twice gives two chances to
 * disagree.
 */
export function currentTheme(): ThemeMode {
  return current
}

/**
 * Apply a theme to this document, and tell anyone listening.
 *
 * Exported so a page's bootstrap can call it for the URL value before the module graph finishes —
 * that is the whole point of the URL channel.
 */
export function applyTheme(mode: unknown): void {
  const m = asThemeMode(mode)
  if (m === null) return
  current = m
  document.documentElement.dataset['theme'] = m
  for (const l of listeners) l(m)
}

/**
 * React to theme changes, and adopt the current value immediately.
 *
 * IMMEDIATE, because a card that subscribes after the first apply would otherwise sit in the wrong
 * palette until somebody toggled the theme.
 */
export function onThemeChange(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Tell the host this frame can receive theme messages.
 *
 * WITHOUT THIS THE HOST DOES NOT KNOW WHEN TO SEND ONE. It cannot post into a document that has not
 * loaded, and polling would be a timer per frame forever.
 *
 * A HOST THAT BROADCASTS DOES NOT NEED THIS, which is why its absence is easy to miss: the panel keeps
 * working while the console happens to send to every frame on every change, and stops the day the
 * console sends only to frames that announced themselves. Saying "ready" is what makes the panel
 * independent of that implementation detail.
 */
export function announceThemeReady(): void {
  window.parent?.postMessage({ type: MSG_THEME_READY }, '*')
}

/**
 * Start listening for the host's theme messages.
 *
 * CALL ONCE, at module scope. Returns a function that stops listening, for a host that unmounts the
 * frame without destroying it (a test, most likely).
 */
export function listenForTheme(): () => void {
  const onMessage = (ev: MessageEvent): void => {
    // NO ORIGIN ALLOWLIST, deliberately. The host serves this UI from its own origin (it proxies
    // `/ext/<id>/`), and an unrelated origin has nothing to gain from setting a colour scheme. What
    // matters is validating the BODY: anything that is not one of the two values is ignored, so a
    // hostile message can do nothing a legitimate one could not.
    const d = ev.data as { type?: unknown; theme?: unknown } | null
    if (d?.type !== MSG_THEME) return
    applyTheme(d.theme)
  }
  window.addEventListener('message', onMessage)
  // START FROM THE DOM, AND ANNOUNCE IT. The page's bootstrap has already applied `?theme=`, so the
  // document's own attribute is the truth here — reading the URL again would be a second chance to
  // disagree.
  //
  // IT GOES THROUGH `applyTheme` RATHER THAN ASSIGNING `current`. Assigning is silent, and a listener
  // registered BEFORE this call has already been handed the default: a Svelte module's top-level
  // `onThemeChange` runs while the imports are evaluated, which is before any component's `onMount`
  // gets to call `connectToHost()`. That panel would sit in light mode on a dark console until
  // somebody toggled the theme — with nothing wrong in either program, which is why the silent
  // version survived as long as it did.
  applyTheme(document.documentElement.dataset['theme'])
  return () => {
    window.removeEventListener('message', onMessage)
  }
}
