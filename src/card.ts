import {
  type CardPayload,
  MSG_CARD_DATA,
  MSG_CARD_HEIGHT,
  MSG_CARD_READY,
  MSG_OPEN_VIEW,
  type OpenViewRequest,
} from './protocol.js'

/**
 * Ask the host for this card's data, and call `apply` when it arrives.
 *
 * A CARD IS A PURE RENDER, so it has nothing to fetch and no scope to resolve — the host already holds
 * the tool result and hands it over. That is why a card still renders correctly after the workspace it
 * describes has expired.
 *
 * Returns a function that stops listening.
 */
export function receiveCardData(apply: (p: CardPayload) => void): () => void {
  const onMessage = (ev: MessageEvent): void => {
    const d = (ev.data ?? null) as
      | ({ type?: string } & Partial<CardPayload>)
      | null
    if (d?.type !== MSG_CARD_DATA) return
    apply({
      tool: typeof d.tool === 'string' ? d.tool : '',
      input: (d.input as Record<string, unknown>) ?? {},
      data: (d.data as Record<string, unknown>) ?? {},
      output: typeof d.output === 'string' ? d.output : '',
      error: typeof d.error === 'string' ? d.error : '',
    })
  }
  window.addEventListener('message', onMessage)
  // ANNOUNCE AFTER THE LISTENER IS REGISTERED. The other order races: the host can answer before this
  // side is listening, and the card then sits empty forever with no error anywhere.
  window.parent?.postMessage({ type: MSG_CARD_READY }, '*')
  return () => window.removeEventListener('message', onMessage)
}

/**
 * Report this document's height to the host, so a card frame is exactly as tall as its content.
 *
 * A ResizeObserver rather than one measurement, because a card renders in stages — data arrives, then
 * an image decodes, then a highlight completes — and a height reported once would clip whatever came
 * after.
 *
 * CALL ONLY ON A CARD ROUTE. The same UI is also mounted as a full page, where the host sizes nothing
 * and a stray height message is noise.
 *
 * Returns a function that stops reporting.
 */
export function reportCardHeight(): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  let last = 0
  const send = (): void => {
    const h = Math.ceil(document.body.getBoundingClientRect().height)
    // ONLY ON CHANGE: the observer fires for width too, and re-sending an identical height would make
    // the host re-render for nothing.
    if (h === last || h <= 0) return
    last = h
    window.parent?.postMessage({ type: MSG_CARD_HEIGHT, height: h }, '*')
  }
  const ro = new ResizeObserver(send)
  ro.observe(document.body)
  send()
  return () => ro.disconnect()
}

/**
 * Ask the host to open one of this extension's views.
 *
 * The card names a ROUTE; the host decides whether that becomes a side panel or a full page. See the
 * note on {@link MSG_OPEN_VIEW} for why a card cannot navigate itself.
 */
export function requestOpenView(route: string, title: string): void {
  const parent = window.parent
  if (!parent || parent === window) return
  const req: OpenViewRequest = { ext: extensionId(), route, title }
  parent.postMessage({ type: MSG_OPEN_VIEW, ...req }, '*')
}

/**
 * This extension's UI id, taken from the mount path.
 *
 * DERIVED RATHER THAN CONFIGURED, so a rename of the Service or of the mount cannot leave a card
 * asking the host to open `/ext/<old-name>`. `/ext/gitdev/?…` gives `gitdev`.
 */
export function extensionId(): string {
  const m = /^\/ext\/([a-z0-9-]+)/.exec(window.location.pathname)
  return m?.[1] ?? ''
}

/**
 * The session this frame was mounted for, from `?session=`.
 *
 * THE FRAME'S OWN API CLIENT READS THIS to scope its requests. Empty means "not scoped to a
 * conversation", which is what a panel opened from the extension shelf has — and a card always has
 * one, because the host builds its URL.
 */
export function sessionId(): string {
  return new URLSearchParams(window.location.search).get('session') ?? ''
}
