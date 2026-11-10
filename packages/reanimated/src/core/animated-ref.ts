import {
  bindToNode,
  getNativeTag,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  createSerializable,
  createShareable,
  serializableMappingCache,
  UIRuntimeId,
} from 'react-native-worklets';
import type { ShadowNodeWrapper } from 'react-native-reanimated/src/commonTypes';
import type {
  AnimatedRefObserver,
  MaybeObserverCleanup,
} from 'react-native-reanimated/src/hook/commonTypes';
import { wrapperOfNode } from './shadow-node-wrapper';

type ISharedWrapper = ReturnType<
  typeof createShareable<ShadowNodeWrapper | null>
>;

export type IAnimatedRef = {
  // Typed as upstream types it, which promises a wrapper; it is null until the view has committed.
  // Any value goes in, as upstream's type depends on the component, and only a node is attached
  (instance?: unknown): ShadowNodeWrapper;
  current: ISymbioteNode | null;
  getTag: () => number | null;
  observe: (observer: AnimatedRefObserver) => () => void;
  // What a worklet that captured the ref reads on the UI side
  sharedWrapper: ISharedWrapper;
};

// A ref on a host tag gets the node, a ref on a component gets what the component exposes, and a
// component that wraps a node exposes it as `hostNode`
function hostNodeOf(instance: unknown): ISymbioteNode | null {
  if (isSymbioteNode(instance)) return instance;
  if (typeof instance !== 'object' || instance === null) return null;
  const exposed: unknown = Reflect.get(instance, 'hostNode');
  return isSymbioteNode(exposed) ? exposed : null;
}

function tagOf(node: ISymbioteNode | null): number | null {
  return node === null ? null : (getNativeTag(node) ?? null);
}

// The JS thread is a guest of the shareable, which is the only side that has `setAsync`
function createWrapperChannel() {
  const shared = createShareable<ShadowNodeWrapper | null>(UIRuntimeId, null);
  let wrapper: ShadowNodeWrapper | null = null;
  return {
    shared,
    read: () => wrapper,
    write(next: ShadowNodeWrapper | null): void {
      wrapper = next;
      shared.setAsync?.(next);
    },
  };
}

// Cleanup runs before an observer is told again, so what it set up for the old tag is gone first
function createObservers(currentTag: () => number | null) {
  const cleanups = new Map<AnimatedRefObserver, MaybeObserverCleanup>();
  return {
    observe(observer: AnimatedRefObserver): () => void {
      cleanups.set(observer, observer(currentTag()));
      return () => {
        cleanups.get(observer)?.();
        cleanups.delete(observer);
      };
    },
    notify(): void {
      cleanups.forEach((cleanup, observer) => {
        cleanup?.();
        cleanups.set(observer, observer(currentTag()));
      });
    },
  };
}

export function createAnimatedRef(): IAnimatedRef {
  const channel = createWrapperChannel();
  const slot: { current: ISymbioteNode | null } = { current: null };
  const tagOfRef = () => tagOf(ref.current);
  const observers = createObservers(tagOfRef);

  function readWrapper(instance?: unknown): ShadowNodeWrapper;
  function readWrapper(instance?: unknown): ShadowNodeWrapper | null {
    const host = hostNodeOf(instance);
    if (host !== null) attach(host);
    return channel.read();
  }

  const ref = Object.assign(readWrapper, slot, {
    getTag: tagOfRef,
    observe: observers.observe,
    sharedWrapper: channel.shared,
  });

  let unbind: (() => void) | undefined;
  function attach(node: ISymbioteNode): void {
    unbind?.();
    ref.current = node;
    unbind = bindToNode(node, () => {
      channel.write(wrapperOfNode(node) ?? null);
      observers.notify();
      return () => channel.write(null);
    });
  }

  serializableMappingCache.set(ref, createSerializable(channel.shared));
  return ref;
}
