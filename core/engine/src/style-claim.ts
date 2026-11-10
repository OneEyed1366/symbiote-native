// Style keys a package consumes itself (CSS animations) are taken here and never reach Fabric
import { EMPTY_STYLE, hasRulesWithStates } from './style-registry';
import { isDevBuild } from './platform/shared';
import { isVariants } from './style-registry/variants';
import type { ISymbioteNode } from './node-types';

export type IOwnedStyle = Readonly<Record<string, unknown>>;

// The part of a value with variants (a pseudo-class) that the host paints
export type IVariantBase = { base: unknown };

export type IStyleClaim = {
  owns: (key: string) => boolean;
  // A value it answers for is handed over whole, and the host keeps only the base
  variantsOf?: (value: unknown) => IVariantBase | undefined;
  receive: (node: ISymbioteNode, owned: IOwnedStyle) => void;
};

// A style part a package builds itself (an animated style) and binds to the node that wears it
export type IStyleHandleClaim = {
  isHandle: (part: unknown) => boolean;
  // A framework that flattens a style array hands the keys of the handle over in one record with
  // the plain ones. It answers with the handle that record carries, so that one gets bound
  unwrap?: (record: object) => IUnwrapped | undefined;
  // What the host sees in the handle's place
  initialOf: (handle: object) => unknown;
  // Called once for each handle a node starts to wear, before the node commits
  prepare?: (node: ISymbioteNode, handle: object) => void;
  // Called once the node has committed; the returned release runs when the handle goes
  attach: (node: ISymbioteNode, handle: object) => (() => void) | undefined;
};

// The handle a flattened record carried, and the plain style keys that came with it
export type IUnwrapped = { handle: object; rest: object };

export type IFoundHandle = { handle: object; claim: IStyleHandleClaim };

// `kept` is what the host sees for a node's first publish, `settled` what it sees afterwards, once
// the starting values of the handles have been handed over
type ISplitStyle = {
  kept: unknown;
  settled: unknown;
  owned: IOwnedStyle;
  handles: readonly IFoundHandle[];
};

const claims: IStyleClaim[] = [];
const handleClaims: IStyleHandleClaim[] = [];
const NOTHING_OWNED: IOwnedStyle = Object.freeze({});
const NO_HANDLES: readonly IFoundHandle[] = Object.freeze([]);

// Keyed by the source object: a style written once is split once and keeps its one stripped copy,
// which is what lets the publish guard and the shared pair cache see a stable identity
let splits = new WeakMap<object, ISplitStyle>();

function keepAll(value: unknown): ISplitStyle {
  return {
    kept: value,
    settled: value,
    owned: NOTHING_OWNED,
    handles: NO_HANDLES,
  };
}

function withoutOwned(
  kept: Record<string, unknown>,
  owned: Record<string, unknown>,
): ISplitStyle {
  const rest = Object.keys(kept).length === 0 ? EMPTY_STYLE : kept;
  return { kept: rest, settled: rest, owned, handles: NO_HANDLES };
}

function isOwned(key: string): boolean {
  return claims.some(claim => claim.owns(key));
}

// A state nobody serves is refused in a dev bundle, so it is noticed, and ignored in a release one
function refuseUnservedStates(key: string, value: object): void {
  if (!isDevBuild()) return;
  const states = Object.keys(value).filter(name => name !== 'default');
  throw new Error(
    `style "${key}" has states (${states.join(', ')}) and nothing serves them: ` +
      'register @symbiote-native/reanimated, or take the states out of the style',
  );
}

// A claim that serves the states of a value gets it whole, otherwise the host paints nothing of it
function variantBaseOf(key: string, value: unknown): IVariantBase | undefined {
  for (const claim of claims) {
    const variants = claim.variantsOf?.(value);
    if (variants !== undefined) return variants;
  }
  if (!isVariants(value)) return undefined;
  refuseUnservedStates(key, value);
  return { base: undefined };
}

// Whether the pair was taken: the claim gets the value whole, the host keeps its base
function takeEntry(
  key: string,
  value: unknown,
  kept: Record<string, unknown>,
  owned: Record<string, unknown>,
): boolean {
  if (isOwned(key)) {
    owned[key] = value;
    return true;
  }
  const variants = variantBaseOf(key, value);
  if (variants === undefined) return false;
  owned[key] = value;
  if (variants.base !== undefined) kept[key] = variants.base;
  return true;
}

function splitHandle(record: object, claim: IStyleHandleClaim): ISplitStyle {
  return {
    kept: claim.initialOf(record),
    settled: EMPTY_STYLE,
    owned: NOTHING_OWNED,
    handles: [{ handle: record, claim }],
  };
}

function splitUnwrapped(
  { handle, rest }: IUnwrapped,
  claim: IStyleHandleClaim,
): ISplitStyle {
  const base = splitStyle(rest);
  return {
    kept: [base.kept, claim.initialOf(handle)],
    settled: base.settled,
    owned: base.owned,
    handles: [...base.handles, { handle, claim }],
  };
}

function unwrappedSplit(record: object): ISplitStyle | undefined {
  for (const claim of handleClaims) {
    const found = claim.unwrap?.(record);
    if (found !== undefined) return splitUnwrapped(found, claim);
  }
  return undefined;
}

