import {
  asSessionContext,
  MSG_SELECTION,
  MSG_SESSION,
  MSG_VIEW_CLOSE,
  MSG_VIEW_TITLE,
  type SessionContext,
} from './protocol.js'

/**
 * The view's scope: the conversation it belongs to, and what the extensions have selected in it.
 *
 * A PANEL OPENS ON A CONVERSATION, and that is the part it cannot work out for itself. `sessionId()`
 * reads `?session=` — but a selection ("which machine") is not in the URL: it changes while the panel
 * is open, it is shared between the extensions that declare the same namespace, and the host is the
 * only place all of them can agree on a value.
 *
 * So the host pushes it. This module keeps the latest value and lets a panel subscribe.
 */

let current: SessionContext | null = null
const listeners = new Set<(c: SessionContext) => void>()
let wired = false

/**
 * Start listening for the host's session messages.
 *
 * CALLED AT MODULE LOAD, not on first use. An earlier version wired the listener inside the getters,
 * which silently dropped any message the host sent before the panel got around to asking — the panel
 * then rendered an empty side view with no error anywhere, and the symptom ("it works after you click
 * again") pointed at the click rather than at the start-up order.
 *
 * A frame is a browser document with exactly one of these, so a load-time listener is the honest
 * shape. It is idempotent and a no-op where there is no `window` (a unit test importing the module).
 */
function wire(): void {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data as { type?: unknown } | null
    if (d === null || typeof d !== 'object' || d.type !== MSG_SESSION) return
    const ctx = asSessionContext(d)
    if (ctx === null) return
    current = ctx
    for (const fn of listeners) fn(ctx)
  })
}

wire()

/**
 * The most recent session context, or null if the host has not sent one yet.
 *
 * NULL IS A REAL ANSWER, not an error: a panel opened from the shelf has no conversation, and the
 * host says nothing rather than inventing an empty id — an empty string and "no session" would
 * otherwise be the same value and the panel could not tell which it had.
 */
export function sessionContext(): SessionContext | null {
  wire()
  return current
}

/**
 * Subscribe to session changes, and get the current value immediately when it is already known.
 *
 * The immediate call is why this is one function rather than a listener plus a getter: every caller
 * needs both, and doing them in the wrong order (subscribe, then read, then find the value arrived
 * between) is a race that shows up as a panel that ignores the first selection.
 *
 * Returns a function that unsubscribes.
 */
export function onSessionContext(fn: (c: SessionContext) => void): () => void {
  wire()
  listeners.add(fn)
  if (current !== null) fn(current)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Tell the host that this namespace now points at `id`.
 *
 * THE HOST DOES NOT VALIDATE `id`. It stores the string and relays it to every view that declared the
 * same namespace, so two extensions can agree on "the machine we are both looking at" without either
 * knowing what the other is.
 *
 * An empty `id` CLEARS the selection rather than storing an empty value: "nothing selected" has to be
 * representable, and an empty string would otherwise be a selection that happens to be blank.
 */
export function setSelection(namespace: string, id: string): void {
  const parent = window.parent
  if (!parent || parent === window) return
  if (namespace === '') return
  parent.postMessage({ type: MSG_SELECTION, namespace, id }, '*')
}

/**
 * Ask the host to close this view.
 *
 * A no-op in a card frame: a card occupies a slot in the conversation, and closing it is not the
 * frame's decision. The host ignores the message there, and saying so here saves a caller a check it
 * cannot perform.
 */
export function closeView(): void {
  const parent = window.parent
  if (!parent || parent === window) return
  parent.postMessage({ type: MSG_VIEW_CLOSE }, '*')
}

/**
 * Ask the host to title this view.
 *
 * The host uses it for the side panel's header. Blank titles are ignored rather than clearing the
 * header: a panel that briefly has nothing to name would otherwise flicker to the extension's own
 * name and back.
 */
export function setViewTitle(title: string): void {
  const parent = window.parent
  if (!parent || parent === window) return
  if (title.trim() === '') return
  parent.postMessage({ type: MSG_VIEW_TITLE, title }, '*')
}
