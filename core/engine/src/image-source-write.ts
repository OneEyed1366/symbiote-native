// Image sources, resolved on the way IN rather than in the C++ payload builder like the rest of
// Image's rule: resolveImageSource asks Metro's asset registry, a JS-only, bundle-time table with
// no C++ side. Same seam as structured-style.ts's write-time boxShadow/filter/transform fold.

// The three names are Image's: `source` the real one, `defaultSource` the placeholder,
// `loadingIndicatorSource` Android's spinner.

import { resolveImageSource } from './image-source-resolver';

export const IMAGE_SOURCE_PROPS: ReadonlySet<string> = new Set([
  'source',
  'defaultSource',
  'loadingIndicatorSource',
]);

// Resolve a source prop and normalize it to the array shape native expects — always an array,
// even for the single-object and asset-id cases, since a bare object reaching Fabric paints and
// reports nothing at all.

// A value this can't make sense of comes back untouched rather than wrapped: a tag with no image
// behavior must keep its props verbatim (pinned by image-payload.itest.ts).
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

// Android's ReactImageView.setShouldNotifyLoadEvents gates on this prop: none of these four ever
// fire until Image.android.js sets it, because any one of them is authored; iOS has no such gate.

// Real Fabric events (view-config.ts's COMPONENT_EVENTS.RCTImageView), so routeProp diverts them
// through setEventListener/node.listeners, never writeProp — named in listener form (onLoad ->
// load), what node.listeners keys on.
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
