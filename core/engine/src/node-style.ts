// The declarative style slots and their publication: two halves an adapter may write in either
// order, merged into the one array the payload carries

import { recordSetUnderlayShown } from './mutation-buffer';
import {
  EMPTY_STYLE,
  resolveActiveClassName,
  type IClassNameValue,
} from './style-registry';
import { setProp } from './node-props';
import type { IClassStyleParts, ISymbioteNode } from './node-types';

// Narrowed rather than cast: `routeProp` takes `unknown`, and a bare `typeof v === 'function'`
// leaves TS with `Function`, callable with anything
export function isStyleCallback(
  value: unknown,
): value is (state: { pressed: boolean }) => unknown {
  return typeof value === 'function';
}

// All slots present from the start rather than added as they are written, so a styled node keeps
// one hidden class instead of paying a shape transition per slot
export function stylePartsOf(node: ISymbioteNode): IClassStyleParts {
  return (node.styleParts ??= {
    classStyle: undefined,
    explicitStyle: undefined,
    hiddenStyle: undefined,
    className: undefined,
    isPressed: false,
    activeStyle: undefined,
    activeStyleFromCallback: false,
    published: undefined,
  });
}

// Slot 1's twin of `baseStyleOf`: the variant replaces slot 1, not slot 0, so it beats the class
// cascade the way the authored style does while a `:active` rule can still win slot 0 underneath
function explicitStyleOf(parts: IClassStyleParts): unknown {
  return parts.isPressed && parts.activeStyle !== undefined
    ? parts.activeStyle
    : parts.explicitStyle;
}

// `resolveActiveClassName` resolves the element's tokens PLUS `:active` through the same matcher,
// so the result already contains everything the base class gave. Resolved LAZILY at press time,
// т.к. eager would double the resolutions on every class WRITE to serve a rare state
function baseStyleOf(parts: IClassStyleParts): unknown {
  return parts.isPressed && typeof parts.className === 'string'
    ? resolveActiveClassName(parts.className)
    : parts.classStyle;
}

// What a node publishes when NOTHING resolves. Length 0 is the marker and needs no second field,
// т.к. `pushClassStyle` never otherwise publishes an empty array
const PUBLISHED_NOTHING: readonly unknown[] = Object.freeze([]);

// `mutation-buffer.ts` interns values BY IDENTITY, so distinct-but-equal arrays across a list
// styled the same way cost distinct entries and separate conversions to `folly::dynamic`

// `WeakMap` at both levels so nothing grows unbounded. The three-slot (hidden) form is deliberately
// NOT cached: `display: 'none'` is rare, so a third map would be paid for on every write
const sharedPairByExplicit = new WeakMap<object, readonly unknown[]>();
const sharedPairByBase = new WeakMap<
  object,
  WeakMap<object, readonly unknown[]> | readonly unknown[]
>();

// The published array for this pair, the same object every time the same two parts are handed in.
// `undefined` when the pair cannot be keyed, and the caller then builds its own array
function sharedStylePair(
  base: unknown,
  explicit: unknown,
): readonly unknown[] | undefined {
  const baseIsKeyable = typeof base === 'object' && base !== null;
  const explicitIsKeyable = typeof explicit === 'object' && explicit !== null;

  if (base === undefined && explicitIsKeyable) {
    const cached = sharedPairByExplicit.get(explicit);
    if (cached !== undefined) return cached;
    const made: readonly unknown[] = [base, explicit];
    sharedPairByExplicit.set(explicit, made);
    return made;
  }
  if (!baseIsKeyable) return undefined;

  if (explicit === undefined) {
    const cached = sharedPairByBase.get(base);
    if (Array.isArray(cached)) return cached;
    if (cached === undefined) {
      const made: readonly unknown[] = [base, explicit];
      sharedPairByBase.set(base, made);
      return made;
    }
    // A base already seen WITH an explicit half holds the second-level map here, and the base-only
    // array has nowhere to live beside it. Rare enough not to earn a third map
    return undefined;
  }
  if (!explicitIsKeyable) return undefined;

  const existing = sharedPairByBase.get(base);
  const byExplicit = existing instanceof WeakMap ? existing : new WeakMap();
  if (existing === undefined) sharedPairByBase.set(base, byExplicit);
  // The same clash the other way round: this base is holding its base-only array, so leave it
  if (Array.isArray(existing)) return undefined;

  const cached = byExplicit.get(explicit);
  if (cached !== undefined) return cached;
  const made: readonly unknown[] = [base, explicit];
  byExplicit.set(explicit, made);
  return made;
}

// A plain style bag: not an array of styles, not a callback, not null
function isStyleRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Is this rebuilt style the same style, key for key? A component body writing its style inline
// hands over a fresh object every render, equal to the one standing, which `Object.is` cannot see

// Shallow and conservative: a nested value reports "not the same" rather than being deep-compared,
// so being wrong here is slow and never incorrect
export function isSameShallowStyle(next: unknown, standing: unknown): boolean {
  // THE SAME OBJECT IS THE SAME STYLE, checked first: without it a re-push of a hoisted constant
  // allocates two key arrays and walks them to reach the answer identity gives for free
  if (next === standing) return isStyleRecord(next);
  if (!isStyleRecord(next) || !isStyleRecord(standing)) return false;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(standing).length) return false;
  for (const key of keys) {
    const value = next[key];
    if (value === undefined || isStyleRecord(value) || Array.isArray(value)) {
      return false;
    }
    if (!Object.is(value, standing[key])) return false;
  }
  return true;
}

