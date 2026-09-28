/**
 * A tree host that RECORDS and derives nothing - for the 141 test files that never read a tree.
 *
 * Those files call `installFabric()` only because that is how a test gets a host at all: they
 * assert on state machines, prop resolution, listeners, styles. Attaching them to a second
 * implementation of Fabric's tree rules buys them nothing and costs the project a mirror.
 *
 * **Why this is not one.** It keeps the AUTHORED tree — who was appended to whom, what props were
 * set — because that is what the ops literally say and what an adapter's own seam asks back
 * (Solid's `getParentNode`, Vue's `nextSibling`, Svelte's `firstChild`). It does not decide what
 * COMMITS: no flattening, no stacking contexts, no virtual nodes, no clone protocol, no view-name
 * rewriting. There is no derived answer here to be wrong, which is the whole difference between
 * recording a statement and re-deriving a conclusion.
 *
 * A test that needs the committed tree belongs in `core/engine/cpp/tests/js`, where React Native
 * answers. Asking one of those questions here gets `undefined` rather than a plausible lie.
 */

import {
  NO_VALUE,
  OP_APPEND_CHILD,
  OP_COMMIT,
  OP_CREATE_ANCHOR,
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_INSERT_BEFORE,
  OP_REMOVE_CHILD,
  OP_SET_COMPONENT,
  OP_SET_OWNED_LISTENER,
  OP_SET_TAG,
  OP_SET_UNDERLAY_SHOWN,
  OP_SET_PROP,
  OP_SET_TEXT,
  OP_STRIDE,
  type IMutationBatch,
} from '@symbiote-native/engine/mutation-buffer';
import {
  fabricProps,
  isSymbioteNode,
  propsOf,
  setTreeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type {
  ICommittedRecord,
  IDomRect,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
  IMeasureOnSuccess,
  ITreeCensus,
  ITreeHost,
} from '@symbiote-native/engine';

type IRecorded = {
  handle: ISymbioteNode;
  instanceHandle: unknown;
  viewName: string;
  tagName: string;
  ownedListeners: Record<string, boolean>;
  underlayShown: boolean;
  props: Record<string, unknown>;
  parent: IRecorded | undefined;
  children: IRecorded[];
  // Set once, at the commit that first lands this node, and never cleared by a later removal — the
  // real engine's own `node->committed` (a landed `ShadowNode` pointer) works the same way, which is
  // what lets a behavior's PARTING write during the teardown sweep still reach a node `removeChild`
  // just detached but a commit hasn't finished disposing of yet. Walking the live parent chain here
  // instead answered `undefined` the moment the sweep ran, because `OP_REMOVE_CHILD` had already cut
  // the link a few lines above it in the same `flushOps()`.
  //
  // The NUMERIC rootTag `createSurface(rootTag)` was called with — `OP_COMMIT`'s own slot `a`
  // (`recordCommit(rootTag, surface)`, mutation-buffer.ts), carried straight through rather than
  // invented. This is NOT the same unknown as the native Fabric `tag`: a rootTag is a JS-level
  // surface identifier the app chose, present on the op stream from the start, while a Fabric tag is
  // minted by the native differ this host never talks to. Conflating the two into one `NO_TAG`
  // sentinel was a real past bug — `requestCommitForRoot`'s targeted-commit path reads exactly this
  // field to know which surface to re-commit, and every root reading the SAME sentinel made every
  // targeted commit silently name the wrong surface.
  committedRootTag: number | undefined;
};

export type IRecordingHost = ITreeHost & {
  /** How many commits the engine asked for. The op stream's own count, not a tree's. */
  commits: number;
  /**
   * The imperative calls the engine made, in order.
   *
   * These are the engine's own OUTPUT — it asked the platform to scroll, to focus, to take the
   * responder — so recording them is reading what our code did, not deciding what the renderer
   * would have done with it. The handle is the authored node, which is what a test holds.
   */
  commands: {
    handle: object;
    /** As the ops named it — the authored view name, not a committed one. */
    viewName: string;
    commandName: string;
    args: readonly unknown[];
  }[];
  responderHandovers: {
    handle: object;
    isResponder: boolean;
    blockNativeResponder: boolean;
  }[];
  accessibilityEvents: { handle: object; eventType: string }[];
  /**
   * Hand an event to the handler the engine registered, naming the target yourself.
   *
   * Not a tree read, and not the platform deciding anything: the engine installs this handler
   * through `registerEventHandler` and this plays it back verbatim. What a REAL gesture needs —
   * hit-testing coordinates to a target — is the renderer's answer and is not on offer here; a
   * caller must already know which node it means, which is what an engine-side dispatch test does.
   */
  fireEvent: (
    handle: object,
    topLevelType: string,
    nativeEvent?: Record<string, unknown>,
  ) => void;
  /** The slot call, kept here so one object owns both halves of the round trip. */
  registerEventHandler: (handler: IEventHandler) => void;
  /**
   * The first AUTHORED node matching `predicate` — the handle a test needs when the adapter, not
   * the test, created the node.
   *
   * **The authored tree, and the word carries the whole caveat.** These are the nodes the ops named
   * and the props they carried; nothing here says which of them Fabric kept, what it renamed, or
   * what it flattened away. So this answers "find the node the app wrote" — to read its props, to
   * hand it to `fabricProps`, to fire an event at it — and it does NOT answer any question about
   * shape. That one belongs to `committedTree()` in `core/engine/cpp/tests/js`.
   */
  find: (
    predicate: (node: IAuthoredNode) => boolean,
  ) => IAuthoredNode | undefined;
  /** Every authored node matching `predicate`, in CREATION order — not document order. */
  findAll: (predicate: (node: IAuthoredNode) => boolean) => IAuthoredNode[];
  /**
   * Clear the recordings. The authored tree survives, as it does under `installFabric`.
   *
   * What it also clears, and it is load-bearing: the list `find` searches. A file that mounts a
   * fresh tree per case reuses its `testID`s, so a `find` spanning cases answers with the FIRST
   * match — an earlier case's node, carrying an earlier case's props. Caught by a converted test
   * whose second case read the first case's payload and reported a missing prop.
   */
  reset: () => void;
  forget: () => void;
};

type IEventHandler = (
  handle: object,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

/**
 * A node as the OPS described it. Not a committed node and not pretending to be one — there is no
 * tag, because this host never spoke to Fabric and any number here would be an invention.
 */
export type IAuthoredNode = {
  /** The engine node itself, so it can be handed straight back to the engine's own API. */
  handle: ISymbioteNode;
  /**
   * The object the engine gave Fabric to hand back with an event — undefined for a raw text or an
   * anchor, which are created with none.
   *
   * It is what `fireEvent` has to be aimed at: the engine's event handler resolves a target by
   * this object, not by the node, so passing the node would silently deliver to nothing.
   */
  instanceHandle: unknown;
  /** As the ops named it. Fabric may commit it under a different name; that is not known here. */
  viewName: string;
  /**
   * The intrinsic tag, for a node a host behavior attached to; empty for every other node.
   *
   * Recorded so a test can ASK what a node is — the real host resolves a tag's platform props off
   * it and a plain `RCTView` cannot be told from a `<pressable>` any other way. It changes nothing
   * about the payload this host builds; see the `OP_SET_TAG` case.
   */
  tagName: string;
  /**
   * Which event names a BEHAVIOR owns currently have an app callback wired, by name.
   *
   * The presence only — the callback never crosses and is not here. It is what lets a platform rule
   * resolve a key that depends on whether the app wired anything (`focusable` on a touchable is
   * `focusable !== false && onPress !== undefined && !disabled`). Recorded for the same reason
   * `tagName` is: so a test can ask what the host was TOLD, separately from what a rule made of it.
   */
  ownedListeners: Record<string, boolean>;
  /** Whether a behavior's feedback is showing — see `OP_SET_UNDERLAY_SHOWN`. */
  underlayShown: boolean;
  props: Readonly<Record<string, unknown>>;
};

/**
 * Install the recording host, with the minimum slot the engine insists on.
 *
 * `createSurface` calls `installEventHandler`, which reaches `globalThis.nativeFabricUIManager` and
 * throws if it is absent — so a host alone is not enough to get a surface open. The slot below
 * exists to be PRESENT: every method answers nothing except `registerEventHandler`, which hands the
 * engine's handler to the host so `fireEvent` can play it back.
 *
 * What that does NOT buy is a real gesture. Deciding which node a touch lands on is hit-testing,
 * and that is the renderer's answer; a test that needs it belongs in `core/engine/cpp/tests/js`.
 */
export function installRecordingFabric(): IRecordingHost {
  const host = createRecordingHost();
  Object.assign(globalThis, {
    nativeFabricUIManager: {
      registerEventHandler(handler: IEventHandler): void {
        host.registerEventHandler(handler);
      },
      dispatchCommand(): void {},
      setIsJSResponder(): void {},
      sendAccessibilityEvent(): void {},
      measure(): void {},
      measureInWindow(): void {},
      measureLayout(): void {},
    },
  });
  setTreeHost(host);
  return host;
}

/**
 * The Fabric payload for a node — what the engine WOULD hand the renderer for it, built by the
 * engine's own builder rather than read off anything.
 *
 * This exists because the two are easy to confuse and the difference bites: a node's PROPS are the
 * author's bag (`style` is still an object), while the PAYLOAD is what `fabricProps` makes of it —
 * style flattened into top-level keys, the aria fold run, the ten RN processors applied. A test
 * asking about `padding` or `accessibilityRole` or a parsed `backgroundSize` means the payload, and
 * reading the bag instead comes back `undefined` with nothing to explain why.
 */
export function payloadOf(node: ISymbioteNode): Record<string, unknown> {
  return fabricProps(node, propsOf(node));
}

/**
 * Where a tag would be. Not a Fabric tag and not pretending to be one — this host never speaks to
 * Fabric, so any number here would be an invention.
 */
const NO_TAG = -1;

// One mutable record instead of several reassignable `let`s: `forget()` replaces the map by
// replacing this object's field, so every closure below keeps working off the same reference.
type IRecordingState = {
  recorded: WeakMap<object, IRecorded>;
  // The WeakMap above cannot be enumerated, and `find` has to start somewhere. Strong references,
  // so `forget()` is what a long file calls to stop this growing — the same deal `installFabric`'s
  // `created` array made.
  created: IRecorded[];
  eventHandler: IEventHandler | undefined;
};

function nodeOf(
  state: IRecordingState,
  handle: object,
  what: string,
): IRecorded {
  const node = state.recorded.get(handle);
  if (node === undefined) {
    throw new Error(`${what}: handle names no node in this tree`);
  }
  return node;
}

function detachNode(node: IRecorded): void {
  const { parent } = node;
  if (parent === undefined) return;
  const at = parent.children.indexOf(node);
  if (at >= 0) parent.children.splice(at, 1);
  node.parent = undefined;
}

// Lands a rootTag onto a whole subtree at OP_COMMIT, the same moment the real engine hands every
// node in the walk its own `ShadowNode`. `committedRootTag` never gets cleared afterwards, so a
// node removed after this still answers `committedRecordOf` — see that field's own comment.
function markCommitted(node: IRecorded, rootTag: number): void {
  node.committedRootTag = rootTag;
  for (const child of node.children) markCommitted(child, rootTag);
}

// One helper per opcode instead of a growing switch, kept apart so applyOps stays a short loop:
// each handler closes over nothing but its own arguments, so adding an opcode never touches the
// ones around it.
type IApplyContext = {
  strings: readonly string[];
  values: readonly unknown[];
  instanceHandles: readonly unknown[];
  at: (slot: number) => IRecorded;
  create: (
    slot: number,
    viewName: string,
    props: Record<string, unknown>,
    instanceHandle?: unknown,
  ) => void;
};
// [a, b, c] together, not three positional params: several handlers below need all three, and a
// fixed-length tuple keeps every handler at arity 3 instead of growing with the widest opcode.
type IOpFields = readonly [a: number, b: number, c: number];
type IOpHandler = (
  ctx: IApplyContext,
  host: IRecordingHost,
  fields: IOpFields,
) => void;

const OP_HANDLERS: Record<number, IOpHandler> = {
  [OP_CREATE_RAW_TEXT]: (ctx, _host, [a, b]) =>
    ctx.create(a, 'RCTRawText', { text: ctx.strings[b] }),
  [OP_CREATE_ANCHOR]: (ctx, _host, [a]) => ctx.create(a, '', {}),
  [OP_APPEND_CHILD]: (ctx, _host, [a, b]) => {
    const child = ctx.at(b);
    detachNode(child);
    child.parent = ctx.at(a);
    ctx.at(a).children.push(child);
  },
  [OP_INSERT_BEFORE]: (ctx, _host, [a, b, c]) => {
    const parent = ctx.at(a);
    const child = ctx.at(b);
    const before = ctx.at(c);
    detachNode(child);
    child.parent = parent;
    const index = parent.children.indexOf(before);
    parent.children.splice(
      index < 0 ? parent.children.length : index,
      0,
      child,
    );
  },
  [OP_REMOVE_CHILD]: (ctx, _host, [, b]) => detachNode(ctx.at(b)),
  [OP_SET_PROP]: (ctx, _host, [a, b, c]) => {
    const node = ctx.at(a);
    if (c === NO_VALUE) delete node.props[ctx.strings[b]];
    else node.props[ctx.strings[b]] = ctx.values[c];
  },
  [OP_SET_TEXT]: (ctx, _host, [a, b]) => {
    ctx.at(a).props.text = ctx.strings[b];
  },
  [OP_SET_COMPONENT]: (ctx, _host, [a, b]) => {
    ctx.at(a).viewName = ctx.strings[b];
  },
  // RECORDED, NOT APPLIED: the real host resolves platform props off the tag, and the
  // TypeScript `fabricProps` this host uses must not grow a second copy of that rule.
  [OP_SET_TAG]: (ctx, _host, [a, b]) => {
    ctx.at(a).tagName = ctx.strings[b];
  },
  // Same treatment, same reason - `focusable`'s three-leg touchable form and TouchableHighlight's
  // underlay are both resolved off these bits by the real host, never re-derived here.
  [OP_SET_OWNED_LISTENER]: (ctx, _host, [a, b, c]) => {
    ctx.at(a).ownedListeners[ctx.strings[b]] = c !== 0;
  },
  [OP_SET_UNDERLAY_SHOWN]: (ctx, _host, [a, b]) => {
    ctx.at(a).underlayShown = b !== 0;
  },
  [OP_COMMIT]: (ctx, host, [a, b]) => {
    host.commits += 1;
    markCommitted(ctx.at(b), a);
  },
};

function buildApplyContext(
  state: IRecordingState,
  batch: IMutationBatch,
): IApplyContext {
  const { strings, values, handles, instanceHandles } = batch;
  const handleAt = (slot: number): object => {
    const handle = handles[slot];
    if (handle === undefined) {
      throw new Error(`applyOps: slot ${slot} is outside this batch's handles`);
    }
    return handle;
  };
  const at = (slot: number): IRecorded =>
    nodeOf(state, handleAt(slot), 'applyOps');
  const create = (
    slot: number,
    viewName: string,
    props: Record<string, unknown>,
    instanceHandle?: unknown,
  ): void => {
    const handle = handleAt(slot);
    // Checked rather than assumed: the batch types handles as `object`, and the whole value of
    // holding the node is being able to hand it back to the engine's own API.
    if (!isSymbioteNode(handle)) {
      throw new Error('applyOps: a handle in this batch is not an engine node');
    }
    const node: IRecorded = {
      handle,
      instanceHandle,
      viewName,
      tagName: '',
      ownedListeners: {},
      underlayShown: false,
      props,
      parent: undefined,
      children: [],
      committedRootTag: undefined,
    };
    state.recorded.set(handle, node);
    state.created.push(node);
  };
  return { strings, values, instanceHandles, at, create };
}

function runApplyOps(
  state: IRecordingState,
  host: IRecordingHost,
  batch: IMutationBatch,
): void {
  const { ops, strings, instanceHandles } = batch;
  const ctx = buildApplyContext(state, batch);

  for (let cursor = 0; cursor + OP_STRIDE <= ops.length; cursor += OP_STRIDE) {
    const code = ops[cursor];
    const a = ops[cursor + 1];
    const b = ops[cursor + 2];
    if (code === OP_CREATE_ELEMENT) {
      // Slot 4 (`instanceHandles[d]`) is the object Fabric would hand back with an event -
      // the only opcode reading a fifth field, so it stays out of IOpHandler's signature.
      ctx.create(a, strings[b], {}, instanceHandles[ops[cursor + 4]]);
      continue;
    }
    const handler = OP_HANDLERS[code];
    if (handler === undefined) {
      throw new Error(`applyOps: unknown opcode ${String(code)}`);
    }
    handler(ctx, host, [a, b, ops[cursor + 3]]);
  }
}

type ITreeReadMethods = Pick<
  IRecordingHost,
  | 'propOf'
  | 'propsOf'
  | 'markPropsDirty'
  | 'committedRecordOf'
  | 'committedPayloadOf'
  | 'parentOf'
  | 'childrenOf'
  | 'firstChildOf'
  | 'nextSiblingOf'
  | 'parentsOf'
  | 'subtreesOf'
  | 'teardownSubtreesOf'
  | 'ancestorsOf'
  | 'census'
>;

// Answers straight off the op stream - there WAS a commit - with no claim about what Fabric did
// with the node. `tag` is `NO_TAG`, not invented, so a caller cannot mistake it for a real one.
function readCommittedRecord(
  state: IRecordingState,
  handle: object,
): ICommittedRecord | undefined {
  const node = state.recorded.get(handle);
  if (node === undefined || node.committedRootTag === undefined)
    return undefined;
  return { handle, tag: NO_TAG, rootTag: node.committedRootTag };
}

// Refused, loudly: building a real Fabric payload is SymbioteFabricProps.cpp's job, which does
// not run in vitest. A test that needs one belongs in core/engine/cpp/tests/js.
function readCommittedPayload(): Readonly<Record<string, unknown>> | undefined {
  throw new Error(
    'recording host: committedPayloadOf needs the real payload builder — move this to an itest',
  );
}

function walkSubtree(node: IRecorded, out: object[]): void {
  out.push(node.handle);
  for (const child of node.children) walkSubtree(child, out);
}

function readSubtrees(
  state: IRecordingState,
  roots: readonly object[],
): object[] {
  const out: object[] = [];
  for (const root of roots) walkSubtree(nodeOf(state, root, 'subtreesOf'), out);
  return out;
}

// The narrowed twin of readSubtrees: a root, or any descendant carrying an intrinsic tag,
// survives; an untagged node with no tagged descendant does not, matching what the vitest suite
// asserts about the real teardown sweep.
function walkTeardownSubtree(
  node: IRecorded,
  isRoot: boolean,
  out: object[],
): boolean {
  const reserved = out.length;
  out.push(node.handle);
  let isWanted = isRoot || node.tagName !== '';
  for (const child of node.children) {
    if (walkTeardownSubtree(child, false, out)) isWanted = true;
  }
  if (!isWanted) out.length = reserved;
  return isWanted;
}

function readTeardownSubtrees(
  state: IRecordingState,
  roots: readonly object[],
): object[] {
  const out: object[] = [];
  for (const root of roots) {
    walkTeardownSubtree(nodeOf(state, root, 'teardownSubtreesOf'), true, out);
  }
  return out;
}

function readAncestors(state: IRecordingState, handle: object): object[] {
  const chain: object[] = [];
  for (
    let node: IRecorded | undefined = nodeOf(state, handle, 'ancestorsOf');
    node !== undefined;
    node = node.parent
  ) {
    chain.push(node.handle);
  }
  return chain;
}

function readCensus(
  state: IRecordingState,
  roots: readonly object[],
): ITreeCensus {
  let nodes = 0;
  const walk = (node: IRecorded): void => {
    nodes += 1;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(nodeOf(state, root, 'census'));
  // The skip counts belong to the commit rules, which this host does not have. Zero is honest:
  // nothing here was skipped, because nothing here was decided.
  return {
    nodes,
    anchors: 0,
    emptyRawTexts: 0,
    renderable: nodes,
    flattenWidths: [],
  };
}

function createTreeReadMethods(state: IRecordingState): ITreeReadMethods {
  return {
    propOf: (handle, key) => nodeOf(state, handle, 'propOf').props[key],
    propsOf: handle => nodeOf(state, handle, 'propsOf').props,
    // Nothing is memoized here, so there is nothing to invalidate.
    markPropsDirty: () => {},
    committedRecordOf: handle => readCommittedRecord(state, handle),
    committedPayloadOf: readCommittedPayload,
    parentOf: handle => nodeOf(state, handle, 'parentOf').parent?.handle,
    childrenOf: handle =>
      nodeOf(state, handle, 'childrenOf').children.map(child => child.handle),
    firstChildOf: handle =>
      nodeOf(state, handle, 'firstChildOf').children[0]?.handle,
    nextSiblingOf: handle => {
      const node = nodeOf(state, handle, 'nextSiblingOf');
      const siblings = node.parent?.children;
      return siblings?.[siblings.indexOf(node) + 1]?.handle;
    },
    parentsOf: handles =>
      handles.map(handle => nodeOf(state, handle, 'parentsOf').parent?.handle),
    subtreesOf: roots => readSubtrees(state, roots),
    teardownSubtreesOf: roots => readTeardownSubtrees(state, roots),
    ancestorsOf: handle => readAncestors(state, handle),
    census: roots => readCensus(state, roots),
  };
}

type IImperativeMethods = Pick<
  IRecordingHost,
  | 'dispatchCommand'
  | 'sendAccessibilityEvent'
  | 'measure'
  | 'measureInWindow'
  | 'getBoundingClientRect'
  | 'measureLayout'
  | 'setIsJSResponder'
>;

// The imperative six ask the PLATFORM; three carry a request the engine MADE and are recorded,
// the measuring three want a platform answer this host has none of. `getHost`, not `host`, since
// this factory runs while `createRecordingHost`'s own `host` binding is still being assigned.
function createImperativeMethods(
  state: IRecordingState,
  getHost: () => IRecordingHost,
): IImperativeMethods {
  return {
    dispatchCommand(
      handle: object,
      commandName: string,
      args: readonly unknown[],
    ): void {
      getHost().commands.push({
        handle,
        viewName: nodeOf(state, handle, 'dispatchCommand').viewName,
        commandName,
        args,
      });
    },
    sendAccessibilityEvent(handle: object, eventType: string): void {
      getHost().accessibilityEvents.push({ handle, eventType });
    },
    measure(_handle: object, _callback: IMeasureOnSuccess): void {},
    measureInWindow(
      _handle: object,
      _callback: IMeasureInWindowOnSuccess,
    ): void {},
    // Same "answers nothing real" precedent as measure/measureInWindow above: a headless run has
    // no Yoga layout to report, so every node reads the same zero rect rather than a fake number
    // that would look like layout without ever having run one.
    getBoundingClientRect(): IDomRect {
      return { x: 0, y: 0, width: 0, height: 0 };
    },
    measureLayout(
      _handle: object,
      _relativeTo: object,
      onFail: () => void,
      _onSuccess: IMeasureLayoutOnSuccess,
    ): void {
      onFail();
    },
    setIsJSResponder(
      handle: object,
      isResponder: boolean,
      blockNativeResponder: boolean,
    ): void {
      getHost().responderHandovers.push({
        handle,
        isResponder,
        blockNativeResponder,
      });
    },
  };
}

type ILifecycleMethods = Pick<
  IRecordingHost,
  'registerEventHandler' | 'find' | 'findAll' | 'fireEvent' | 'reset' | 'forget'
>;

// `getHost`, not `host` - same reason as createImperativeMethods above.
function createLifecycleMethods(
  state: IRecordingState,
  getHost: () => IRecordingHost,
): ILifecycleMethods {
  return {
    registerEventHandler(handler: IEventHandler): void {
      state.eventHandler = handler;
    },
    find(
      predicate: (node: IAuthoredNode) => boolean,
    ): IAuthoredNode | undefined {
      return state.created.find(predicate);
    },
    findAll(predicate: (node: IAuthoredNode) => boolean): IAuthoredNode[] {
      return state.created.filter(predicate);
    },
    fireEvent(
      handle: object,
      topLevelType: string,
      nativeEvent: Record<string, unknown> = {},
    ): void {
      if (state.eventHandler === undefined) {
        throw new Error('no event handler registered by the renderer');
      }
      state.eventHandler(handle, topLevelType, nativeEvent);
    },
    reset(): void {
      const host = getHost();
      state.created = [];
      host.commits = 0;
      host.commands.length = 0;
      host.responderHandovers.length = 0;
      host.accessibilityEvents.length = 0;
    },
    forget(): void {
      state.recorded = new WeakMap();
      state.created = [];
      getHost().reset();
    },
  };
}

export function createRecordingHost(): IRecordingHost {
  const state: IRecordingState = {
    recorded: new WeakMap(),
    created: [],
    eventHandler: undefined,
  };

  const host: IRecordingHost = {
    commits: 0,
    commands: [],
    responderHandovers: [],
    accessibilityEvents: [],
    applyOps(batch: IMutationBatch): void {
      runApplyOps(state, host, batch);
    },
    ...createTreeReadMethods(state),
    ...createImperativeMethods(state, () => host),
    ...createLifecycleMethods(state, () => host),
  };

  return host;
}
