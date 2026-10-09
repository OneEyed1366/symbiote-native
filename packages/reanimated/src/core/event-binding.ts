import {
  bindToNode,
  getNativeTag,
  registerPropClaim,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';

type IHolder = { workletEventHandler: WorkletEventHandler<object> };
type IRegistration = {
  handler: WorkletEventHandler<object>;
  unbind: () => void;
};

function isHolder(value: unknown): value is IHolder {
  return (
    typeof value === 'object' &&
    value !== null &&
    'workletEventHandler' in value &&
    typeof value.workletEventHandler === 'object' &&
    value.workletEventHandler !== null &&
    'registerForEvents' in value.workletEventHandler
  );
}

// The handler registers against the native tag once the node has committed, the tag being what
// the native event interception is keyed by
function register(
  node: ISymbioteNode,
  key: string,
  handler: WorkletEventHandler<object>,
): IRegistration {
  const unbind = bindToNode(node, () => {
    const tag = getNativeTag(node);
    if (tag === undefined) return undefined;
    handler.registerForEvents(tag, key);
    return () => handler.unregisterFromEvents(tag);
  });
  return { handler, unbind };
}

// Takes the props that hold a worklet event handler out of the payload and keeps each registered
// for as long as the prop and the node stand. Returns the release of the claim
export function claimEventHandlerProps(): () => void {
  const held = new WeakMap<ISymbioteNode, Map<string, IRegistration>>();
  return registerPropClaim((node, key, value) => {
    const registrations = held.get(node);
    const standing = registrations?.get(key);
    if (!isHolder(value)) {
      standing?.unbind();
      registrations?.delete(key);
      return false;
    }
    if (standing?.handler === value.workletEventHandler) return true;
    standing?.unbind();
    const next = held.get(node) ?? new Map<string, IRegistration>();
    next.set(key, register(node, key, value.workletEventHandler));
    held.set(node, next);
    return true;
  });
}
