// RN's Text.js:289 and :291 apply these two defaults unconditionally. We declared both props in four
// adapters and applied neither, so native fell back to its own — `clip` instead of `tail`, which
// on device is a clamped Text cut mid-word with no ellipsis at all. Nothing threw; the text was
// just wrong.

import { describe, expect, it } from 'vitest';
import { resolveTextProps } from './text-props';

describe('resolveTextProps', () => {
  it('defaults ellipsizeMode to tail, matching RN', () => {
    expect(resolveTextProps({}).ellipsizeMode).toBe('tail');
  });

  it('leaves an explicit ellipsizeMode alone', () => {
    expect(resolveTextProps({ ellipsizeMode: 'middle' }).ellipsizeMode).toBe(
      'middle',
    );
    // 'clip' is a real RN mode, not an absent value — it must survive rather than be re-defaulted.
    expect(resolveTextProps({ ellipsizeMode: 'clip' }).ellipsizeMode).toBe(
      'clip',
    );
  });

  it('defaults allowFontScaling to true and only a literal false opts out', () => {
    expect(resolveTextProps({}).allowFontScaling).toBe(true);
    expect(
      resolveTextProps({ allowFontScaling: undefined }).allowFontScaling,
    ).toBe(true);
    expect(resolveTextProps({ allowFontScaling: false }).allowFontScaling).toBe(
      false,
    );
  });

  it('emits both keys unconditionally, so the key set never shrinks', () => {
    // A fold whose branches emit different key sets is the hazard
    // .claude/rules/solid-descriptor-bridge.md §1 exists for: Solid's `spread` has no removal
    // pass, so a key that vanishes keeps its last value on the native view forever.
    const bare = Object.keys(resolveTextProps({})).sort();
    const full = Object.keys(
      resolveTextProps({ ellipsizeMode: 'head', allowFontScaling: false }),
    ).sort();
    expect(bare).toEqual(full);
  });

  it('passes every other prop through untouched', () => {
    const out = resolveTextProps({ numberOfLines: 2, testID: 'probe' });
    expect(out.numberOfLines).toBe(2);
    expect(out.testID).toBe('probe');
  });
});
