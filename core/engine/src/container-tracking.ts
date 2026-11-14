// Which container a node answers to, how big it is, and who restyles when that size moves
// Nodes are plain `object` here, so this module never reaches the node types back (see
// `style-registry/media-subscriptions.ts`)

import { flattenStyle } from './style';
import type {
  IContainerAxis,
  IContainerLookup,
  IContainerSize,
} from './style-registry/media-evaluate';

export type IContainerInfo = {
  readonly names: readonly string[];
  readonly open: readonly IContainerAxis[];
};

const NONE_OPEN: readonly IContainerAxis[] = [];

const infoByContainer = new WeakMap<object, IContainerInfo>();
const warnedContainers = new WeakSet<object>();
const sizeByContainer = new WeakMap<object, IContainerSize>();
const consumersByContainer = new WeakMap<object, Set<object>>();
// The containers above a consumer, nearest first, which a named query walks for its own name
const chainByConsumer = new WeakMap<object, readonly object[]>();
let restyler: (node: object) => void = () => {};

export function setContainerRestyler(restyle: (node: object) => void): void {
  restyler = restyle;
}

export function isContainer(node: object): boolean {
  return infoByContainer.has(node);
}

// `unfixed` is the open axes its type asked to be fixed, which is what the warning names
export function declareContainer(
  node: object,
  names: readonly string[],
  open: readonly IContainerAxis[] = NONE_OPEN,
  unfixed: readonly IContainerAxis[] = open,
): void {
  const known = infoByContainer.get(node);
  infoByContainer.set(node, { names, open });
  if (unfixed.length > 0 && !warnedContainers.has(node)) {
    warnedContainers.add(node);
    console.warn(
      `[@symbiote-native/engine] a container leaves its ${unfixed.join(' and ')} to its content, ` +
        'so a query on it reads false. Set width, height, flex or aspectRatio on the container.',
    );
  }
  const isSameAxes =
    known?.open.length === open.length &&
    open.every(axis => known.open.includes(axis));
  if (known !== undefined && !isSameAxes) restyleConsumersOf(node);
}

function restyleConsumersOf(container: object): void {
  const consumers = consumersByContainer.get(container);
  if (consumers === undefined) return;
  // Copied first, since a restyle may link the node again while the walk is running
  for (const consumer of Array.from(consumers)) restyler(consumer);
}

export function revokeContainer(node: object): void {
  if (!infoByContainer.delete(node)) return;
  sizeByContainer.delete(node);
  restyleConsumersOf(node);
}

export function unlinkConsumer(consumer: object): void {
  pending.delete(consumer);
  for (const container of chainByConsumer.get(consumer) ?? []) {
    consumersByContainer.get(container)?.delete(consumer);
  }
  chainByConsumer.delete(consumer);
}

export function linkConsumer(consumer: object, chain: readonly object[]): void {
  unlinkConsumer(consumer);
  chainByConsumer.set(consumer, chain);
  for (const container of chain) {
    const consumers = consumersByContainer.get(container) ?? new Set<object>();
    consumersByContainer.set(container, consumers.add(consumer));
  }
}

/** Answers whether the size moved, which is when the consumers of the container restyled */
export function reportContainerSize(
  container: object,
  size: IContainerSize,
): boolean {
  const known = sizeByContainer.get(container);
  if (known?.width === size.width && known.height === size.height) return false;
  sizeByContainer.set(container, size);
  restyleConsumersOf(container);
  return true;
}

const NO_NAME = 'none';

const SIZING_KEYS = ['flex', 'flexGrow', 'flexBasis', 'aspectRatio'] as const;
type ISizingKey = (typeof SIZING_KEYS)[number];

function isFixed(value: unknown): boolean {
  return value !== undefined && value !== null && value !== 'auto';
}

const WIDTH_AXIS: IContainerAxis = 'width';
const HEIGHT_AXIS: IContainerAxis = 'height';

