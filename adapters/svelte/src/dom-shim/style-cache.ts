// Where a `style={…}` attribute really goes, and why the shim cannot read it off `cssText`.
//
// Every tag name takes the same path: the compiler emits `$.set_style(node, value)` for `style`,
// on a short tag and a hyphenated one alike. `set_style` then STRINGIFIES —
// `to_style(value, undefined)` is `String(value)` — so a React Native style object arrives at
// `dom.style.cssText` as the literal `"[object Object]"`. Nothing downstream can recover it.
//
// One line later `set_style` writes the ORIGINAL value onto the element under a module-private
// `Symbol('style')` (svelte's `internal/client/constants.js`), which it also reads back as the
// change guard. That symbol is the only surviving copy, so intercepting it is the only way a
// bare `<view style={obj}>` reaches `routeProp`.
//
// The symbol is not exported, so it is DISCOVERED by running svelte's own `set_style` against a
// probe and reading the one own symbol it leaves behind — once per process, never per node. A
// version that changes the shape fails loudly here rather than silently dropping every style.
import { set_style } from 'svelte/internal/client';

export function discoverStyleCacheKey(): symbol {
  const probe = { style: { cssText: '' } };
  // A non-null string: `to_style` returns it unchanged, so the probe stays on the assignment
  // branch and never reaches `removeAttribute`, which it does not implement.
  set_style(probe, 'probe');
  const symbols = Object.getOwnPropertySymbols(probe);
  if (symbols.length !== 1)
    throw new Error(
      `svelte's set_style left ${symbols.length} own symbols on a probe; ` +
        'the style-cache key cannot be identified and `style` would be dropped',
    );
  return symbols[0];
}
