/**
 * A tree host that RECORDS and derives nothing — for the 141 test files that never read a tree.
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
  fabricProps,
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
import { createRecordedTree, type IRecordedTree } from './recorded-tree';

export type IRecorded = {
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
  /**
   * What `measureLayout` answers, by the two handles
   * No Yoga runs headless, so a test that needs a rect names it here, no answer means it fails
   */
  answerMeasureLayout: (
    answer:
      | ((handle: object, relativeTo: object) => IDomRect | undefined)
      | undefined,
  ) => void;
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

export function createRecordingHost(): IRecordingHost {
  const tree: IRecordedTree = createRecordedTree();
  const { nodeOf } = tree;
  let eventHandler: IEventHandler | undefined;
  let measureLayoutAnswer: Parameters<IRecordingHost['answerMeasureLayout']>[0];
  const commands: IRecordingHost['commands'] = [];
  const responderHandovers: IRecordingHost['responderHandovers'] = [];
  const accessibilityEvents: IRecordingHost['accessibilityEvents'] = [];

  const clearRecords = (): void => {
    tree.reset();
    commands.length = 0;
    responderHandovers.length = 0;
    accessibilityEvents.length = 0;
    measureLayoutAnswer = undefined;
  };

  return {
    get commits(): number {
      return tree.commits;
    },
    commands,
    responderHandovers,
    accessibilityEvents,
    applyOps: tree.applyOps,
    propOf(handle: object, key: string): unknown {
      return nodeOf(handle, 'propOf').props[key];
    },
    propsOf(handle: object): Readonly<Record<string, unknown>> {
      return nodeOf(handle, 'propsOf').props;
    },
    // Nothing is memoized here, so there is nothing to invalidate.
    markPropsDirty(): void {},
    // That the ops COMMITTED this node, and nothing more. Read off `committedRootTag` and not a
    // live walk, т.к. `removeChild` cuts the parent link before the teardown sweep runs in the
    // SAME commit
    committedRecordOf(handle: object): ICommittedRecord | undefined {
      const node = tree.recordedOf(handle);
      if (node === undefined || node.committedRootTag === undefined) {
        return undefined;
      }
      return {
        handle,
        tag: NO_TAG,
        rootTag: node.committedRootTag,
      };
    },
    // REFUSED loudly, т.к. the payload is `SymbioteFabricProps.cpp`'s and that code does not run
    // in vitest. A test asking this belongs in `core/engine/cpp/tests/js`, where the real builder
    // does run
    committedPayloadOf(): Readonly<Record<string, unknown>> | undefined {
      throw new Error(
        'recording host: committedPayloadOf needs the real payload builder — move this to an itest',
      );
    },
    parentOf(handle: object): object | undefined {
      return nodeOf(handle, 'parentOf').parent?.handle;
    },
    childrenOf(handle: object): readonly object[] {
      return nodeOf(handle, 'childrenOf').children.map(child => child.handle);
    },
    firstChildOf(handle: object): object | undefined {
      return nodeOf(handle, 'firstChildOf').children[0]?.handle;
    },
    nextSiblingOf(handle: object): object | undefined {
      const node = nodeOf(handle, 'nextSiblingOf');
      const siblings = node.parent?.children;
      if (siblings === undefined) return undefined;
      return siblings[siblings.indexOf(node) + 1]?.handle;
    },
    parentsOf(handles: readonly object[]): readonly (object | undefined)[] {
      return handles.map(handle => nodeOf(handle, 'parentsOf').parent?.handle);
    },
    subtreesOf(roots: readonly object[]): readonly object[] {
      const out: object[] = [];
      const walk = (node: IRecorded): void => {
        out.push(node.handle);
        for (const child of node.children) walk(child);
      };
      for (const root of roots) walk(nodeOf(root, 'subtreesOf'));
      return out;
    },
    // The twin of the engine's narrowed walk, and it MUST narrow here too: the vitest suite is
    // where the sweep is asserted, so handing back everything would pass those cases whatever the
    // engine does
    teardownSubtreesOf(roots: readonly object[]): readonly object[] {
      const out: object[] = [];
      const walk = (node: IRecorded, isRoot: boolean): boolean => {
        const reserved = out.length;
        out.push(node.handle);
        let isWanted = isRoot || node.tagName !== '';
        for (const child of node.children) {
          if (walk(child, false)) isWanted = true;
        }
        if (!isWanted) out.length = reserved;
        return isWanted;
      };
      for (const root of roots) walk(nodeOf(root, 'teardownSubtreesOf'), true);
      return out;
    },
    ancestorsOf(handle: object): readonly object[] {
      const chain: object[] = [];
      for (
        let node: IRecorded | undefined = nodeOf(handle, 'ancestorsOf');
        node !== undefined;
        node = node.parent
      ) {
        chain.push(node.handle);
      }
      return chain;
    },
    census(roots: readonly object[]): ITreeCensus {
      let nodes = 0;
      const walk = (node: IRecorded): void => {
        nodes += 1;
        for (const child of node.children) walk(child);
      };
      for (const root of roots) walk(nodeOf(root, 'census'));
      // The skip counts belong to the commit rules, which this host does not have. Zero is the
      // honest answer: nothing here was skipped, because nothing here was decided.
      return {
        nodes,
        anchors: 0,
        emptyRawTexts: 0,
        renderable: nodes,
        flattenWidths: [],
      };
    },

    // The imperative six ask the PLATFORM — a frame, a gesture, an announcement. Three of them
    // carry a request the engine MADE, so they are recorded; the measuring three want an answer
    // only a platform has, and there is none here.
    dispatchCommand(
      handle: object,
      commandName: string,
      args: readonly unknown[],
    ): void {
      commands.push({
        handle,
        viewName: nodeOf(handle, 'dispatchCommand').viewName,
        commandName,
        args,
      });
    },
    sendAccessibilityEvent(handle: object, eventType: string): void {
      accessibilityEvents.push({ handle, eventType });
    },
    measure(_handle: object, _callback: IMeasureOnSuccess): void {},
    measureInWindow(
      _handle: object,
      _callback: IMeasureInWindowOnSuccess,
    ): void {},
    // No Yoga layout runs headless, so every node reads one zero rect instead of a fake number
    getBoundingClientRect(): IDomRect {
      return { x: 0, y: 0, width: 0, height: 0 };
    },
    measureLayout(
      handle: object,
      relativeTo: object,
      onFail: () => void,
      onSuccess: IMeasureLayoutOnSuccess,
    ): void {
      const rect = measureLayoutAnswer?.(handle, relativeTo);
      if (rect === undefined) onFail();
      else onSuccess(rect.x, rect.y, rect.width, rect.height);
    },
    answerMeasureLayout(answer): void {
      measureLayoutAnswer = answer;
    },
    setIsJSResponder(
      handle: object,
      isResponder: boolean,
      blockNativeResponder: boolean,
    ): void {
      responderHandovers.push({ handle, isResponder, blockNativeResponder });
    },

    registerEventHandler(handler: IEventHandler): void {
      eventHandler = handler;
    },

    find(
      predicate: (node: IAuthoredNode) => boolean,
    ): IAuthoredNode | undefined {
      return tree.authored.find(predicate);
    },

    findAll(predicate: (node: IAuthoredNode) => boolean): IAuthoredNode[] {
      return tree.authored.filter(predicate);
    },

    fireEvent(
      handle: object,
      topLevelType: string,
      nativeEvent: Record<string, unknown> = {},
    ): void {
      if (eventHandler === undefined) {
        throw new Error('no event handler registered by the renderer');
      }
      eventHandler(handle, topLevelType, nativeEvent);
    },

    reset: clearRecords,

    forget(): void {
      tree.forget();
      clearRecords();
    },
  };
}
