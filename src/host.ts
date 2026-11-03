/**
 * The HOST side of the extension-UI contract: the console that mounts panels in iframes.
 *
 * WHAT IS HERE AND WHAT IS NOT. A host sends theme and card data, and receives height and open-view
 * requests — so it needs the constants, a validator for the messages it receives, and the payload
 * shape it sends. It does NOT need `receiveCardData` or `reportCardHeight`: those belong to the frame,
 * and handing them to the host would invite a console to call a function that posts to its own parent.
 *
 * VALIDATION IS ASYMMETRIC ON PURPOSE. A host validates what it RECEIVES (a frame is a separate
 * document, and a malformed request must not become a broken page push) and not what it sends (it is
 * the source of truth for its own messages). The frame validates the reverse. Each side trusts itself.
 */
import {
  type CardPayload,
  MSG_CARD_DATA,
  MSG_CARD_HEIGHT,
  MSG_CARD_READY,
  MSG_OPEN_VIEW,
  MSG_THEME,
  MSG_THEME_READY,
  type OpenViewRequest,
} from './protocol.js'

export {
  type CardPayload,
  MSG_CARD_DATA,
  MSG_CARD_HEIGHT,
  MSG_CARD_READY,
  MSG_OPEN_VIEW,
  MSG_THEME,
  MSG_THEME_READY,
  type OpenViewRequest,
  type ThemeMode,
} from './protocol.js'

/** An open-view request as it arrives, with `type` narrowed. */
export interface OpenViewMessage extends OpenViewRequest {
  type: typeof MSG_OPEN_VIEW
}

/**
 * Read an open-view request, or null.
 *
 * A FRAME IS A SEPARATE DOCUMENT, so its message is input, not a fact. A missing `ext` or `route`
 * returns null rather than an object the host would navigate to — a page push to `/ext//` is a blank
 * screen with no error, which is worse than ignoring the message.
 *
 * `title` is optional: the host can derive one, and a frame that omits it should not lose the request.
 */
export function openViewFrom(data: unknown): OpenViewMessage | null {
  if (data === null || typeof data !== 'object') return null
  const d = data as Partial<OpenViewMessage>
  if (d.type !== MSG_OPEN_VIEW) return null
  if (typeof d.ext !== 'string' || d.ext === '') return null
  if (typeof d.route !== 'string' || d.route === '') return null
  return {
    type: MSG_OPEN_VIEW,
    ext: d.ext,
    route: d.route,
    title: typeof d.title === 'string' ? d.title : '',
  }
}

/** A card's reported height, or 0 when the message is not one. */
export function cardHeightFrom(data: unknown): number {
  if (data === null || typeof data !== 'object') return 0
  const d = data as { type?: unknown; height?: unknown }
  if (d.type !== MSG_CARD_HEIGHT) return 0
  return typeof d.height === 'number' &&
    Number.isFinite(d.height) &&
    d.height > 0
    ? Math.ceil(d.height)
    : 0
}

/** True when `data` is the frame announcing it can receive card data. */
export function isCardReady(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === MSG_CARD_READY
  )
}

/** True when `data` is the frame announcing it can receive theme messages. */
export function isThemeReady(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === MSG_THEME_READY
  )
}

/**
 * The card's payload, in the shape the frame's `receiveCardData` validates.
 *
 * BUILT HERE rather than in the console so the `type` discriminator cannot be forgotten: a payload
 * without it is a card that renders nothing, with no error on either side.
 */
export function cardDataMessage(
  p: CardPayload,
): CardPayload & { type: typeof MSG_CARD_DATA } {
  return { type: MSG_CARD_DATA, ...p }
}

/**
 * The URL a card frame is mounted at.
 *
 * `theme` IS IN THE URL because an iframe has its own `<html>`: the host's `data-theme` does not reach
 * it, and a frame that learns the theme only from a postMessage flashes light first. `session` scopes
 * the card's API calls — it lives in the frame's own client, which reads `?session=`.
 */
export function cardSrc(
  ext: string,
  template: string,
  theme: string,
  session = '',
): string {
  const q = new URLSearchParams({ theme })
  if (session !== '') q.set('session', session)
  return `/ext/${ext}/?${q.toString()}#/card/${encodeURIComponent(template)}`
}

/** The panel URL — the same frame, without a card route. */
export function panelSrc(
  ext: string,
  route: string,
  theme: string,
  session = '',
): string {
  const q = new URLSearchParams({ theme })
  if (session !== '') q.set('session', session)
  const r = route.startsWith('/') ? route : `/${route}`
  return `/ext/${ext}/?${q.toString()}#${r}`
}
