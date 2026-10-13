import {
  bindToNode,
  getNativeTag,
  registerPropClaim,
  registerStyleHandleClaim,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { IAnimatedStyleController } from './animated-style';
import { wrapperOfNode } from './shadow-node-wrapper';

type IHandle = IAnimatedStyleController['handle'];

const ANIMATED_PROPS = 'animatedProps';

function isUpdaterHandle(value: unknown): value is IHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'viewDescriptors' in value &&
    'initial' in value &&
    'styleUpdaterContainer' in value
  );
}

// A flattened view has no native view for the UI side to drive, nor for `measure` to read
function keepNodeUnflattened(node: ISymbioteNode): void {
  routeProp(node, 'collapsable', false);
}

// The UI side drives the node by tag and wrapper from here on; the release takes it off again
function attachHandle(
  node: ISymbioteNode,
  handle: IHandle,
): (() => void) | undefined {
  const tag = getNativeTag(node);
  const shadowNodeWrapper = wrapperOfNode(node);
  if (tag === undefined || shadowNodeWrapper === undefined) return undefined;
  handle.viewDescriptors.add(
    { tag, shadowNodeWrapper },
    handle.styleUpdaterContainer,
  );
  return () => handle.viewDescriptors.remove(tag);
}

// A framework that flattens a style array copies every key of the handle into one record. The
// handle names itself under this key, so the record can be traced back to the one that is bound
const WORN_HANDLE = 'symbioteWornHandle';

export function markFlattenable<Handle extends object>(
  handle: Handle,
): Handle & { [WORN_HANDLE]: Handle } {
  return Object.assign(handle, { [WORN_HANDLE]: handle });
}

function unwrapFlattened(record: object) {
  const worn: unknown = Reflect.get(record, WORN_HANDLE);
  if (!isUpdaterHandle(worn)) return undefined;
  const rest = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== WORN_HANDLE && !(key in worn),
    ),
  );
  return { handle: worn, rest };
}

// An animated style in a `style` slot shows its starting values, then the UI side drives the node
// it is attached to. Returns the release of the claim
export function claimAnimatedStyleHandles(): () => void {
  return registerStyleHandleClaim({
    isHandle: isUpdaterHandle,
    unwrap: unwrapFlattened,
    initialOf: handle => (isUpdaterHandle(handle) ? handle.initial.value : {}),
    prepare: keepNodeUnflattened,
    attach: (node, handle) =>
      isUpdaterHandle(handle) ? attachHandle(node, handle) : undefined,
  });
}

// Upstream takes one handle or any nesting of them in arrays
function handlesIn(value: unknown): IHandle[] {
  if (Array.isArray(value)) return value.flatMap(handlesIn);
  return isUpdaterHandle(value) ? [value] : [];
}

function bindHandle(node: ISymbioteNode, handle: IHandle): () => void {
  keepNodeUnflattened(node);
  for (const [name, initial] of Object.entries(handle.initial.value)) {
    routeProp(node, name, initial);
  }
  return bindToNode(node, () => attachHandle(node, handle));
}

// The `animatedProps` prop never reaches Fabric: its starting values are set as props and the UI
// side drives the node for as long as each handle stands. Returns the release of the claim
export function claimAnimatedPropsHandles(): () => void {
  const held = new WeakMap<ISymbioteNode, Map<IHandle, () => void>>();
  return registerPropClaim((node, key, value) => {
    if (key !== ANIMATED_PROPS) return false;
    const standing = held.get(node) ?? new Map<IHandle, () => void>();
    const next = handlesIn(value);
    for (const [handle, unbind] of standing) {
      if (next.includes(handle)) continue;
      unbind();
      standing.delete(handle);
    }
    for (const handle of next) {
      if (!standing.has(handle)) standing.set(handle, bindHandle(node, handle));
    }
    held.set(node, standing);
    return true;
  });
}
