// Fabric-prop translation: turn a node's logical props into the flat payload Fabric's C++ props
// expect. Color processing lives in ./platform-color (the stable leaf every color-touching module
// imports from); this file only decides WHICH props are color props.

// Called by the host — that's what the props parameter is for. The node comes in beside it for its
// authored component name and for a behavior's own payloadFold.

// This is the headless builder; the device one is SymbioteFabricProps.cpp. No platform rule may
// live here: a rule copied on this side is a rule whose only test runs on this side, and the
// device copy can then break with everything green.

// So the headless payload diverges from the device's, deliberately: a text input's carries `value`
// where the device's carries `text`, a text node's is missing two defaults, a bare tag's aria-*
// keys arrive unfolded — forcing a platform-rule claim to be made where the rule actually runs.

// What is left is the framework-agnostic half: colour processing, the style hoist, and a node's
// own payloadFold.

import type { IFabricProps } from './fabric';
import { RAW_TEXT_COMPONENT, type ISymbioteNode } from './node';
import { isProcessableColor, processColor } from './platform-color';
import { configProcessedKeys } from './registry';
import { isRecord } from './type-guards';

// Color props must reach Fabric as platform ints, not CSS strings — Fabric's C++ color parser
// silently drops strings. processColor is RN-platform-specific, so it's injected from
// platform-color.ts rather than imported, keeping this module free of a react-native dependency.
const COLOR_PROPS: ReadonlySet<string> = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  // Logical (writing-direction-relative) border colors + the block axis, all wired to
  // processColor in RN's ReactNativeStyleAttributes. borderStartColor/borderEndColor are
  // even publicly typed ColorValue, so they silently dropped on iOS / threw on Android.
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'shadowColor',
  // Text shadow + the W3C `outline`/image `overlay` colors, also processColor in RN.
  'textShadowColor',
  'overlayColor',
  'outlineColor',
  'tintColor',
  // TextInput color props. iOS's native input accepts a CSS string, but Android's
  // AndroidTextInput is strict ("ColorValue: the value must be a number or Object"),
  // so these must be processColor'd here too, same as any other color reaching Fabric.
  'placeholderTextColor',
  'selectionColor',
  'cursorColor',
  'underlineColorAndroid',
  // Text decoration color (underline/strike): same Fabric strictness as any color.
  'textDecorationColor',
  'selectionHandleColor',
  // Switch track/thumb colors. RN processColors each via the Switch ViewConfig; Android's
  // ColorPropConverter is strict ("must be a number or Object"), so a raw CSS string crashes.
  // thumbTintColor reaches both platforms.
  'onTintColor',
  'thumbTintColor',
  'trackColorForTrue',
  'trackColorForFalse',
  'trackTintColor',
]);

// Convert a prop to the shape Fabric's C++ expects: a CSS-string color runs through the injected
// platform processor, since Fabric's C++ color parser silently drops strings.

// Any other processor must NOT live here: on a device the payload is built in C++ and this
// function never runs, so anything resolved only here is resolved only headless. A third-party
// view's own config processors run in configPayloadFold; structured style keys run at write time.

// Neither may come back here. Applying a processor twice is not a no-op: a color already converted
// to a platform int, run through processColor again, is a different color.
function processValue(
  key: string,
  value: unknown,
  alreadyProcessed: ReadonlySet<string> | undefined,
): unknown {
  // A key the component's own config already converted is done. Running the colour pass over it
  // too is not a no-op: processColor rotates, so a second rotation is a different colour.
  if (alreadyProcessed?.has(key) === true) return value;
  if (COLOR_PROPS.has(key) && isProcessableColor(value))
    return processColor(value);
  return value;
}

// A style object is shared: StyleSheet.create hands out one frozen object per rule, and the CSS
// class registry resolves a class name to one cached object, so a thousand rows carry the same
// handful of style objects. Cache resolution on the style object's identity.

// Keyed by the style object alone: the per-component ViewConfig processors that once made one
// style object resolve differently under two view names moved to configPayloadFold, which runs on
// the top-level bag before this, so what's left here is component-independent.

// Assumes a style object is not mutated in place, which is already the engine's contract: setProp
// compares with Object.is and skips a same-identity write, so an in-place edit never marks the
// node dirty and never reaches Fabric either way.

// Keeping undefined-valued keys is deliberate: the resolved object is a faithful picture of one
// style entry, and addStyle below needs to see an explicit undefined to let a later entry clear an
// earlier one — dropping them would silently turn [{flex:1},{flex:undefined}] into `flex: 1`.
const styleCache = new WeakMap<object, Record<string, unknown>>();

function processedStyle(
  style: Record<string, unknown>,
): Record<string, unknown> {
  const cached = styleCache.get(style);
  if (cached !== undefined) return cached;
  const resolved: Record<string, unknown> = {};
  for (const key of Object.keys(style)) {
    const value = style[key];
    // undefined for the already-processed set: this cache is keyed on the style object alone, so
    // anything component-dependent read here would be shared with every user of that object.
    resolved[key] =
      value === undefined ? undefined : processValue(key, value, undefined);
  }
  styleCache.set(style, resolved);
  return resolved;
}

