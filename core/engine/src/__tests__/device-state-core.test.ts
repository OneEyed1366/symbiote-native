// The pure KeyboardAvoidingView math (components)

import { describe, expect, it } from 'vitest';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
} from '../../../components/src/view/render-keyboard-avoiding-view';

// KeyboardAvoidingView's pure math has no dedicated test file elsewhere in the repo — this
// describe block is its ONLY coverage, so every branch of readKeyboardFrame / readLayoutFrame /
// computeInset / resolveKeyboardAvoidingLayout is enumerated here, not just the happy path.
describe('readKeyboardFrame / readLayoutFrame (returns undefined on a malformed payload, never throws)', () => {
  const frame = readLayoutFrame({ y: 0, height: 800 });
  const keyboard = readKeyboardFrame({
    endCoordinates: { screenY: 500, height: 300 },
  });

  // why: a well-formed onLayout/keyboard-event payload is the whole point of these
  // readers — the rest of the KAV math depends on them extracting the right fields.
  it('extracts the layout and keyboard frames from a well-formed payload', () => {
    expect(frame).toEqual({ y: 0, height: 800 });
    expect(keyboard).toEqual({ screenY: 500, height: 300 });
  });

  // why: both readers cross a native-event trust boundary (raw `unknown` payload);
  // a shape the reader doesn't recognize must degrade to "no frame yet" rather than
  // crash the render, since a stray/older-OS event shape must not blank the screen.
  it('returns undefined for a non-record, a record missing the nested field, and numeric-typo fields', () => {
    expect(readLayoutFrame(null)).toBeUndefined();
    expect(readLayoutFrame({ y: 0 })).toBeUndefined();
    expect(readLayoutFrame({ y: '0', height: 800 })).toBeUndefined();
    expect(readKeyboardFrame({})).toBeUndefined();
    expect(
      readKeyboardFrame({ endCoordinates: { screenY: 500 } }),
    ).toBeUndefined();
  });
});

describe('computeInset', () => {
  const frame = readLayoutFrame({ y: 0, height: 800 });
  const keyboard = readKeyboardFrame({
    endCoordinates: { screenY: 500, height: 300 },
  });

  // why: before either frame has been measured (no onLayout yet, or the keyboard
  // hasn't opened) there is nothing to avoid, so the inset must be a safe 0 rather
  // than reading through an undefined frame.
  it('is 0 when either frame is not yet known', () => {
    expect(computeInset(undefined, keyboard, 0)).toBe(0);
    expect(computeInset(frame, undefined, 0)).toBe(0);
  });

  // why: the inset is how far the view's bottom edge overlaps the keyboard's top
  // edge, and `verticalOffset` (a caller-supplied header/nav-bar height) shifts
  // that edge — this is RN's _relativeKeyboardHeight formula, the load-bearing
  // math the whole component exists to get right.
  it('computes the overlap inset, honoring verticalOffset and clamping at 0', () => {
    // view bottom = 0 + 800 = 800; keyboard top = 500; offset 0 -> inset = 300.
    expect(computeInset(frame, keyboard, 0)).toBe(300);
    // a vertical offset of 50 raises the keyboard line -> inset 350.
    expect(computeInset(frame, keyboard, 50)).toBe(350);
    // no overlap (keyboard below the view) clamps at 0.
    expect(computeInset({ y: 0, height: 100 }, keyboard, 0)).toBe(0);
  });
});

describe('resolveKeyboardAvoidingLayout', () => {
  // why: 'padding' is the default RN behavior on iOS — it must add exactly the
  // inset as bottom padding on the SAME wrapper the children render in, no extra
  // nesting (nesting would break flex layouts that assume a single wrapper).
  it("folds paddingBottom into the wrapper for behavior 'padding'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'padding',
      effectiveInset: 300,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    expect(
      layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle),
    ).toBe(true);
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ paddingBottom: 300 });
    }
  });

  // why: 'position' must NOT resize the wrapper (it stays the caller's own style)
  // but push an INNER view up by the inset, and it must keep carrying the caller's
  // wrapper style — a caller-supplied flex/background on the outer view must
  // survive the 'position' branch same as every other behavior.
  it("nests with bottom: inset for behavior 'position', preserving the wrapper's own style", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'position',
      effectiveInset: 120,
      style: { flex: 1 },
      contentContainerStyle: { padding: 8 },
    });
    expect(layout.kind).toBe('nested');
    expect(layout.kind === 'nested' && layout.wrapperStyle).toEqual({
      flex: 1,
    });
    if (layout.kind === 'nested' && Array.isArray(layout.innerStyle)) {
      expect(layout.innerStyle[1]).toEqual({ bottom: 120 });
    }
  });

  // why: 'height' shrinks the wrapper from its FIRST measured height, so the view
  // still fits above the keyboard without ever exceeding its original footprint.
  it("shrinks from the initial height for behavior 'height'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 200,
      initialHeight: 800,
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ height: 600, flex: 0 });
    }
  });

  // why: once the keyboard dismisses, `enabled`'s caller resets effectiveInset to
  // 0 — the wrapper must return to the caller's own style untouched, not linger at
  // the shrunk height from the last time the keyboard was up.
  it('leaves height mode untouched when disabled (effectiveInset 0)', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 0,
      initialHeight: 800,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper') {
      expect(layout.wrapperStyle).toEqual({ flex: 1 });
    }
  });

  // why: 'height' mode needs a measured baseline to shrink FROM; a keyboard event
  // that races ahead of the wrapper's first onLayout (initialHeight still unknown)
  // must fall back to the untouched style rather than compute `undefined - inset`
  // and hand the adapter a NaN height.
  it('leaves height mode untouched when the wrapper has not been measured yet (no initialHeight)', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 200,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper') {
      expect(layout.wrapperStyle).toEqual({ flex: 1 });
    }
  });

  // why: Android has no default `behavior` prop (RN leaves it undefined there) —
  // the component must degrade to a plain passthrough wrapper instead of picking
  // an arbitrary behavior on the caller's behalf.
  it('passes the style through untouched when no behavior is given', () => {
    const layout = resolveKeyboardAvoidingLayout({
      effectiveInset: 200,
      style: { flex: 1 },
    });
    expect(layout).toEqual({ kind: 'wrapper', wrapperStyle: { flex: 1 } });
  });
});
