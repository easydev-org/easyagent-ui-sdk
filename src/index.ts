/**
 * `@easyagent/ext-ui` — what an extension UI uses to talk to the console that mounts it.
 *
 * THREE THINGS AN EXTENSION NEEDS, and nothing else:
 *
 *   * the theme, so a panel does not flash the wrong palette;
 *   * its card's data, when it renders one;
 *   * a way to ask the host to open a full view, because a card cannot navigate.
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
  type ThemeMode,
} from './theme.js'
export { extensionId, receiveCardData, reportCardHeight, requestOpenView } from './card.js'

import { listenForTheme } from './theme.js'

/**
 * Wire up the two things every extension UI wants on load.
 *
 * ONE CALL INSTEAD OF TWO, because forgetting the theme listener is invisible until somebody switches
 * to dark mode while the panel is open — a bug found by a user, not by a test. The card-data listener
 * is NOT here: only the card route wants it, and a full-page view that subscribed would log a
 * handshake nobody answers.
 */
export function connectToHost(): () => void {
  return listenForTheme()
}
