// Image sources, resolved on the way IN rather than on the way out.
//
// WHY IT IS HERE AND NOT IN THE PAYLOAD BUILDER, which is where every other part of Image's rule
// now lives. `resolveImageSource` asks METRO'S ASSET REGISTRY — the table `require('./logo.png')`
// indexes into, populated at bundle time, in JavaScript. There is no such table in C++ and there
// should not be: it is the bundler's, not the platform's.
//
// This is the same seam and the same argument as `structured-style.ts`, which resolves
// `boxShadow`/`filter`/`transform` at write time for the identical reason — a value resolved at
// PAYLOAD-BUILD time is resolved HEADLESS ONLY, because the C++ builder has no JS to call, and the
// device then commits the raw input and Fabric drops it in silence. Moving the lookup one step
// earlier costs nothing and leaves the rest of the rule pure, which is what let it move at all.
//
// The three names are Image's: `source` is the real one, `defaultSource` the placeholder, and
// `loadingIndicatorSource` Android's spinner.

import { resolveImageSource } from './image-source-resolver';

export const IMAGE_SOURCE_PROPS: ReadonlySet<string> = new Set([
  'source',
  'defaultSource',
  'loadingIndicatorSource',
]);

/**
 * Resolve a source prop and normalise it to the ARRAY shape native expects.
 *
 * Always an array, including for the single-object and asset-id cases: a bare object reaching
 * Fabric paints nothing and reports nothing, which is worse than an image that is simply absent.
 * The rule downstream then has one shape to reason about instead of three.
 *
 * A value this cannot make sense of comes back UNTOUCHED rather than wrapped. `routeProp` writes
 * whatever it is handed, and a tag with no image behavior must keep its props verbatim — the
 * control case in `image-payload.itest.ts` is what holds that line.
 */
export function resolveImageSourceProp(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' && typeof value !== 'object') return value;
  const resolved = resolveImageSource(value);
  return Array.isArray(resolved) ? resolved : [resolved];
}
