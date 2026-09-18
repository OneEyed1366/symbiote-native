// Fabric-prop translation: turn a node's logical props into the flat payload Fabric's C++ props
// expect. Color processing itself lives in ./platform-color (the stable leaf every color-touching
// module imports from); this file only decides WHICH props are color props and wires the structured
// CSS-style processors.
//
// IT IS CALLED BY THE HOST, and that is what the `props` parameter is for. The NODE still comes in
// beside it, because two inputs to the fold are JS-side facts about the node rather than entries in
// the bag — its authored component name and the sticky `hasAriaAlias` flag.
//
// **THIS IS THE HEADLESS BUILDER, and the device one is `SymbioteFabricProps.cpp`.** The header used
// to say the C++ side "does not have this yet", which was true mid-branch and stopped being true
// when the payload builder was ported; a reader who believed it would go looking for a blank screen.
//
// What follows from that, and it is the file's main rule: **no platform rule may live here.** The ten
// tag rules never got a copy, and RN's two Text defaults lost theirs on 2026-09-18. A rule with a
// copy on this side is a rule whose only test runs on this side, and the device copy can then break
// with everything green — not hypothetical: it is how a disabled `touchable-highlight` shipped
// `focusable: true`.
//
// ONE breaks the rule and is the next thing to move: `foldTextInputValue`, below, with its own note
// on why it did not travel with the defaults. Everything else here is the framework-agnostic half —
// colour processing, the style hoist, the aria fold, a node's own `payloadFold`.

import { foldAriaProps } from './accessibility-props';
import type { IFabricProps } from './fabric';
import { RAW_TEXT_COMPONENT, type ISymbioteNode } from './node';
import { isProcessableColor, processColor } from './platform-color';
import { configProcessedKeys } from './registry';
import { isRecord } from './type-guards';

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