// Hoist one style slot's keys into the payload being built, recursing on position only — the same
// rule flattenStyle follows, and for the same reason: `transform: [{translateX: 5}]` is an
// array-valued prop, not a nested style.

// No intermediate object: every style entry's resolution is memoized on its own identity and its
// keys are written straight into `out`, so a thousand rows sharing one class-resolved style
// resolve it once and each node only pays a copy loop.

// Later entries win, because a later write overwrites the same key on `out`. An explicit
// undefined clears the key instead — the one narrow divergence from flattenStyle is that this also
// clears a same-named top-level prop hoisted before the style pass, pinned by fabric-props.test.ts.
function addStyle(out: Record<string, unknown>, style: unknown): void {
  if (Array.isArray(style)) {
    for (const entry of style) addStyle(out, entry);
    return;
  }
  if (!isRecord(style)) return;
  const resolved = processedStyle(style);
  for (const key of Object.keys(resolved)) {
    const value = resolved[key];
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
}

// Translate the retained node's logical props into the flat payload Fabric's C++ props expect:
// style keys are hoisted to the top level, event handlers and undefined values are dropped.

// RN has no `value` Fabric prop: a TextInput's controlled value rides as the private `text` prop,
// via a `value ?? defaultValue` fold a wrapper used to run. A tag has no wrapper, so this fold
// lives here instead — the same "a tag inherits nothing a wrapper did" rule as the aria fold above.

// Gated on the component, not the prop: `value` is also a prop of Switch and Slider, and a fold
// keyed on the prop name would write a bogus `text` onto both.
export function fabricProps(
  node: ISymbioteNode,
  nodeProps: Readonly<Record<string, unknown>>,
): IFabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    // A raw-text node gets its behavior's fold too — it transforms text already there (Button
    // uppercases its label) but may not supply one: isEmptyRawText decides whether the node
    // commits at all from the node's own text prop, before any fold runs.

    // So the skip is not the thing to change — it runs for every raw-text node in every app. Get
    // the value into props.text instead: Button routes its owner's title here via slotProps, so
    // the skip and the fold read the same source.
    return {
      text:
        node.payloadFold !== undefined
          ? node.payloadFold(nodeProps).text
          : nodeProps.text,
    };
  }
  // This runs once per node per commit, so the two loops below iterate with Object.keys rather
  // than Object.entries: entries allocates a fresh two-element array per key on top of the outer
  // array, measured as a real share of the create path's garbage.

  // Do not "improve" this to for...in: tried and reverted. It wins on allocation count and even on
  // headless V8 benchmarks, but loses on device — Hermes' for-in is not V8's enum cache, and only
  // the on-device number decides.
  const out: Record<string, unknown> = {};
  // The one point where the whole bag is known on every path, which the aria fold needs:
  // aria-checked must fold against a sibling accessibilityState, and routeProp sees one key at a
  // time. Both commit paths reach here, so a tag gets the fold it has no wrapper to run.

  // Not memoised on the bag's identity — the host mutates it in place, so an identity-keyed cache
  // would be stale forever. The gate is the node's sticky flag instead, one boolean read for a
  // node with no alias (nearly all of them); the fold's own fast path handles the rest.
  const aliasFolded = nodeProps;
  // The behavior's own fold, keyed on the tag — the two folds above are keyed on the resolved
  // component name, which several tags share (pressable and a plain view are both RCTView), so
  // neither could carry a per-primitive fold. See IPayloadFold.

  // The fold's return REPLACES the bag, which costs more than it looks (payload-fold-merge.test.ts
  // has the measurement): every fold returns `{ ...props, ...whatItChanged }`, and reading that
  // back on device dominates the fold phase.
  const behaviorFolded =
    node.payloadFold !== undefined
      ? node.payloadFold(aliasFolded)
      : aliasFolded;
  // RN's two text defaults are NOT applied here — the rule lives in SymbioteFabricProps.cpp alone,
  // pinned by committed-payload.itest.ts off a real payload. The engine is the only layer that can
  // see the authored bag for every adapter at once, so it's the only one that needs the rule.

  // So a text node's payload here is missing two keys the device's carries. That is a property of
  // this harness, not a gap in it — do not close it by adding the rule back.
  const props = behaviorFolded;
  // Hoisted out of the loop: one cached lookup per node per commit, not one per key.
  const alreadyProcessed = configProcessedKeys(node.component);
  for (const key of Object.keys(props)) {
    if (key === 'style') continue;
    const value = props[key];
    if (typeof value === 'function') continue;
    if (value === undefined) continue;
    out[key] = processValue(key, value, alreadyProcessed);
  }
  // Hoist the style slot (object | array | nested arrays) into the SAME payload object - no
  // intermediate flatten. See addStyle for the shape and for the two things this fixed.
  addStyle(out, props.style);
  return out;
}
