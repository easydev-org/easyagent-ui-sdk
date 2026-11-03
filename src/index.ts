/**
 * `@easydev-org/ext-ui` — the FRAME side of the contract between an extension UI and the console that
 * mounts it.
 *
 * THREE THINGS AN EXTENSION NEEDS, and nothing else:
 *
 *   * the theme, so a panel does not flash the wrong palette;
 *   * its card's data, when it renders one;
 *   * a way to ask the host to open a full view, because a card cannot navigate.
 *
 * THE HOST SIDE IS A SEPARATE ENTRY POINT (`@easydev-org/ext-ui/host`). A console needs the constants and
 * the validators for what it receives; giving it `receiveCardData` as well would let a console call a
 * function that posts to its own parent.
 *
 * WHAT IS DELIBERATELY ABSENT: no client for the extension's own API. That API is the extension's, and
 * the credential never enters the frame — the host proxies data requests for the console's own screens,
 * and a card needs none because it is handed its result. An SDK that offered a fetch would be offering
 * a token, which is the one thing the frame must not have.
 */

export * from './protocol.js'
export {
  applyTheme,
  announceThemeReady,
  currentTheme,
  listenForTheme,
  onThemeChange,
} from './theme.js'
export { extensionId, receiveCardData, reportCardHeight, requestOpenView, sessionId } from './card.js'

import { announceThemeReady, listenForTheme } from './theme.js'

/**
 * Wire up the theme channel: listen for changes, and announce readiness.
 *
 * ONE CALL INSTEAD OF TWO, because forgetting either is invisible:
 *
 *   - without the listener, a panel keeps the palette it loaded with until a reload;
 *   - without the announcement, the host may never send the first message at all — and that stays
 *     hidden while the console broadcasts to every frame on every change.
 *
 * The card-data listener is NOT here: only the card route wants it, and a full-page view that
 * subscribed would log a handshake nobody answers.
 */
export function connectToHost(): () => void {
  const stop = listenForTheme()
  announceThemeReady()
  return stop
}
