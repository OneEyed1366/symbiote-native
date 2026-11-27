// `set_style` hands the renderer `String(value)`, so a style object arrives as "[object Object]"
// The original is written onto the node under a private `Symbol('style')`, the only copy left
// The symbol is found once per process by running `set_style` on a probe and reading its one key
import { set_style } from 'svelte/internal/client';

export function discoverStyleCacheKey(): symbol {
  const probe = { style: { cssText: '' } };
  // A non-null string keeps the probe on the assignment branch, which `removeAttribute` never joins
  set_style(probe, 'probe');
  const symbols = Object.getOwnPropertySymbols(probe);
  if (symbols.length !== 1)
    throw new Error(
      `svelte's set_style left ${symbols.length} own symbols on a probe; ` +
        'the style-cache key cannot be identified and `style` would be dropped',
    );
  return symbols[0];
}
