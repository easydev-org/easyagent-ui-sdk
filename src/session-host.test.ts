import { describe, expect, it } from 'vitest'
import {
  isViewClose,
  MSG_SELECTION,
  MSG_SESSION,
  MSG_VIEW_CLOSE,
  MSG_VIEW_TITLE,
  selectionFrom,
  sessionContextMessage,
  viewTitleFrom,
} from '../src/host.js'

/**
 * The HOST side of the session/selection contract.
 *
 * Same rule as the rest of `host.ts`: these validate messages from a document the host does not
 * control. The interesting cases are the ones that look valid — an empty selection is a CLEAR, not a
 * malformed message, and treating it as malformed leaves the host showing stale state.
 */

describe('selectionFrom', () => {
  it('accepts a namespace and an id', () => {
    expect(selectionFrom({ type: MSG_SELECTION, namespace: 'sandbox', id: 'dev-1' })).toEqual({
      namespace: 'sandbox',
      id: 'dev-1',
    })
  })

  it('accepts an EMPTY id as a clear, not as malformed', () => {
    // setSelection(ns, '') is how a panel says "nothing is selected any more". Refusing it would
    // leave the host holding a value the panel has moved on from.
    expect(selectionFrom({ type: MSG_SELECTION, namespace: 'sandbox', id: '' })).toEqual({
      namespace: 'sandbox',
      id: '',
    })
  })

  it('rejects a blank namespace', () => {
    // A blank namespace would write into a key no extension declared, so nothing would ever read it.
    expect(selectionFrom({ type: MSG_SELECTION, namespace: '', id: 'x' })).toBeNull()
  })

  it('rejects a non-string id', () => {
    expect(selectionFrom({ type: MSG_SELECTION, namespace: 'sandbox', id: 7 })).toBeNull()
  })

  it('rejects other message types', () => {
    expect(selectionFrom({ type: 'easyagent:theme', namespace: 'a', id: 'b' })).toBeNull()
    expect(selectionFrom(null)).toBeNull()
    expect(selectionFrom('nope')).toBeNull()
  })
})

describe('isViewClose', () => {
  it('recognises the close message', () => {
    expect(isViewClose({ type: MSG_VIEW_CLOSE })).toBe(true)
  })

  it('ignores everything else', () => {
    expect(isViewClose({ type: MSG_SELECTION })).toBe(false)
    expect(isViewClose(null)).toBe(false)
  })
})

describe('viewTitleFrom', () => {
  it('accepts and trims a title', () => {
    expect(viewTitleFrom({ type: MSG_VIEW_TITLE, title: '  sandbox dev-1  ' })).toBe(
      'sandbox dev-1',
    )
  })

  it('rejects a blank title rather than clearing the header', () => {
    // A panel briefly between names would otherwise flicker the header to the extension's own name
    // and back.
    expect(viewTitleFrom({ type: MSG_VIEW_TITLE, title: '   ' })).toBeNull()
  })

  it('rejects a missing title', () => {
    expect(viewTitleFrom({ type: MSG_VIEW_TITLE })).toBeNull()
  })
})

describe('sessionContextMessage', () => {
  it('carries the type discriminator the frame validates on', () => {
    const m = sessionContextMessage({ sessionId: 's1', selections: { sandbox: 'dev-1' } })
    expect(m.type).toBe(MSG_SESSION)
    expect(m.sessionId).toBe('s1')
    expect(m.selections).toEqual({ sandbox: 'dev-1' })
  })

  it('copies the selections so a later mutation cannot change a message already sent', () => {
    const sels: Record<string, string> = { sandbox: 'dev-1' }
    const m = sessionContextMessage({ sessionId: 's1', selections: sels })
    sels.sandbox = 'dev-2'
    expect(m.selections.sandbox).toBe('dev-1')
  })
})
