import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The FRAME side of the session/selection contract.
 *
 * MODULE STATE IS PART OF THE DESIGN HERE: a frame is one document, so "the current session context"
 * is a singleton on purpose. That makes these tests order-sensitive unless each one gets a fresh
 * module, which is what `vi.resetModules()` below is for — the alternative would be a reset function
 * on the published API that exists only for tests.
 *
 * Two things are worth proving and neither is an implementation detail:
 *
 *   * a panel that subscribes gets the CURRENT value immediately, not only the next change — the
 *     race that would otherwise make the first selection invisible;
 *   * `setSelection(ns, '')` is a CLEAR, and it travels as one.
 */

const posted: Array<Record<string, unknown>> = []

function dispatch(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }))
}

beforeEach(() => {
  posted.length = 0
  vi.resetModules()
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage: (m: Record<string, unknown>) => posted.push(m) },
  })
})

/** Fresh module graph, so the module's `current` starts empty. */
async function fresh() {
  const protocol = await import('./protocol.js')
  const session = await import('./session.js')
  return { ...session, MSG_SESSION: protocol.MSG_SESSION }
}

function sessionMsg(
  MSG_SESSION: string,
  sessionId: string,
  selections: Record<string, string> = {},
) {
  return { type: MSG_SESSION, sessionId, selections }
}

describe('sessionContext', () => {
  it('is null before the host has said anything', async () => {
    // NULL IS A REAL ANSWER: a panel opened from the shelf has no conversation, and an empty string
    // could not be told apart from a real one.
    const { sessionContext } = await fresh()
    expect(sessionContext()).toBeNull()
  })

  it('reflects what the host last sent', async () => {
    const { sessionContext, MSG_SESSION } = await fresh()
    dispatch(sessionMsg(MSG_SESSION, 's1', { sandbox: 'dev-1' }))
    expect(sessionContext()).toEqual({ sessionId: 's1', selections: { sandbox: 'dev-1' } })
  })

  it('ignores a message that is not a session context', async () => {
    const { sessionContext, MSG_SESSION } = await fresh()
    dispatch(sessionMsg(MSG_SESSION, 's1'))
    dispatch({ type: 'easyagent:theme', theme: 'dark' })
    expect(sessionContext()?.sessionId).toBe('s1')
  })

  it('drops blank selection values rather than storing them', async () => {
    const { sessionContext, MSG_SESSION } = await fresh()
    dispatch({
      type: MSG_SESSION,
      sessionId: 's1',
      selections: { sandbox: '', gitdev: 'x' },
    })
    expect(sessionContext()?.selections).toEqual({ gitdev: 'x' })
  })
})

describe('onSessionContext', () => {
  it('calls back immediately with a value already received', async () => {
    // THE WHOLE REASON THIS IS ONE FUNCTION. Subscribe-then-read races the message, and the symptom
    // is a panel that ignores the first selection and looks broken until the user picks again.
    const { onSessionContext, MSG_SESSION } = await fresh()
    dispatch(sessionMsg(MSG_SESSION, 's1', { sandbox: 'dev-1' }))
    const seen: string[] = []
    onSessionContext(c => seen.push(c.sessionId))
    expect(seen).toEqual(['s1'])
  })

  it('calls back on every later change', async () => {
    const { onSessionContext, MSG_SESSION } = await fresh()
    const seen: string[] = []
    onSessionContext(c => seen.push(`${c.sessionId}:${c.selections.sandbox ?? ''}`))
    dispatch(sessionMsg(MSG_SESSION, 's1', { sandbox: 'dev-1' }))
    dispatch(sessionMsg(MSG_SESSION, 's1', { sandbox: 'dev-2' }))
    // NO leading ': ' — there is nothing to call back with until the host has said something. The
    // immediate call is for a subscriber that arrives AFTER a value, not one that arrives first.
    expect(seen).toEqual(['s1:dev-1', 's1:dev-2'])
  })

  it('stops after unsubscribe', async () => {
    const { onSessionContext, MSG_SESSION } = await fresh()
    const seen: string[] = []
    const off = onSessionContext(c => seen.push(c.sessionId))
    dispatch(sessionMsg(MSG_SESSION, 's1'))
    off()
    dispatch(sessionMsg(MSG_SESSION, 's2'))
    expect(seen).toEqual(['s1'])
  })
})

describe('setSelection', () => {
  it('posts the namespace and id', async () => {
    const { setSelection } = await fresh()
    setSelection('sandbox', 'dev-1')
    expect(posted).toContainEqual({
      type: 'easyagent:selection',
      namespace: 'sandbox',
      id: 'dev-1',
    })
  })

  it('sends an empty id as a clear', async () => {
    const { setSelection } = await fresh()
    setSelection('sandbox', '')
    expect(posted).toContainEqual({ type: 'easyagent:selection', namespace: 'sandbox', id: '' })
  })

  it('refuses a blank namespace, which nothing could ever read', async () => {
    const { setSelection } = await fresh()
    setSelection('', 'dev-1')
    expect(posted).toHaveLength(0)
  })
})

describe('closeView / setViewTitle', () => {
  it('posts a close', async () => {
    const { closeView } = await fresh()
    closeView()
    expect(posted).toContainEqual({ type: 'easyagent:view-close' })
  })

  it('posts a title', async () => {
    const { setViewTitle } = await fresh()
    setViewTitle('sandbox dev-1')
    expect(posted).toContainEqual({ type: 'easyagent:view-title', title: 'sandbox dev-1' })
  })

  it('does not send a blank title', async () => {
    const { setViewTitle } = await fresh()
    setViewTitle('   ')
    expect(posted).toHaveLength(0)
  })
})