// An axis is fixed by its own length or by a flex or aspect ratio, never by what the node holds
// Only `size` contains the height, so an `inline-size` container is asked for its width alone
// `open` is what no query may read, `unfixed` the part of it the container's type asked to be set
function openAxesOf(
  style: Record<string, unknown>,
  containsHeight: boolean,
): { open: readonly IContainerAxis[]; unfixed: readonly IContainerAxis[] } {
  const isSized = SIZING_KEYS.some((key: ISizingKey) => isFixed(style[key]));
  const widthLeft = !isSized && !isFixed(style.width) ? [WIDTH_AXIS] : [];
  const heightLeft = !isSized && !isFixed(style.height) ? [HEIGHT_AXIS] : [];
  return {
    open: containsHeight
      ? [...widthLeft, ...heightLeft]
      : [...widthLeft, HEIGHT_AXIS],
    unfixed: containsHeight ? [...widthLeft, ...heightLeft] : widthLeft,
  };
}

/** The names a `container-name` lists and the axes it leaves open, `undefined` if no container */
export function containerStyleOf(
  base: unknown,
  explicit: unknown,
):
  | (IContainerInfo & { readonly unfixed: readonly IContainerAxis[] })
  | undefined {
  // An `undefined` mentions a key without setting it, which is how the host payload reads it too
  const style = Object.fromEntries(
    [base, explicit]
      .flatMap(slot => Object.entries(flattenStyle(slot)))
      .filter(([, value]) => value !== undefined),
  );
  const type: unknown = style.containerType;
  if (type !== 'size' && type !== 'inline-size') return undefined;
  const name = style.containerName;
  const names =
    typeof name === 'string'
      ? name.split(/\s+/).filter(each => each !== '' && each !== NO_NAME)
      : [];
  return { names, ...openAxesOf(style, type === 'size') };
}

function readLayoutSize(
  nativeEvent: Record<string, unknown>,
): IContainerSize | undefined {
  const { layout } = nativeEvent;
  if (typeof layout !== 'object' || layout === null) return undefined;
  const width: unknown = Reflect.get(layout, 'width');
  const height: unknown = Reflect.get(layout, 'height');
  return typeof width === 'number' && typeof height === 'number'
    ? { width, height }
    : undefined;
}

/** Runs before the app's own `layout` listener, so descendants restyle from the same event */
export function noteContainerLayout(
  node: object,
  nativeEvent: Record<string, unknown>,
): void {
  if (!infoByContainer.has(node)) return;
  const size = readLayoutSize(nativeEvent);
  if (size !== undefined) reportContainerSize(node, size);
}

// Consumers wait for the commit, since the containers above a node are known only once it is placed
const pending = new Set<object>();
// Nodes placed again after their first commit, whose consumers must look for their containers anew
const movedRoots = new Set<object>();

export function noteMoved(root: object): void {
  movedRoots.add(root);
}

/** A node whose class reads a container condition, linked to its containers after the commit */
export function queueConsumer(
  consumer: object,
  restyle: (node: object) => void,
): void {
  if (chainByConsumer.has(consumer)) return;
  setContainerRestyler(restyle);
  pending.add(consumer);
}

// `ancestorsOf` answers the node first and what is above it after, `subtreesOf` each root and below
export function linkQueuedConsumers(
  ancestorsOf: (node: object) => readonly object[],
  subtreesOf: (roots: readonly object[]) => readonly object[],
): void {
  if (movedRoots.size > 0) {
    const roots = Array.from(movedRoots);
    movedRoots.clear();
    for (const node of subtreesOf(roots)) {
      if (!chainByConsumer.has(node)) continue;
      unlinkConsumer(node);
      pending.add(node);
    }
  }
  if (pending.size === 0) return;
  for (const consumer of Array.from(pending)) {
    pending.delete(consumer);
    // The first entry is the node itself, and a container styles descendants, never itself
    linkConsumer(consumer, ancestorsOf(consumer).slice(1).filter(isContainer));
    restyler(consumer);
  }
}

// The first container above the consumer whose name the query carries, an unnamed query taking
// the nearest one, and no answer while that container has not been laid out
export function containerLookup(consumer: object): IContainerLookup {
  return name => {
    for (const container of chainByConsumer.get(consumer) ?? []) {
      const info = infoByContainer.get(container);
      if (info === undefined || !(name === null || info.names.includes(name)))
        continue;
      const size = sizeByContainer.get(container);
      return size === undefined || info.open.length === 0
        ? size
        : { ...size, open: info.open };
    }
    return undefined;
  };
}

// Test-only, since the tracking is module state
export function resetContainerTracking(): void {
  restyler = () => {};
  pending.clear();
  movedRoots.clear();
}
