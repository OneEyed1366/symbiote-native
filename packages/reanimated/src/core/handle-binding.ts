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

// An animated style in a `style` slot shows its starting values, then the UI side drives the node
// it is attached to. Returns the release of the claim
export function claimAnimatedStyleHandles(): () => void {
  return registerStyleHandleClaim({
    isHandle: isUpdaterHandle,
    initialOf: handle => (isUpdaterHandle(handle) ? handle.initial.value : {}),
    prepare: keepNodeUnflattened,
    attach: (node, handle) =>
      isUpdaterHandle(handle) ? attachHandle(node, handle) : undefined,
  });
}

type IHeld = { handle: IHandle; unbind: () => void };

// The `animatedProps` prop never reaches Fabric: its starting values are set as props and the UI
// side drives the node for as long as the handle stands. Returns the release of the claim
export function claimAnimatedPropsHandles(): () => void {
  const held = new WeakMap<ISymbioteNode, IHeld>();
  return registerPropClaim((node, key, value) => {
    if (key !== ANIMATED_PROPS) return false;
    const standing = held.get(node);
    if (standing?.handle === value) return true;
    standing?.unbind();
    held.delete(node);
    if (!isUpdaterHandle(value)) return true;
    keepNodeUnflattened(node);
    for (const [name, initial] of Object.entries(value.initial.value)) {
      routeProp(node, name, initial);
    }
    held.set(node, {
      handle: value,
      unbind: bindToNode(node, () => attachHandle(node, value)),
    });
    return true;
  });
}
