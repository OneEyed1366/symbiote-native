// Fabric-prop translation: turn a retained node's logical props into the flat payload
// Fabric's C++ props expect. Split out of commit.ts (which owns the reconciler/mirror walk
// + the imperative instance API, neither of which this half touches) so the two
// responsibilities stop sharing one 300+ line file. Color processing itself lives in
// ./platform-color (the stable leaf every color-touching module imports from); this file only
// decides WHICH props are color props and wires the structured CSS-style processors.

import type { IFabricProps } from './fabric';
import { RAW_TEXT_COMPONENT, type ISymbioteNode } from './node';
import { registeredProcessor } from './registry';
import { isProcessableColor, processColor } from './platform-color';
import { processBoxShadow } from './process-box-shadow';
import { processFilter } from './process-filter';
import { processTransformOrigin } from './process-transform-origin';
import { processTransform } from './process-transform';
import { processAspectRatio } from './process-aspect-ratio';
import { processFontVariant } from './process-font-variant';
import { processBackgroundImage } from './process-background-image';
import { isRecord, isString } from './type-guards';

// Color props must reach Fabric as platform ints, not CSS strings. Fabric's C++
// color parser silently drops strings. The actual conversion (processColor) is
// RN-platform-specific, so it is injected in platform-color.ts rather than imported,
// keeping shared free of a react-native dependency (and the headless harness working).
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
  // Switch track/thumb colors. RN processColors each via the Switch ViewConfig
  // (SwitchNativeComponent / AndroidSwitchNativeComponent validAttributes). iOS takes
  // onTintColor (ON) / tintColor (OFF); Android takes trackColorForTrue/False +
  // trackTintColor, and Android's ColorPropConverter is strict ("the value must be a
  // number or Object"), so a raw CSS string crashes. thumbTintColor reaches both.
  'onTintColor',
  'thumbTintColor',
  'trackColorForTrue',
  'trackColorForFalse',
  'trackTintColor',
]);

// Structured CSS-style keys RN parses in JS before native (boxShadow/filter register
// with enableNativeCSSParsing(), which DEFAULTS TO FALSE, so native CSS parsing is off
// and the raw string is dropped). Each runs on the hoisted top-level style key, turning
// a CSS string or structured array into the processed array Fabric's C++ expects.
const STYLE_PROCESSORS = new Map<string, (value: unknown) => unknown>([
  ['boxShadow', value => processBoxShadow(asBoxShadowInput(value))],
  ['filter', value => processFilter(asFilterInput(value))],
  [
    'transformOrigin',
    value => processTransformOrigin(asTransformOriginInput(value)),
  ],
  ['transform', processTransformValue],
  ['aspectRatio', value => processAspectRatio(asAspectRatioInput(value))],
  ['fontVariant', value => processFontVariant(asFontVariantInput(value))],
  [
    'experimental_backgroundImage',
    value => processBackgroundImage(asBackgroundImageInput(value)),
  ],
]);

// boxShadow accepts a CSS string or an array of shadow objects; anything else is
// undefined to processBoxShadow (which returns []). Narrowing avoids an `as` cast.
function asBoxShadowInput(
  value: unknown,
): Parameters<typeof processBoxShadow>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// filter accepts a CSS string or an array of single-key filter objects; same narrowing.
function asFilterInput(value: unknown): Parameters<typeof processFilter>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// experimental_backgroundImage accepts a CSS string (gradient functions) or an array of
// structured gradient objects; same narrowing as boxShadow/filter.
function asBackgroundImageInput(
  value: unknown,
): Parameters<typeof processBackgroundImage>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// transformOrigin accepts a CSS string or a [x, y, z] array of strings/numbers; anything
// else is undefined to processTransformOrigin (which defaults to center/center/0).
function asTransformOriginInput(
  value: unknown,
): Parameters<typeof processTransformOrigin>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isStringOrNumber);
  return undefined;
}

// aspectRatio accepts a number (the common, working form) or a ratio string; otherwise
// undefined, which processAspectRatio drops.
function asAspectRatioInput(
  value: unknown,
): Parameters<typeof processAspectRatio>[0] {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

// fontVariant accepts an array of variant strings (the common, working form) or a
// space-separated string; anything else becomes an empty string, which yields [].
function asFontVariantInput(
  value: unknown,
): Parameters<typeof processFontVariant>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isString);
  return '';
}

