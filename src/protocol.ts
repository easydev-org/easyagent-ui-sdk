/**
 * The wire protocol between the console and an extension UI in an iframe.
 *
 * WHY THIS FILE EXISTS ON ITS OWN: the messages are a CONTRACT between two programs that are built and
 * deployed separately — the console here, the extension anywhere. When the strings lived only in the
 * console, an extension had to copy them and hope; a typo produced a card that stayed empty forever
 * with no error on either side. Both ends import from here now, so a rename is a compile error in both
 * rather than a silent mismatch in one.
 *
 * EVERY MESSAGE IS A STRING `type` PLUS A FLAT BODY. No envelopes, no versioning layer: this is a
 * postMessage channel between two windows that already trust each other's origin, and the payload is
 * a few hundred bytes of a tool result.
 */

/** Host → frame: the colour scheme. Sent on `?theme=` at load and again on every change. */
export const MSG_THEME = 'easyagent:theme'

/** Frame → host: "I am listening, send me the current theme." */
export const MSG_THEME_READY = 'easyagent:theme:ready'

/**
 * Frame → host: the document's content height, so a card frame is exactly as tall as what it shows.
 *
 * ONLY THE HOST CAN SIZE A FRAME IT OWNS, and only the frame knows how tall its content is — so the
 * number has to travel. It is re-sent whenever it changes, because a card renders in stages.
 */
export const MSG_CARD_HEIGHT = 'easyagent:card-height'

/** Frame → host: "this card is mounted and ready for its data." */
export const MSG_CARD_READY = 'easyagent:card-ready'

/** Host → frame: the tool call this card renders. */
export const MSG_CARD_DATA = 'easyagent:card-data'

/**
 * Frame → host: "open one of my views at this route."
 *
 * A CARD CANNOT NAVIGATE BY ITSELF. It is rendered inside a frame a few hundred pixels tall, so an
 * `<a href="#/ws/…">` would open the full browser INSIDE that frame — the reader would be looking at a
 * squeezed file tree and would have to collapse the card to escape. Only the host knows where a view
 * belongs (a side panel on a wide screen, a full page on a phone).
 */
export const MSG_OPEN_VIEW = 'easyagent:open-view'

/** What the host hands a card: the call's fields, and nothing else. */
export interface CardPayload {
  /** The tool's name, as the manifest declares it. */
  tool: string
  /** The arguments the model passed. */
  input: Record<string, unknown>
  /** The tool's structured result. */
  data: Record<string, unknown>
  /** The result TEXT — some payloads live only here (a diff, a fetched page). */
  output: string
  /** The call's error text, empty when it succeeded. */
  error: string
}

/** The message a card sends when it wants one of the extension's views opened. */
export interface OpenViewRequest {
  /** Which extension's view — filled in by {@link requestOpenView}, not by the caller. */
  ext: string
  /** The extension's own route, opaque to the host. */
  route: string
  /** A title for the host's header. */
  title: string
}