// Convert a prop to the shape Fabric's C++ expects: a CSS-string color runs through the injected
// platform processor, because Fabric's C++ color parser silently drops strings.
//
// TWO FAMILIES OF PROCESSOR USED TO BE HERE AND BOTH MOVED, for one reason: on a device the payload
// is built in C++ and this function does not run, so anything resolved only here is resolved only
// headless. A third-party view's own `validAttributes[*].process` now runs in `configPayloadFold`
// (installed on the node, called by the C++ through `payloadFold`); the structured style keys
// — boxShadow, filter, transform, transformOrigin, aspectRatio, fontVariant,
// experimental_backgroundImage — now run at WRITE time in `structured-style.ts`, so `node.props`
// already holds the structured value whichever builder reads it.
//
// Neither may come back here. Applying a processor twice is not a no-op: a color already converted
// to a platform int, run through processColor again, is a DIFFERENT color.
function processValue(
  key: string,
  value: unknown,
  alreadyProcessed: ReadonlySet<string> | undefined,
): unknown {
  // A key the component's own config already converted is DONE. Running the engine's colour pass
  // over it as well is not a no-op: processColor rotates, so a second rotation is a different
  // colour. This used to be prevented by accident — a processed colour is a number, and numbers
  // were not processable — until a numeric colour became an author's own rrggbbaa literal.
  if (alreadyProcessed?.has(key) === true) return value;
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
// Keyed by the style object ALONE. It used to carry a per-component dimension because processValue
// consulted that component's ViewConfig processors and one style object could resolve differently
// under two view names; those processors moved to `configPayloadFold`, which runs on the top-level
// bag before this, so what is left here is component-independent.
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
const styleCache = new WeakMap<object, Record<string, unknown>>();

function processedStyle(
  style: Record<string, unknown>,
): Record<string, unknown> {
  const cached = styleCache.get(style);
  if (cached !== undefined) return cached;
  const resolved: Record<string, unknown> = {};
  for (const key of Object.keys(style)) {
    const value = style[key];
    // `undefined` for the already-processed set, and it must stay that way: this cache is keyed on
    // the style object ALONE (see the note above), so anything component-dependent read here would
    // be shared with every other component using the same style object. A config's processors are
    // keyed on top-level prop names and never reach inside a style anyway.
    resolved[key] =
      value === undefined ? undefined : processValue(key, value, undefined);
  }
  styleCache.set(style, resolved);
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

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
// RN HAS NO `value` FABRIC PROP. A TextInput's controlled value rides as the private `text` prop,
// and the fold that produces it — `value ?? defaultValue` — used to live in the component wrapper.
// A tag has no wrapper, so an author's `value={x}` would reach Fabric as a key no ViewConfig
// declares: silently dropped, `text` never set, and the field renders EMPTY. Nothing red anywhere —
// found 2026-08-31 by an agent reading what the render function actually emitted rather than
// trusting a header comment.
//
// So the fold lives in the layer every path goes through, exactly like the aria fold above it. This
// is the third instance of one rule: a tag inherits NOTHING a wrapper did, and the repair belongs
// below the fork.
//
// GATED ON THE COMPONENT, NOT ON THE PROP. `value` is also a prop of `Switch` and `Slider`; a fold
// keyed on the prop name would write a bogus `text` onto both. Two string comparisons rather than a
// Set lookup — this runs per node per commit, and the set has exactly two members.
//
// The engine may hold this because both views are in `BUILTIN_COMPONENTS`, whose hand-tuned tables
// (`view-config.ts`'s TEXT_INPUT_EVENTS, commit's COLOR_PROPS) already live here for the same
// reason. Routing it through `registerComponent` was tried first and is WRONG: `resolve()`
// short-circuits every builtin to EMPTY, so the registration would have been accepted and never
// applied.
const SINGLELINE_TEXT_INPUT = 'RCTSinglelineTextInputView';
const MULTILINE_TEXT_INPUT = 'RCTMultilineTextInputView';

/**
 * THE ONE PLATFORM RULE STILL MIRRORED HERE, and it is next rather than fine.
 *
 * Its twin is `foldTextInputValue` in `SymbioteFabricProps.cpp`, and the header above says why that
 * is a hazard: a vitest over this copy cannot see the device one. The gap was real until 2026-09-18
 * — `defaultValue` appeared in no itest at all — and is closed by
 * `core/engine/cpp/tests/js/text-input-payload.itest.ts`, which now pins the precedence, the
 * erasure, the explicit-`text` case, the component gate and the multiline tag against the payload a
 * commit actually sent. So the device rule is tested where it runs; what is left is the duplication.
 *
 * It did NOT go with the Text defaults because the two have different test topologies and deleting
 * both in one change makes neither attributable. The defaults were 15 cases, every one a claim about
 * the PLATFORM. This is ~32, and most are TextInput MACHINE tests — the controlled-value handshake,
 * which deliberately stays in JS — that merely use `payload.text` as their observable. Re-aiming
 * those at what they are actually about is its own piece of work, not a mechanical sweep.
 */
function foldTextInputValue(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const hasValue = props.value !== undefined;
  const hasDefault = props.defaultValue !== undefined;
  if (!hasValue && !hasDefault) return props;

  const folded: Record<string, unknown> = { ...props };
  // `value` WINS over `defaultValue`. An explicit `text` is left alone: that is the component path,
  // where the wrapper already folded, and re-folding there would let a stale `value` overwrite what
  // the wrapper computed.
  if (folded.text === undefined) {
    folded.text = hasValue ? props.value : props.defaultValue;
  }
  // Blanked, not deleted: `fabricProps` skips undefined, and neither name is a real Fabric prop.
  folded.value = undefined;
  folded.defaultValue = undefined;
  return folded;
}

export function fabricProps(
  node: ISymbioteNode,
  nodeProps: Readonly<Record<string, unknown>>,
): IFabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    // A raw-text node gets its behavior's fold too — it TRANSFORMS the text that is already there
    // (Button uppercases its label on Android) and may not SUPPLY one, which is narrower than this
    // comment claimed when it landed. `isEmptyRawText` (node.ts) decides whether the node commits
    // at all from the node's own `text` prop, before any fold runs, so a text that exists only as a fold
    // result is dropped by `renderableChildren` and the fold never executes. Reported by the hook's
    // first consumer, within the hour.
    //
    // Which is why the skip is NOT the thing to change: it runs for every raw-text node in every
    // app, and consulting a fold there would put one on that walk. Get the value into `props.text`
    // instead — Button routes the owner's `title` onto this node with `slotProps: {title: 'text'}`,
    // so the skip and the fold read the same source and an empty title still commits nothing.
    return {
      text:
        node.payloadFold !== undefined
          ? node.payloadFold(nodeProps).text
          : nodeProps.text,
    };
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
  // THE ONE POINT WHERE THE WHOLE BAG IS KNOWN ON EVERY PATH, which is what the aria fold needs:
  // `aria-checked` has to be folded against a sibling `accessibilityState`, and `routeProp` sees
  // one key at a time. Both commit paths — create and update — reach here, so a tag gets the fold
  // it has no wrapper to run.
  //
  // NOT memoised on the bag's identity. The host mutates it IN PLACE, so an identity-keyed cache
  // (the `processedStyle` pattern below) would be stale forever. The gate is the node's sticky flag
  // instead: one boolean read for a node with no alias, which is nearly all of them, and the fold's
  // own fast path returns by identity for the rest.
  const aliasFolded = node.hasAriaAlias ? foldAriaProps(nodeProps) : nodeProps;
  // The behavior's own fold, keyed on the TAG — the two folds above are keyed on the resolved
  // component name, which several tags share (`pressable` and a plain `view` are both `RCTView`),
  // so neither could carry a per-primitive fold. See IPayloadFold.
  //
  // THE FOLD'S RETURN REPLACES THE BAG, and it costs more than it looks — see
  // `payload-fold-merge.test.ts` for the measurement and for why the obvious fix does not fit yet.
  // Briefly: every fold returns `{ ...props, ...whatItChanged }`, and on device reading that back is
  // `jsi::dynamicFromValue`, 13.3 ms of a 17.8 ms fold phase against 1.6 ms to send the bag out and
  // 1.6 ms to run the fold.
  const behaviorFolded =
    node.payloadFold !== undefined
      ? node.payloadFold(aliasFolded)
      : aliasFolded;
  // RN'S TWO TEXT DEFAULTS USED TO BE APPLIED HERE AND ARE GONE (2026-09-18) — the rule lives in
  // `SymbioteFabricProps.cpp` alone, and its claims in `committed-payload.itest.ts`, read off the
  // payload a commit actually sent. It had FIVE other implementations that day (`resolveTextProps`,
  // Angular's `TextHost`, Vue's and Solid's renderers, and this one); the engine is the only layer
  // that can see the authored bag for every adapter at once, so it is the only one that needs to.
  //
  // So a text node's payload here is missing two keys the device's carries. That is a PROPERTY of
  // this harness rather than a gap in it — do not close it by adding the rule back.
  const props =
    node.component === SINGLELINE_TEXT_INPUT ||
    node.component === MULTILINE_TEXT_INPUT
      ? foldTextInputValue(behaviorFolded)
      : behaviorFolded;
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
