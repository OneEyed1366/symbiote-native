// The node's SHAPE and nothing that acts on it: the interface every sibling of `node.ts` writes
// through, the Fabric view names, and the two guards

import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';
import type { IHostBehavior, IPayloadFold } from './host-behavior';
import type { IClassNameValue } from './style-registry';

export const BRAND: unique symbol = Symbol('symbiote.node');

// A node carries the Fabric view name directly, so adding a primitive is just a new string from
// the adapter. The one name resolved at commit time is text: `isText` marks a container, and a
// `<Text>` nested inside another commits as a virtual span
export const RAW_TEXT_COMPONENT = 'RCTRawText';
export const TEXT_COMPONENT = 'RCTText';
export const VIRTUAL_TEXT_COMPONENT = 'RCTVirtualText';

// Vue's runtime-core needs anchor nodes (fragments, `v-if`, `v-for`) to track sibling order and
// Fabric has no such concept. A real retained node keeps the ordering correct, and the commit walk
// SKIPS it so no native view is created
export const ANCHOR_COMPONENT = '#anchor';

// The sentinel a primitive resolves to when its ENTIRE subtree must vanish from Fabric on this
// platform (`input-accessory-view` on Android). An anchor hoists its children up, a void node does
// not: the walk stops there, recursively
export const VOID_COMPONENT = '#void';

// The sentinel a SURFACE's own root node carries, so `parentOf` can stop there and a top-level node
// answers `undefined` for its parent. JS-side name only, т.к. what goes over the wire is `RCTView`
export const SURFACE_COMPONENT = '#surface';

export interface ISymbioteEvent {
  type: string;
  // `target` is the node the gesture started on, `currentTarget` the node whose listener is running
  // right now as the event bubbles toward the root
  target: ISymbioteNode;
  currentTarget: ISymbioteNode;
  nativeEvent: Record<string, unknown>;
  stopPropagation: () => void;
}

// Returns `unknown`, not `void`: the responder negotiation reads a boolean back from
// `onStartShouldSetResponder` / `onResponderTerminationRequest`, and the other two dispatch paths
// ignore it
export type IListener = (event: ISymbioteEvent) => unknown;

// One shared handler standing in for a whole set of per-node listener closures. Arming a press
// machine installed seven closures plus the `Map` holding them, 1 226 B of the 2 559 B a mounted
// pressable costs; this is the same seven names against one module-level object

// `names` is what a lookup tests before it calls, so a node carrying a dispatch still answers
// "nothing listens" for every other event
export type IEventDispatch = {
  readonly names: ReadonlySet<string>;
  // `name` is passed rather than read off `event.type`, so the seam holds for a caller that builds
  // its own event (every test driving a behavior by hand does)
  readonly deliver: (
    node: ISymbioteNode,
    name: string,
    event: ISymbioteEvent,
  ) => unknown;
};

// Guard narrowing `unknown` to `ISymbioteEvent`, beside the interface it tests so every adapter
// checking for a Symbiote event shares one instead of writing its own
export function isSymbioteEvent(value: unknown): value is ISymbioteEvent {
  if (typeof value !== 'object' || value === null) return false;
  const nativeEvent = Reflect.get(value, 'nativeEvent');
  return typeof nativeEvent === 'object' && nativeEvent !== null;
}

// `class`/`className` and `style` can be set independently and out of order, and `setProp`
// overwrites with no merge. Both halves are kept per node so `flattenStyle`'s later-wins collapse
// resolves with `style` winning
export interface IClassStyleParts {
  classStyle: unknown;
  explicitStyle: unknown;

  // The hide-without-unmount slot, LAST so it wins over both halves, cleared rather than
  // overwritten so unhiding restores what the author wrote
  hiddenStyle: unknown;

  // The authored class value, kept so the PRESSED variant resolves ON DEMAND. Resolving up front
  // would pay a second cache lookup on every class write to serve a state almost no node enters
  className: IClassNameValue | undefined;
  isPressed: boolean;

  // The pressed variant of the EXPLICIT style, from its own prop or from resolving
  // `style={({pressed}) => …}` at `pressed: true`. A `:active` class rule is the other way to
  // deliver a pressed look, and the engine treats them alike
  activeStyle: unknown;

  // Whether slot 1's variant came from resolving a FUNCTION `style` rather than an authored
  // `activeStyle`. Only the first kind may be cleared when `style` later arrives plain, т.к. the
  // two props may land in either order
  activeStyleFromCallback: boolean;

