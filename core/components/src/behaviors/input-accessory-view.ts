// InputAccessoryView's host behavior — a prop fold and nothing else. No listeners, no timers, no
// commit hook: the wrapper's whole body was prop mapping, so its lowered form owes exactly that.
//
// The fold is NOT written here. `mapInputAccessoryViewProps` in
// `../view/render-input-accessory-view` is the one implementation and this file only narrows a flat
// bag into the typed view it takes, the `stringOf` / `styleOf` guard idiom `behaviors/image.ts`
// uses. Counted before starting, which is step one of the fold-only recipe: unlike Image, which had
// THREE implementations, all five adapters already call the shared render fn and Svelte's
// `input-accessory-view-props.ts` is a type declaration rather than a second mapping. So there was
// one implementation to extract, not three to collapse.
//
// SHARES THE WRAPPER'S TAG, no `-managed` twin. The two questions the recipe separates both answer
// no: the fold is idempotent (there is no aliasing at all — every consumed name leaves under the
// same name, so a second pass rewrites the same values), and the behavior carries no machine, so
// nothing can end up with two owners on one node. Idempotence is asserted rather than reasoned.
//
// PLATFORM. This is the only primitive in its group that is not platform-invariant in what it
// COMMITS TO: `symbiote-input-accessory-view` resolves to `RCTInputAccessoryView` on iOS and to a
// plain `RCTView` on Android. The fold itself is platform-invariant on purpose — it reproduces the
// wrapper's mapping exactly, on both platforms, so the lowered and wrapped paths cannot diverge
// per-platform. What it does NOT do is fix the pre-existing Android divergence underneath it:
// upstream RN renders NOTHING there (`InputAccessoryView.js` — `console.warn('<InputAccessoryView>
// is only supported on iOS.'); return null`), while we commit an RCTView, and `backgroundColor` is
// a declared prop of the iOS view but a style key on RCTView. Both predate this behavior and are
// identical on both paths; neither is in scope here, and a fold that "fixed" one silently would
// make the two paths disagree.
import {
  registerHostBehavior,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import {
  INPUT_ACCESSORY_VIEW_PROP_NAMES,
  mapInputAccessoryViewProps,
} from '../view/render-input-accessory-view';

export const INPUT_ACCESSORY_VIEW_TAG = 'symbiote-input-accessory-view';

const CONSUMED: ReadonlySet<string> = new Set(INPUT_ACCESSORY_VIEW_PROP_NAMES);

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// A StyleProp is an object, an array of them, or a registered class array — all shapes
// `flattenStyle` already handles. Only a scalar has to be excluded.
function styleOf(value: unknown): IStyleProp<IViewStyle> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (Array.isArray(value)) return value;
  return { ...value };
}

export function foldInputAccessoryViewPayload(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const passthrough: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!CONSUMED.has(key)) passthrough[key] = props[key];
  }
  return mapInputAccessoryViewProps({
    nativeID: stringOf(props.nativeID),
    backgroundColor: stringOf(props.backgroundColor),
    style: styleOf(props.style),
    passthrough,
  });
}

// Required by IHostBehavior and deliberately empty: this primitive owns no per-node runtime.
// Written out rather than shared with a `noop` so the emptiness reads as a decision.
function attach(_node: ISymbioteNode): void {
  // nothing to set up
}

function detach(_node: ISymbioteNode): void {
  // nothing to release
}

export function registerInputAccessoryViewBehavior(): void {
  registerHostBehavior(INPUT_ACCESSORY_VIEW_TAG, {
    attach,
    detach,
    foldPayload: foldInputAccessoryViewPayload,
  });
}
