// `react-reconciler` host config in mutation mode: each host operation maps onto the engine's
// mutation API, and the engine owns tag allocation, view names, clone-on-write and events

import createReconciler from 'react-reconciler';
import { createContext } from 'react';
import {
  appendChild,
  createElement,
  createRawText,
  hostBehaviorFor,
  insertBefore,
  removeChild,
  routeProp,
  setNodeComponent,
  setNodeHidden,
  setText,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from './reconciler-constants';
import { toPublicInstance, type IHostInstance } from './host-instance';
// Intrinsic JSX type to Fabric component name: the table and resolver live once in
// `@symbiote-native/components`, Metro-split by filename, so no adapter's names drift
// Adding a primitive is one entry per name table there plus its thin component in `components.ts`
import { descriptorFor } from '@symbiote-native/components';
// A bare intrinsic tag has no wrapper to apply RN's per-primitive prop folds, so this layer does
// The native view a primitive commits can depend on a runtime prop (TextInput's `multiline`)
// Identity for every primitive that declares no alternative
import { resolveIntrinsicTag } from '@symbiote-native/components/resolve-intrinsic';

type IProps = Record<string, unknown>;

type IHostContext = {
  isInsideText: boolean;
};

// React-reserved keys never reach Fabric, and `children` goes through `appendChild`
// `ref` and `key` are plain props in React 19 that the reconciler leaves in
// So `ref.current` would serialize into folly::dynamic and throw "not convertible" on Android
function isReservedProp(key: string): boolean {
  return key === 'children' || key === 'ref' || key === 'key';
}

/**
 * `Object.keys`, not `Object.entries`, which allocates a pair array per key on every created node
 * Priced in `object-iteration-cost.itest.ts`, and `for...in` is out: it walks the prototype
 * chain, so an inherited key would be routed as a prop
 */
function applyProps(node: ISymbioteNode, props: IProps): void {
  for (const key of Object.keys(props)) {
    if (isReservedProp(key)) continue;
    routeProp(node, key, props[key]);
  }
}

function applyUpdate(
  node: ISymbioteNode,
  oldProps: IProps,
  newProps: IProps,
): void {
  for (const key of Object.keys(oldProps)) {
    if (isReservedProp(key)) continue;
    if (!Object.hasOwn(newProps, key)) routeProp(node, key, undefined);
  }
  // Same `Object.keys` reason as `applyProps`, and this walk runs once per updated node
  for (const key of Object.keys(newProps)) {
    if (isReservedProp(key)) continue;
    const value = newProps[key];
    if (value !== oldProps[key]) routeProp(node, key, value);
  }
}

// The reconciler's Container slot: the primary root (`SymbioteSurface`) or a portal target, an
// already-mounted `ISymbioteNode` of the same surface (`createPortal(children, node)`)
// Mirrors the Vue renderer's `IHostElement` union
type IContainer = SymbioteSurface | ISymbioteNode;

function isSurfaceContainer(
  container: IContainer,
): container is SymbioteSurface {
  return container instanceof SymbioteSurface;
}

type IContainerOps = Pick<
  SymbioteSurface,
  'appendChild' | 'insertBefore' | 'removeChild'
>;

// A surface is its own ops, a portal target gets the engine functions bound to it
function containerOps(container: IContainer): IContainerOps {
  if (isSurfaceContainer(container)) return container;
  return {
    appendChild: child => appendChild(container, child),
    insertBefore: (child, before) => insertBefore(container, child, before),
    removeChild: child => removeChild(container, child),
  };
}

let currentUpdatePriority = NoEventPriority;

// Runs the callback at discrete priority, as native events and component-owned timers enter React
// outside its render loop, and callers pair it with `flushExternalUpdate` to paint synchronously
export function withDiscretePriority(run: () => void): void {
  const previous = currentUpdatePriority;
  currentUpdatePriority = DiscreteEventPriority;
  try {
    run();
  } finally {
    currentUpdatePriority = previous;
  }
}

const reconciler = createReconciler<
  string, // Type
  IProps, // IProps
  IContainer, // Container
  ISymbioteNode, // Instance
  ISymbioteNode, // TextInstance
  never, // SuspenseInstance
  unknown, // HydratableInstance
  unknown, // FormInstance
  IHostInstance, // PublicInstance
  IHostContext, // IHostContext
  unknown, // ChildSet
  number, // TimeoutHandle
  number, // NoTimeout
  unknown // TransitionStatus
>({
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  getRootHostContext: () => ({ isInsideText: false }),
  getChildHostContext(parentHostContext, type) {
    const isInsideText =
      descriptorFor(type).isText ||
      hostBehaviorFor(type)?.acceptsTextChildren === true;
    return parentHostContext.isInsideText === isInsideText
      ? parentHostContext
      : { isInsideText };
  },
  getPublicInstance: instance => toPublicInstance(instance),

  prepareForCommit: () => null,
  // Called once per commit with the primary root's own container only, never a portal target
  // (portal mutations recommit within the same surface's tree walk, see `create-portal`)
  resetAfterCommit: container => {
    if (isSurfaceContainer(container)) container.commit();
  },
  preparePortalMount: () => {},
  clearContainer: container => {
    if (isSurfaceContainer(container)) container.clear();
  },

  shouldSetTextContent: () => false,

  createInstance(type, props, _container, hostContext) {
    // The intrinsic tag is needed twice: for the Fabric view name and for the engine below
    // Host behaviors are keyed by tag, not Fabric name, as `pressable` and a plain `View` both
    // resolve to `RCTView` (`core/engine/src/host-behavior.ts`)
    const tag = resolveIntrinsicTag(type, props);
    const descriptor = descriptorFor(tag);
    if (hostContext.isInsideText && !descriptor.isText) {
      throw new Error(`<${type}> can't be nested inside <text>`);
    }
    // The third argument makes a host behavior reachable on this adapter, as `createElement`
    // otherwise defaults the tag to `component` and the lookup runs against `RCTView`
    // Nothing throws or logs when it is dropped, and the other four adapters all pass it
    const node = createElement(descriptor.component, descriptor.isText, tag);
    applyProps(node, props);
    return node;
  },
  createTextInstance(text, _container, hostContext) {
    if (!hostContext.isInsideText) {
      throw new Error(`Text string "${text}" must be rendered inside a <text>`);
    }
    return createRawText(text);
  },

  appendInitialChild: (parent, child) => appendChild(parent, child),
  appendChild: (parent, child) => appendChild(parent, child),
  appendChildToContainer: (container, child) =>
    containerOps(container).appendChild(child),
  insertBefore: (parent, child, before) => insertBefore(parent, child, before),
  insertInContainerBefore: (container, child, before) =>
    containerOps(container).insertBefore(child, before),
  removeChild: (parent, child) => removeChild(parent, child),
  removeChildFromContainer: (container, child) =>
    containerOps(container).removeChild(child),

  finalizeInitialChildren: () => false,
  commitUpdate(node, type, oldProps, newProps) {
    // A prop can change a primitive's native view (TextInput's `multiline`) on update
    // The node keeps its identity so a ref stays live, the commit walk re-creates the Fabric node
    setNodeComponent(
      node,
      descriptorFor(resolveIntrinsicTag(type, newProps)).component,
    );
    applyUpdate(node, oldProps, newProps);
  },
  commitTextUpdate(node, _oldText, newText) {
    setText(node, newText);
  },

  resetTextContent: () => {},
  hideTextInstance: node => setText(node, ''),
  unhideTextInstance: (node, text) => setText(node, text),
  // `Activity mode="hidden"` and a re-suspending `Suspense` both reach the tree through these
  // The engine owns the reversible half (`setNodeHidden`), the author's own style stays untouched
  hideInstance: node => setNodeHidden(node, true),
  unhideInstance: node => setNodeHidden(node, false),

  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,

  setCurrentUpdatePriority: priority => {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () =>
    currentUpdatePriority === NoEventPriority
      ? DefaultEventPriority
      : currentUpdatePriority,

  maySuspendCommit: () => false,
  NotPendingTransition: null,
  // A `react` Context is the runtime value `react-reconciler` wants as `ReactContext`, but the two
  // libraries' type defs model `Consumer` and `Provider` differently
  // @ts-expect-error cross-library Context type-def mismatch (runtime-correct)
  HostTransitionContext: createContext<unknown>(null),
  resetFormInstance: () => {},
  requestPostPaintCallback: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
});

// Native-event and timer callbacks update React from outside the reconciler, so the update goes on
// the discrete lane and commits synchronously, or a delayed `Pressable` transition stays stale
export function flushExternalUpdate(run: () => void): void {
  withDiscretePriority(run);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();
}

export default reconciler;
