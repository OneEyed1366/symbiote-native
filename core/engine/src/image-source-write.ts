// Image sources, resolved on the way IN rather than in the C++ payload builder like the rest of
// Image's rule: resolveImageSource asks Metro's asset registry, a JS-only, bundle-time table with
// no C++ side. Same seam as structured-style.ts's write-time boxShadow/filter/transform fold.

// The three names are Image's: `source` the real one, `defaultSource` the placeholder,
// `loadingIndicatorSource` Android's spinner.

import { resolveImageSource } from './image-source-resolver';
import { Platform } from './platform';

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
  // Android `source`: RN lifts headers only from an ARRAY source, so a single object sends none
  // Wrapping erases that shape, hence the headers go here too
  const hasSourceHeaders =
    typeof resolved === 'object' && resolved !== null && 'headers' in resolved;
  if (dropsSingleSourceHeaders && hasSourceHeaders) {
    const { headers: _dropped, ...rest } = resolved;
    return [rest];
  }
  return [resolved];
}

// Пустой `uri` единственного `source`: RN предупреждает на обеих платформах, `Image.ios.js:131`
export function warnOnEmptyImageUri(key: string, value: unknown): void {
  const isSingleSource =
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (key !== 'source' || !isSingleSource) return;
  if (Reflect.get(value, 'uri') === '') {
    console.warn('source.uri should not be an empty string');
  }
}

// `ImageSourceUtils.js:57-77`: the rule that picks sources is in C++, only the warnings live here
export function warnOnBadSrcSet(key: string, value: unknown): void {
  if (key !== 'srcSet' || typeof value !== 'string') return;
  let supported = 0;
  for (const entry of value.split(', ')) {
    const [, scale = '1x'] = entry.split(' ');
    if (!scale.endsWith('x')) {
      console.warn(
        'The provided format for scale is not supported yet. Please use scales like 1x, 2x, etc.',
      );
    } else if (!Number.isNaN(parseInt(scale.split('x')[0] ?? '', 10))) {
      supported += 1;
    }
  }
  if (supported === 0) {
    console.warn('The provided value for srcSet is not valid.');
  }
}

const ANDROID_OS = 'android';

const PLACEHOLDER_PARTNER: Readonly<Record<string, string>> = {
  defaultSource: 'loadingIndicatorSource',
  loadingIndicatorSource: 'defaultSource',
};

// Какие из двух заглушек заданы у узла, т.к. чтение из хоста стоило бы flush на каждую запись
const placeholdersOf = new WeakMap<object, Set<string>>();

// `Image.android.js:191` бросает, когда заданы заглушка и спиннер сразу, и не только в dev
export function assertSinglePlaceholder(
  node: object,
  key: string,
  value: unknown,
): void {
  const partner = PLACEHOLDER_PARTNER[key];
  if (partner === undefined) return;
  if (Platform.OS !== ANDROID_OS) return;
  let set = placeholdersOf.get(node);
  if (value == null) {
    set?.delete(key);
    return;
  }
  if (set?.has(partner) === true) {
    throw new Error(
      'The <Image> component cannot have defaultSource and loadingIndicatorSource at the same time. ' +
        'Please use either defaultSource or loadingIndicatorSource.',
    );
  }
  if (set === undefined) {
    set = new Set();
    placeholdersOf.set(node, set);
  }
  set.add(key);
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
