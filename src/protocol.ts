/**
 * The wire protocol between the console and an extension UI in an iframe.
 *
 * WHY THIS FILE EXISTS ON ITS OWN: the messages are a CONTRACT between two programs that are built and
 * deployed separately — the console here, the extension anywhere. When the strings lived only in the
 * console, an extension had to copy them and hope; a typo produced a card that stayed empty forever
 * with no error on either side. Both ends import from here now, so a rename is a compile error in both
 * rather than a silent mismatch in one.
 *
 * BOTH ENDS IMPORT THIS FILE, and that is the point of the two entry points:
 *
 *   @easydev-org/ext-ui          the FRAME side — what an extension's own UI calls
 *   @easydev-org/ext-ui/host     the HOST side — constants and validators for the console
 *
 * The split is not cosmetic. The frame SENDS card-height and open-view and RECEIVES card-data the host
 * SENDS; each side needs a different half, and a package that hands both halves to both sides invites
 * an extension to call `openViewFrom` on its own outgoing message.
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
 * Host → frame: the SESSION this view belongs to, plus whatever the extensions have selected in it.
 *
 * A SIDE VIEW IS SCOPED TO ONE CONVERSATION and needs more than its id: the sandbox panel has to know
 * which machine is being looked at, and the host has no idea what a machine is. So the host relays a
 * NAMESPACE → ID map it never interprets.
 *
 * Sent once when the frame is ready, and again whenever a selection changes, so a panel never has to
 * poll or ask.
 */
export const MSG_SESSION = 'easyagent:session'

/** Frame → host: "in namespace X, id Y is now selected." */
export const MSG_SELECTION = 'easyagent:selection'

/**
 * Frame → host: "close this view."
 *
 * A side view can be dismissed by the host's own chrome, but only the frame knows when its work is
 * done — a panel that finished a job and has nothing left to show should be able to say so rather
 * than leaving the user to find the close button.
 */
export const MSG_VIEW_CLOSE = 'easyagent:view-close'

/** Frame → host: "title this view X." A panel that opened on a machine should name that machine. */
export const MSG_VIEW_TITLE = 'easyagent:view-title'

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

/** The colour scheme a frame should use. */
export type ThemeMode = 'light' | 'dark'

/**
 * What a view is scoped to: the conversation, and what has been selected inside it.
 *
 * `selections` is NAMESPACED and the host does not interpret it. An extension declares a namespace in
 * its `ui.json` and reads its own entry here; the host only stores and relays. That is what lets a
 * sandbox panel know which machine to draw without the console learning what a machine is.
 */
export interface SessionContext {
  /** The conversation this view was opened for. Empty when it was opened from the shelf. */
  sessionId: string
  /** namespace -> id. Values are opaque to the host. */
  selections: Record<string, string>
}

/** Narrow an unknown value to a theme, or null. */
export function asThemeMode(v: unknown): ThemeMode | null {
  return v === 'light' || v === 'dark' ? v : null
}

/**
 * Read a session context, or null.
 *
 * Defaults are applied rather than rejected: a host that sends only `sessionId` is the ordinary case
 * for an extension that declares no namespaces, and refusing it would make every such panel handle a
 * null it does not need.
 */
export function asSessionContext(v: unknown): SessionContext | null {
  if (v === null || typeof v !== 'object') return null
  const d = v as { sessionId?: unknown; selections?: unknown }
  const selections: Record<string, string> = {}
  if (d.selections !== null && typeof d.selections === 'object') {
    for (const [k, val] of Object.entries(d.selections as Record<string, unknown>)) {
      if (typeof val === 'string' && val !== '') selections[k] = val
    }
  }
  return { sessionId: typeof d.sessionId === 'string' ? d.sessionId : '', selections }
}