function splitRecord(record: object): ISplitStyle {
  const cached = splits.get(record);
  if (cached !== undefined) return cached;
  const flattened = unwrappedSplit(record);
  if (flattened !== undefined) {
    splits.set(record, flattened);
    return flattened;
  }
  const handleClaim = handleClaims.find(claim => claim.isHandle(record));
  if (handleClaim !== undefined) {
    const split = splitHandle(record, handleClaim);
    splits.set(record, split);
    return split;
  }
  const kept: Record<string, unknown> = {};
  const owned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!takeEntry(key, value, kept, owned)) kept[key] = value;
  }
  const split =
    Object.keys(owned).length === 0
      ? keepAll(record)
      : withoutOwned(kept, owned);
  splits.set(record, split);
  return split;
}

function splitArray(items: readonly unknown[]): ISplitStyle {
  const cached = splits.get(items);
  if (cached !== undefined) return cached;
  const parts = items.map(splitStyle);
  const owned = parts.reduce<Record<string, unknown>>(
    (all, part) => ({ ...all, ...part.owned }),
    {},
  );
  const isChanged = parts.some((part, at) => part.kept !== items[at]);
  const isSettledChanged = parts.some((part, at) => part.settled !== items[at]);
  const split = {
    kept: isChanged ? parts.map(part => part.kept) : items,
    settled: isSettledChanged ? parts.map(part => part.settled) : items,
    owned,
    handles: parts.flatMap(part => part.handles),
  };
  splits.set(items, split);
  return split;
}

function splitStyle(value: unknown): ISplitStyle {
  if (Array.isArray(value)) return splitArray(value);
  if (typeof value !== 'object' || value === null) return keepAll(value);
  return splitRecord(value);
}

type ISettledLayer = {
  style: IOwnedStyle;
  // The slot the layer was last composed over, so an unchanged pair publishes the same array
  composedOn: unknown;
  composed: readonly unknown[];
};

// What an animation settled on, per node. Over the explicit style, т.к. the UI thread wrote the
// value last and a registry that has since been cleared no longer holds it
const settledLayers = new WeakMap<object, ISettledLayer>();
let isAnySettled = false;

// Gate for the style publication, which runs per node: an app with no claim pays three reads
export function hasStyleClaims(): boolean {
  return (
    claims.length > 0 ||
    handleClaims.length > 0 ||
    isAnySettled ||
    hasRulesWithStates()
  );
}

// Whether the layer changed; the same values again change nothing and cost the host nothing
export function settleStyle(parts: object, settled: IOwnedStyle): boolean {
  const standing = settledLayers.get(parts)?.style;
  const next = { ...standing, ...settled };
  const isSame = Object.keys(next).every(key =>
    Object.is(next[key], standing?.[key]),
  );
  if (isSame && standing !== undefined) return false;
  settledLayers.set(parts, {
    style: next,
    composedOn: undefined,
    composed: [],
  });
  isAnySettled = true;
  return true;
}

export function withSettledLayer(parts: object, explicit: unknown): unknown {
  const layer = settledLayers.get(parts);
  if (layer === undefined) return explicit;
  if (layer.composed.length === 0 || layer.composedOn !== explicit) {
    layer.composedOn = explicit;
    layer.composed = [explicit, layer.style];
  }
  return layer.composed;
}

type IHandleSink = (
  node: ISymbioteNode,
  found: readonly IFoundHandle[],
) => void;

// Set by `style-handle.ts` when a handle claim is registered, so the binding code (which needs the
// commit waiters, and through them the whole node barrel) is not an import of the style path
let handleSink: IHandleSink | undefined;

export function installHandleSink(sink: IHandleSink): void {
  handleSink = sink;
}

export function addStyleHandleClaim(claim: IStyleHandleClaim): () => void {
  handleClaims.push(claim);
  splits = new WeakMap();
  return () => {
    const at = handleClaims.indexOf(claim);
    if (at !== -1) handleClaims.splice(at, 1);
    splits = new WeakMap();
  };
}

// Returns the release, so a test can leave the registry as it found it
export function registerStyleClaim(claim: IStyleClaim): () => void {
  claims.push(claim);
  splits = new WeakMap();
  return () => {
    const at = claims.indexOf(claim);
    if (at !== -1) claims.splice(at, 1);
    splits = new WeakMap();
  };
}

// The nodes whose handles' starting values were already handed to the host. Reanimated sends them
// with the first render only, and the animation owns those properties from then on
const settledParts = new WeakSet<object>();

// The style as the host should see it: the same object when no claim owns a key in it
export function withoutClaimedKeys(style: unknown, parts: object): unknown {
  const split = splitStyle(style);
  return settledParts.has(parts) ? split.settled : split.kept;
}

// Called once a publish has gone out: later ones leave the handles' starting values out
export function settleHandles(parts: object, styles: readonly unknown[]): void {
  if (styles.some(style => splitStyle(style).handles.length > 0)) {
    settledParts.add(parts);
  }
}

export function claimedKeysIn(style: unknown): IOwnedStyle {
  return splitStyle(style).owned;
}

export function syncStyleHandles(
  node: ISymbioteNode,
  styles: readonly unknown[],
): void {
  handleSink?.(
    node,
    styles.flatMap(style => splitStyle(style).handles),
  );
}

// Every claim hears about every publish, with an empty bag once its keys are gone from the style
export function offerOwnedStyle(node: ISymbioteNode, owned: IOwnedStyle): void {
  for (const claim of claims) {
    const own = Object.entries(owned).filter(
      ([key, value]) =>
        claim.owns(key) || claim.variantsOf?.(value) !== undefined,
    );
    claim.receive(node, Object.fromEntries(own));
  }
}
