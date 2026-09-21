import { describe, it, expect } from 'vitest';
import {
  createInitialModalState,
  modalReducer,
  shouldRenderModal,
} from './modal';

// why: modalReducer has no throwing path — every action resolves to a state (guarded no-ops
// included) — so there is no Negative (toThrow) group. Groups are named after the mechanic each
// guards: initial mount, the keep-alive transition, and identity stability.

describe('createInitialModalState', () => {
  it('starts rendered when the modal mounts visible, matching RN: a visible modal paints on the first frame', () => {
    expect(createInitialModalState(true)).toEqual({ isRendered: true });
  });

  it('starts unrendered when the modal mounts hidden, matching RN: a hidden modal contributes no node on mount', () => {
    expect(createInitialModalState(false)).toEqual({ isRendered: false });
  });
});

describe('modalReducer — keep-alive transitions', () => {
  it('arms the keep-alive on show so a newly-visible modal renders', () => {
    const next = modalReducer({ isRendered: false }, { type: 'show' });
    expect(next).toEqual({ isRendered: true });
  });

  it('drops the keep-alive on hide so the exit animation can complete and the node unmount', () => {
    const next = modalReducer({ isRendered: true }, { type: 'hide' });
    expect(next).toEqual({ isRendered: false });
  });
});

describe('modalReducer — identity stability', () => {
  it('returns the SAME state object for a redundant show, so the adapter effect fires no spurious re-render', () => {
    const state = { isRendered: true };
    expect(modalReducer(state, { type: 'show' })).toBe(state);
  });

  it('returns the SAME state object for a redundant hide, so the adapter effect fires no spurious re-render', () => {
    const state = { isRendered: false };
    expect(modalReducer(state, { type: 'hide' })).toBe(state);
  });
});

describe('shouldRenderModal', () => {
  it('renders while visible, regardless of the keep-alive', () => {
    expect(shouldRenderModal(true, { isRendered: false })).toBe(true);
  });

  it('keeps rendering during the exit-animation frame after visible flips false', () => {
    expect(shouldRenderModal(false, { isRendered: true })).toBe(true);
  });

  it('renders nothing once both visible and the keep-alive have settled false', () => {
    expect(shouldRenderModal(false, { isRendered: false })).toBe(false);
  });
});
