// The whole standing cost of the Platform resolver in vitest.config.ts.
//
// RN's colour path is `processColor -> PlatformColorValueTypes -> Utilities/Platform`, and that
// last hop is a back-compat shim that imports itself under any resolver without Metro's platform
// extensions. Everything downstream of it - processColor, and therefore processBoxShadow,
// processFilter and processBackgroundImage - was unimportable in this suite until that was fixed.
//
// The failure it guards against is NOT a red test: the shim resolves, the import succeeds, and the
// first `Platform.OS` read throws inside our own catch, so a broken resolver shows up as a
// processor that silently returns nothing. That is indistinguishable from a processor correctly
// refusing bad input, which is why this file asserts a POSITIVE result on known-good input.

import { describe, expect, it } from 'vitest';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processColorUpstream from 'react-native/Libraries/StyleSheet/processColor';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import PlatformUpstream from 'react-native/Libraries/Utilities/Platform';

describe("react-native's own colour path is importable and runs", () => {
  // why: the shim resolving to itself leaves the default export undefined, which is exactly what
  // this asserts against. `OS` is a plain literal on Platform.ios, so reading it needs no native.
  it('resolves the Platform shim to a real implementation', () => {
    expect(PlatformUpstream?.OS).toBe('ios');
  });

  // why: processColor's contract is the rotation, not the parse - it takes rrggbbaa from
  // normalizeColor and hands native aarrggbb. Opaque red is 0xffff0000 after rotating, and getting
  // the pre-rotation 0xff0000ff back would mean native paints blue.
  it('rotates a named colour into the int native expects', () => {
    expect(processColorUpstream('red')).toBe(0xffff0000);
  });

  // why: the CSS forms a hand-written parser is most likely to miss. Any of these coming back
  // null means the upstream module loaded but is not actually running.
  it.each([
    ['#f00', 0xffff0000],
    ['rgba(255, 0, 0, 1)', 0xffff0000],
    ['hsl(0, 100%, 50%)', 0xffff0000],
  ])('parses %s', (css, expected) => {
    expect(processColorUpstream(css)).toBe(expected);
  });

  // why: the control. A processor that answered a number to everything would pass every row
  // above, including nonsense.
  //
  // The value is `undefined`, not null, and the difference is contractual rather than incidental:
  // processColor.js:22 passes a null INPUT straight back, while :28 answers `undefined` for a
  // string it could not parse. So "the app wrote null" and "the app wrote something unparseable"
  // stay distinguishable - and the second lands on the absent-key rule the payload builder
  // enforces, which is the behaviour we want.
  it('answers undefined for a string that is not a colour', () => {
    expect(processColorUpstream('not-a-colour')).toBeUndefined();
  });

  // why: the other half of that contract, and the reason the row above is not just pedantry.
  it('passes a null colour back unchanged', () => {
    expect(processColorUpstream(null)).toBeNull();
  });
});