  // The array `pushClassStyle` last published, kept here т.к. `isAlreadyPublished` runs on every
  // class and style write. `setNativeProps` clears it, which is what keeps the restore path alive
  published: readonly unknown[] | undefined;
}

export interface ISymbioteNode {
  readonly [BRAND]: true;
  // Fabric view name passed to `createNode`. NOT readonly: only `setNodeComponent` may write it,
  // т.к. a primitive whose native view depends on a prop (TextInput's `multiline`) must change
  // view without changing IDENTITY
  component: string;
  // A text container: its descendants render as virtual text spans
  readonly isText: boolean;
  listeners: Map<string, IListener> | undefined;

  // The shared handler this node's behavior armed, consulted only where `listeners` has no slot.
  // A field for the same reason `hostBehavior` is one: every lookup on every ancestor reads it
  dispatch: IEventDispatch | undefined;

  // A node carries an ADDRESS and nothing else: the host holds the props and the structure, and
  // every question about either is a read through `tree-host.ts`

  // Whether this node's host behavior declared `afterCommit`, read on every prop write, so a field
  // rather than a `Set` lookup. Set once at `createElement`
  hasCommitHook: boolean;

  // Whether this node's image-source props are resolved on the way IN (`image-source-write.ts`).
  // Gated on the NODE, т.к. the resolution normalises to Image's ARRAY shape, which a WebView or a
  // third-party video view spelling `source` does not read
  resolvesImageSources: boolean;

  // Flips the `id` / `nativeID` precedence so `nativeID` wins, for the one behavior that declares
  // it (TouchableWithoutFeedback, see `routeIdAlias`)
  nativeIdWinsOverId: boolean;

  // The payload fold this node's host behavior supplied. Keyed on the BEHAVIOR, not
  // `node.component`, т.к. pressable/touchable-opacity/view share the Fabric name `RCTView`
  payloadFold: IPayloadFold | undefined;

  // The behavior attached to this node. A field, not a `WeakMap`: readers run per-node at list
  // scale, and `host-behavior.ts`'s `attachHostBehavior` is the only writer
  hostBehavior: IHostBehavior | undefined;

  // The declarative halves of this node's style, ENGINE-OWNED: an adapter reads and writes style
  // through `routeProp`, never through this field
  styleParts: IClassStyleParts | undefined;

  // Where this node's APP children go when the node owns an internal subtree (ScrollView wrapping
  // a content view). SINGLE HOP by design: a slot needing depth points this at the innermost node
  // rather than making every read a walk
  childHost: ISymbioteNode | undefined;

  // The node standing in THIS node's place in its parent's child list, set when a behavior claims
  // a child in `wrap` mode. An Android ScrollView takes a RefreshControl that way, т.к. it holds
  // exactly one child and a sibling would crash `addViewAt`
  wrapper: ISymbioteNode | undefined;

  // Has this node EVER been named as the parent of a structural op. A READ IS A BATCH BOUNDARY, so
  // without this bit a list with no children drains the buffer on every `childrenOf`
  mayHaveChildren: boolean;

  // Whether the teardown sweep has released this node and not seen it come back. A field, not a
  // `WeakSet`: the sweep touches EVERY node of a removed subtree and every insert reads it
  isTornDown: boolean;

  // This node's index in the CURRENT batch's `handles` table, and the batch that index belongs to.
  // Owned by `mutation-buffer.ts`, see `slotOf` for why the pair lives on the node
  slot: number;
  slotBatch: number;

  // RN's `ReactFabricHostComponent` surface, what a ref hands back. PROTOTYPE methods rather than
  // closures grafted per node, т.к. six closures per node is GC-heavy at scale
  measure(callback: IMeasureOnSuccess): void;
  measureInWindow(callback: IMeasureInWindowOnSuccess): void;
  measureLayout(
    relativeToNativeNode: ISymbioteNode | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void;
  setNativeProps(nativeProps: Record<string, unknown>): void;
  focus(): void;
  blur(): void;
  // On every node for the same reason `focus` and `blur` are: a tag hands the app its engine NODE,
  // so a wrapper's imperative handle must stay reachable from here
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  flashScrollIndicators(): void;
}

// `instanceHandle` round-trips through Fabric unchanged and comes back as the event target, so our
// nodes are branded and the handler can confirm one is ours
export function isSymbioteNode(value: unknown): value is ISymbioteNode {
  return typeof value === 'object' && value !== null && BRAND in value;
}

export function isAnchor(node: ISymbioteNode): boolean {
  return node.component === ANCHOR_COMPONENT;
}