function contributesNothing(slot: unknown): boolean {
  return slot === undefined || slot === EMPTY_STYLE;
}

// Read through the same two resolvers as the publication: guard and publication disagreeing is a
// silent wrong screen
function hasNothingToPublish(parts: IClassStyleParts): boolean {
  return (
    parts.hiddenStyle === undefined &&
    contributesNothing(baseStyleOf(parts)) &&
    contributesNothing(explicitStyleOf(parts))
  );
}

function isAlreadyPublished(parts: IClassStyleParts): boolean {
  const published = parts.published;
  if (published === undefined) return false;
  // The delete is already standing. Asked before the slot comparisons, т.к. an empty array would
  // otherwise pass both on `undefined` and then fail the length check
  if (published.length === 0) return hasNothingToPublish(parts);
  // Through the resolvers, not the raw slots: guard and publication must read slot 0 and slot 1 the
  // same way, or a press is turned away as already-published and does nothing with nothing red
  if (!Object.is(published[0], baseStyleOf(parts))) return false;
  if (!Object.is(published[1], explicitStyleOf(parts))) return false;
  return parts.hiddenStyle === undefined
    ? published.length === 2
    : published.length === 3 && Object.is(published[2], parts.hiddenStyle);
}

// The fresh ARRAY allocation stays DELIBERATELY: `setNativeProps` bypasses these parts, so a
// hoisted style constant would be skipped by the identity guard and never restore the declarative
// style an animation overwrote. The re-push IS the restore path
export function pushClassStyle(
  node: ISymbioteNode,
  parts: IClassStyleParts,
): void {
  // An unchanged class still reaches this write, т.к. Solid has no diff. The guard keys off
  // `published`, which `setNativeProps` clears, so an imperative restore still re-publishes
  if (isAlreadyPublished(parts)) return;
  // Emits NO_VALUE rather than `[undefined, undefined]`, so the host skips a real array with one
  // pointer check instead of building and diffing a `folly::dynamic`
  if (hasNothingToPublish(parts)) {
    parts.published = PUBLISHED_NOTHING;
    setProp(node, 'style', undefined);
    return;
  }
  // Third slot only appended while hidden: a permanent 3-element array would add an allocation to
  // every style write for a state most nodes never enter
  const base = baseStyleOf(parts);
  const explicit = explicitStyleOf(parts);
  const published =
    parts.hiddenStyle === undefined
      ? (sharedStylePair(base, explicit) ?? [base, explicit])
      : [base, explicit, parts.hiddenStyle];
  parts.published = published;
  setProp(node, 'style', published);
}

// `display: 'none'` is a real RN style value (Yoga's DisplayNone), so a hidden node keeps its
// place in the tree, its state and its children, and just stops laying out and painting
const HIDDEN_STYLE = { display: 'none' } as const;

// The seam React's Activity/Suspense reach for through `hideInstance` / `unhideInstance`. In the
// engine rather than an adapter, т.к. restoring the author's style byte belongs to the style merge
export function setNodeHidden(node: ISymbioteNode, hidden: boolean): void {
  const parts = stylePartsOf(node);
  parts.hiddenStyle = hidden ? HIDDEN_STYLE : undefined;
  pushClassStyle(node, parts);
}

// Put a node into (or out of) its pressed state so `:active` rules apply. Costs nothing when no
// `:active` rule is registered, т.к. `isAlreadyPublished` turns the re-push away
export function setNodePressed(node: ISymbioteNode, pressed: boolean): void {
  const parts = stylePartsOf(node);
  parts.isPressed = pressed;
  pushClassStyle(node, parts);
}

// Tell the host a behavior's FEEDBACK is showing, which is TouchableHighlight's underlay and only
// that. Not the same bit as `setNodePressed`, т.к. `shown` lags `pressed` by a timer
export function setNodeUnderlayShown(
  node: ISymbioteNode,
  shown: boolean,
): void {
  recordSetUnderlayShown(node, shown);
}

// Forget what was last published so the next `pushClassStyle` cannot be turned away. A no-op for a
// node nobody has styled, which is why this is not `stylePartsOf(node).published = undefined`
export function clearPublishedStyle(node: ISymbioteNode): void {
  if (node.styleParts !== undefined) node.styleParts.published = undefined;
}

// The explicit (non-class) style half, which an adapter building style key by key merges onto
// rather than `node.props.style`, which may hold the pair `pushClassStyle` publishes
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return node.styleParts?.explicitStyle;
}

// The `[classStyle, explicitStyle]` pair the node publishes, in the order `pushClassStyle` writes.
// For a caller that wants the merged answer without a host, `core/css-parser` reads it here
export function getPublishedStyle(node: ISymbioteNode): readonly unknown[] {
  const parts = node.styleParts;
  if (parts === undefined) return [];
  return [parts.classStyle, parts.explicitStyle];
}

export type { IClassNameValue };
