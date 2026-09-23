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
export function resolveImageSourceProp(
  value: unknown,
  dropsSingleSourceHeaders = false,
): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' && typeof value !== 'object') return value;
  const resolved = resolveImageSource(value);
  if (Array.isArray(resolved)) return resolved;
  // Android `source` only: `Image.android.js` lifts headers to the native `headers` prop just for an
  // ARRAY source, and ReactImageView ignores per-source headers, so RN sends none for a single
  // object. Wrapping here erases that shape, so its headers go here too.
  if (
    dropsSingleSourceHeaders &&
    typeof resolved === 'object' &&
    resolved !== null &&
    'headers' in resolved
  ) {
    const { headers: _dropped, ...rest } = resolved;
    return [rest];
  }
  return [resolved];
}

// `ReactImageView.setShouldNotifyLoadEvents` (Android) — `downloadListener` stays `null`, and
// none of these four ever fires, until this prop is `true`. `Image.android.js` sets it whenever
// ANY one of them is authored; iOS's native side has no such gate and never sets it.
//
// These four are real Fabric events (`view-config.ts`'s `COMPONENT_EVENTS.RCTImageView`), so
// `routeProp` diverts them through `setEventListener`/`node.listeners`, never through `writeProp`
// — unlike an ordinary function prop, they never reach the `functionProps` stash. Named here in
// LISTENER form (post `listenerName()`: `onLoad` -> `load`), which is what `node.listeners` keys
// on. Same shape `GATED_EVENT_PROPS` uses for `onLayout`, applied to a name no host behavior owns.
export const IMAGE_LOAD_EVENT_NAMES: ReadonlySet<string> = new Set([
  'loadStart',
  'load',
  'loadEnd',
  'error',
]);

/** Whether at least one of the four still has a listener installed on the node. */
export function anyImageLoadEventListenerWired(
  listeners: ReadonlyMap<string, unknown> | undefined,
): boolean {
  if (listeners === undefined) return false;
  for (const name of IMAGE_LOAD_EVENT_NAMES) {
    if (listeners.has(name)) return true;
  }
  return false;
}
