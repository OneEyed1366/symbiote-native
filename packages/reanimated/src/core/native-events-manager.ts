import { getNativeTag, isSymbioteNode } from '@symbiote-native/engine';
import type { WorkletEventHandler } from 'react-native-reanimated/src/WorkletEventHandler';
import { isHolder } from './event-binding';

const NO_TAG = -1;

type IProps = Record<string, unknown>;
type IForEachHandler = (
  key: string,
  handler: WorkletEventHandler<object>,
) => void;

// The shape upstream's manager reads off an animated component. The view an event comes from
// can sit inside it, so the ref may name a scrollable node or carry the tag it was given
export type IManagedComponent = {
  props: IProps;
  _componentRef?: {
    getScrollableNode?: () => unknown;
    __nativeTag?: number;
  };
  getComponentViewTag: () => number;
};

// A tag stays a tag, a node of ours answers with its native tag, anything else has none
function tagOf(target: unknown): number {
  if (typeof target === 'number') return target;
  return isSymbioteNode(target) ? (getNativeTag(target) ?? NO_TAG) : NO_TAG;
}

function forEachHandler(props: IProps, visit: IForEachHandler): void {
  for (const [key, prop] of Object.entries(props)) {
    if (isHolder(prop)) visit(key, prop.workletEventHandler);
  }
}

// Upstream's class, with the lookup of the tag being the only change: there is no `findNodeHandle`
// to ask, so a node answers with the tag the engine gave it
export class NativeEventsManager {
  readonly #component: IManagedComponent;
  #eventViewTag: number;

  constructor(component: IManagedComponent) {
    this.#component = component;
    this.#eventViewTag = this.#viewTag();
  }

  attachEvents(): void {
    forEachHandler(this.#component.props, (key, handler) => {
      handler.registerForEvents(this.#eventViewTag, key);
    });
  }

  detachEvents(): void {
    forEachHandler(this.#component.props, (_key, handler) => {
      handler.unregisterFromEvents(this.#eventViewTag);
    });
  }

  updateEvents(prevProps: IProps): void {
    const computedTag = this.#viewTag();
    // Every binding was made on the old tag, so all of them are made again on the new one
    if (this.#eventViewTag !== computedTag) {
      forEachHandler(prevProps, (_key, handler) => {
        handler.unregisterFromEvents(this.#eventViewTag);
      });
      this.#eventViewTag = computedTag;
      this.attachEvents();
      return;
    }
    this.#swapChanged(prevProps);
    forEachHandler(this.#component.props, (key, handler) => {
      if (!prevProps[key]) handler.registerForEvents(this.#eventViewTag, key);
    });
  }

  #swapChanged(prevProps: IProps): void {
    forEachHandler(prevProps, (key, prevHandler) => {
      const next = this.#component.props[key];
      if (!next) {
        prevHandler.unregisterFromEvents(this.#eventViewTag);
        return;
      }
      if (isHolder(next) && next.workletEventHandler !== prevHandler) {
        prevHandler.unregisterFromEvents(this.#eventViewTag);
        next.workletEventHandler.registerForEvents(this.#eventViewTag, key);
      }
    });
  }

  // Upstream tells the first render from an update, because its ref is unset until it has mounted.
  // Here a ref that names no tag falls back to the component's own, which covers both
  #viewTag(): number {
    const ref = this.#component._componentRef;
    if (ref?.getScrollableNode) return tagOf(ref.getScrollableNode());
    const fromRef = ref?.__nativeTag ?? tagOf(ref);
    return fromRef === NO_TAG ? this.#component.getComponentViewTag() : fromRef;
  }
}