// transform accepts a CSS string (processTransform parses it) or an array of single-key
// transform records (the hot animated / sticky-header path, passed through unchanged).
// A non-string non-array value is NOT dropped: it may already be processed, so it passes
// through verbatim rather than being coerced to [] (which would erase a valid transform).
function processTransformValue(value: unknown): unknown {
  if (typeof value === 'string') return processTransform(value);
  if (Array.isArray(value)) return processTransform(value.filter(isRecord));
  return value;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

// Convert a prop to the shape Fabric's C++ expects. A third-party view contributes
// its own processors, auto-derived from its ViewConfig (validAttributes[*].process,
// e.g. processColor for a slider's track tints); those run first. Then the structured
// CSS-style processors (boxShadow/filter). Built-ins are never in the registry, so they
// fall through to the global color path, where any CSS-string color is run through the
// injected platform processor (Fabric's C++ color parser silently drops strings).
function processValue(component: string, key: string, value: unknown): unknown {
  const processor = registeredProcessor(component, key);
  if (processor !== undefined) return processor(value);
  const styleProcessor = STYLE_PROCESSORS.get(key);
  if (styleProcessor !== undefined) return styleProcessor(value);
  if (COLOR_PROPS.has(key) && isProcessableColor(value))
    return processColor(value);
  return value;
}

// A style object is SHARED, and that is the one place this file has a complexity problem rather
// than a constant-factor one. StyleSheet.create hands out one frozen object per rule, and the CSS
// class registry resolves a class name to one cached object - so 1 000 rows carry the SAME handful
// of style objects, and resolving each one per node costs O(nodes x styleKeys) to compute an
// answer that only varies with O(distinct styles). Cache it on the style object's identity.
//
// Keyed by component as well: processValue consults that component's ViewConfig processors, so one
// style object can legitimately resolve differently under two view names.
//
// The cache assumes a style object is not MUTATED IN PLACE, which is already the engine's contract:
// setProp compares with Object.is and skips a same-identity write, so an in-place style edit never
// marks the node dirty and never reaches Fabric today either. What narrows slightly is the case
// where some OTHER prop on the same node changed in the same commit - that used to pick the
// mutation up as a side effect, and now does not.
//
// KEEPING undefined-valued keys is deliberate: the resolved object is a faithful picture of ONE
// style entry, and addStyle below needs to see an explicit `undefined` to let a later entry clear
// an earlier one. Dropping them here would silently turn `[{flex:1},{flex:undefined}]` into
// `flex: 1`.
const styleCache = new Map<string, WeakMap<object, Record<string, unknown>>>();

function processedStyle(
  component: string,
  style: Record<string, unknown>,
): Record<string, unknown> {
  let perComponent = styleCache.get(component);
  if (perComponent === undefined) {
    perComponent = new WeakMap();
    styleCache.set(component, perComponent);
  }
  const cached = perComponent.get(style);
  if (cached !== undefined) return cached;
  const resolved: Record<string, unknown> = {};
  for (const key of Object.keys(style)) {
    const value = style[key];
    resolved[key] =
      value === undefined ? undefined : processValue(component, key, value);
  }
  perComponent.set(style, resolved);
  return resolved;
}

/**
 * Hoist one style slot's keys into the payload being built, recursing on POSITION only - the same
 * rule flattenStyle follows, and for the same reason: `transform: [{translateX: 5}]` is an
 * array-VALUED prop, not a nested style.
 *
 * The point is that there is no intermediate object. Every style entry's resolution is memoized on
 * its own identity and its keys are written straight into `out`, so a thousand rows sharing one
 * class-resolved style resolve it ONCE and each node pays a copy loop.
 *
 * This is also the shape React Native itself uses. `ReactNativeAttributePayload.addNestedProperty`
 * (.vendors/react/packages/react-native-renderer/src/ReactNativeAttributePayload.js:208) recurses
 * over the style array writing into a single `updatePayload`; upstream's `flattenStyle` appears
 * ONLY in `diffNestedProperty`, i.e. the update path where an array meets an object - never on
 * create. Our previous version flattened first and hoisted second, which allocated one merged
 * object per node per commit that nothing else ever read.
 *
 * It also fixed a dead cache. `processedStyle` used to be reachable only when `props.style` was a
 * bare object, and it never is: `commitClassStyle` (node.ts) always writes the two-element
 * `[classStyle, explicitStyle]` array, by design. So the memo existed, was correct, and never ran.
 *
 * Later entries win, because a later write overwrites the same key on `out`. An explicit
 * `undefined` CLEARS the key instead, matching the flatten path it replaces. One narrow
 * divergence, recorded rather than hidden: the `delete` also clears a same-named TOP-LEVEL prop
 * hoisted before the style pass, which flattening did not. Style keys and native prop keys do not
 * overlap in practice (one is Yoga/visual, the other is testID/accessibility/source), so this is
 * theoretical - but it is a difference, and `fabric-props.test.ts` pins both halves.
 */
function addStyle(
  out: Record<string, unknown>,
  component: string,
  style: unknown,
): void {
  if (Array.isArray(style)) {
    for (const entry of style) addStyle(out, component, entry);
    return;
  }
  if (!isRecord(style)) return;
  const resolved = processedStyle(component, style);
  for (const key of Object.keys(resolved)) {
    const value = resolved[key];
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
}

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
export function fabricProps(node: ISymbioteNode): IFabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    return { text: node.props.text };
  }
  // This runs once per node per commit - 9 000 times on one benchmark press - so the two loops
  // below iterate with Object.keys rather than Object.entries: entries allocates a fresh
  // two-element array PER KEY on top of the outer array, and the resulting garbage was 18% of the
  // create path in a CPU profile.
  //
  // Do NOT "improve" this to `for...in`. It was tried and reverted 2026-08-23. On paper it is the
  // strictly cheaper shape - Object.keys allocates one array per call, 10 007 of them on a
  // 1 000-row create (counted), and for...in allocates none - and the headless V8 bench agreed,
  // 12-13% off create/replace `min`. On DEVICE it lost: with the Fabric call counts and prop-key
  // payload byte-identical either way (9000/5000/1009, 32001 keys), Release Create went 217.8 ->
  // 243.2 ms while stock moved only inside its 4% noise floor. Hermes' for-in is not V8's enum
  // cache. The general rule this bought: an allocation-count win measured on V8 is not a Hermes
  // win, and only the on-device number decides (`perf-claims-need-numbers`).
  const out: Record<string, unknown> = {};
  const props = node.props;
  for (const key of Object.keys(props)) {
    if (key === 'style') continue;
    const value = props[key];
    if (typeof value === 'function') continue;
    if (value === undefined) continue;
    out[key] = processValue(node.component, key, value);
  }
  // Hoist the style slot (object | array | nested arrays) into the SAME payload object - no
  // intermediate flatten. See addStyle for the shape and for the two things this fixed.
  addStyle(out, node.component, props.style);
  return out;
}
