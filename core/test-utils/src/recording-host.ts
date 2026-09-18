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

export function createRecordingHost(): IRecordingHost {
  let recorded = new WeakMap<object, IRecorded>();
  let committedSurfaces = new WeakSet<IRecorded>();
  // The NUMERIC rootTag `createSurface(rootTag)` was called with — `OP_COMMIT`'s own slot `a`
  // (`recordCommit(rootTag, surface)`, mutation-buffer.ts), carried straight through rather than
  // invented. This is NOT the same unknown as the native Fabric `tag`: a rootTag is a JS-level
  // surface identifier the app chose, present on the op stream from the start, while a Fabric tag
  // is minted by the native differ this host never talks to. Conflating the two into one `NO_TAG`
  // sentinel was the actual bug — `requestCommitForRoot`'s targeted-commit path reads exactly this
  // field to know which surface to re-commit, and every root reading the SAME sentinel made every
  // targeted commit silently name the wrong surface.
  let committedSurfaceRootTags = new WeakMap<IRecorded, number>();
  let eventHandler: IEventHandler | undefined;
  // The WeakMap above cannot be enumerated, and `find` has to start somewhere. Strong references,
  // so `forget()` is what a long file calls to stop this growing — the same deal `installFabric`'s
  // `created` array made.
  let created: IRecorded[] = [];

  const nodeOf = (handle: object, what: string): IRecorded => {
    const node = recorded.get(handle);
    if (node === undefined) {
      throw new Error(`${what}: handle names no node in this tree`);
    }
    return node;
  };

  const detach = (node: IRecorded): void => {
    const { parent } = node;
    if (parent === undefined) return;
    const at = parent.children.indexOf(node);
    if (at >= 0) parent.children.splice(at, 1);
    node.parent = undefined;
  };

  const host: IRecordingHost = {
    commits: 0,
    commands: [],
    responderHandovers: [],
    accessibilityEvents: [],

    applyOps(batch: IMutationBatch): void {
      const { ops, strings, values, handles, instanceHandles } = batch;

      const handleAt = (slot: number): object => {
        const handle = handles[slot];
        if (handle === undefined) {
          throw new Error(
            `applyOps: slot ${slot} is outside this batch's handles`,
          );
        }
        return handle;
      };
      const at = (slot: number): IRecorded =>
        nodeOf(handleAt(slot), 'applyOps');
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
          throw new Error(
            'applyOps: a handle in this batch is not an engine node',
          );
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
        };
        recorded.set(handle, node);
        created.push(node);
      };

      for (
        let cursor = 0;
        cursor + OP_STRIDE <= ops.length;
        cursor += OP_STRIDE
      ) {
        const code = ops[cursor];
        const a = ops[cursor + 1];
        const b = ops[cursor + 2];
        const c = ops[cursor + 3];
        const d = ops[cursor + 4];
        switch (code) {
          case OP_CREATE_ELEMENT:
            // Slot 4 is the index into `instanceHandles` — the object Fabric would hand back with
            // an event. Recorded because it is what the op SAYS, and because a test firing an
            // event has to name the same object the engine registered.
            create(a, strings[b], {}, instanceHandles[d]);
            break;
          case OP_CREATE_RAW_TEXT:
            create(a, 'RCTRawText', { text: strings[b] });
            break;
          case OP_CREATE_ANCHOR:
            create(a, '', {});
            break;
          case OP_APPEND_CHILD: {
            const child = at(b);
            detach(child);
            child.parent = at(a);
            at(a).children.push(child);
            break;
          }
          case OP_INSERT_BEFORE: {
            const parent = at(a);
            const child = at(b);
            const before = at(c);
            detach(child);
            child.parent = parent;
            const index = parent.children.indexOf(before);
            parent.children.splice(
              index < 0 ? parent.children.length : index,
              0,
              child,
            );
            break;
          }
          case OP_REMOVE_CHILD:
            detach(at(b));
            break;
          case OP_SET_PROP: {
            const node = at(a);
            if (c === NO_VALUE) delete node.props[strings[b]];
            else node.props[strings[b]] = values[c];
            break;
          }
          case OP_SET_TEXT:
            at(a).props.text = strings[b];
            break;
          case OP_SET_COMPONENT:
            at(a).viewName = strings[b];
            break;
          // RECORDED AND NOT ACTED ON, deliberately. The real host resolves a tag's platform props
          // off this (`foldPressableProps`); this host builds its payload through the TypeScript
          // `fabricProps`, which carries no copy of those rules and must not grow one — a second
          // implementation is how a test goes green over a rule that no longer runs. A test that
          // needs to read what a tag actually sends belongs in `core/engine/cpp/tests/js`.
          case OP_SET_TAG:
            at(a).tagName = strings[b];
            break;
          // RECORDED, NOT APPLIED, exactly like the tag above. The real host resolves `focusable`'s
          // three-leg touchable form off this bit; this host builds its payload through the
          // TypeScript `fabricProps`, which carries no copy of the tag rules and must not grow one.
          // So a test that wants the resolved key reads the committed payload in an itest, and what
          // this records is the fact a test can ASK about.
          case OP_SET_OWNED_LISTENER:
            at(a).ownedListeners[strings[b]] = c !== 0;
            break;
          // Same treatment, and for the same reason: the real host paints TouchableHighlight's
          // underlay from this bit (`foldTouchableHighlightUnderlay`), and this one must not grow a
          // copy of that rule. Recorded so a test can ask whether the MACHINE flipped it — which is
          // the half that is still JS — while what the flip LOOKS like is asserted on a committed
          // payload in `core/engine/cpp/tests/js/touchable-highlight-underlay.itest.ts`.
          case OP_SET_UNDERLAY_SHOWN:
            at(a).underlayShown = b !== 0;
            break;
          case OP_COMMIT: {
            host.commits += 1;
            const surfaceNode = at(b);
            committedSurfaces.add(surfaceNode);
            committedSurfaceRootTags.set(surfaceNode, a);
            break;
          }
          default:
            throw new Error(`applyOps: unknown opcode ${String(code)}`);
        }
      }
    },

    propOf(handle: object, key: string): unknown {
      return nodeOf(handle, 'propOf').props[key];
    },
    propsOf(handle: object): Readonly<Record<string, unknown>> {
      return nodeOf(handle, 'propsOf').props;
    },
    // Nothing is memoized here, so there is nothing to invalidate.
    markPropsDirty(): void {},
    /**
     * A record for a node standing under a surface the ops COMMITTED, and nothing more.
     *
     * The engine gates every imperative call on this, so answering `undefined` always would make
     * `dispatchCommand` unreachable and quietly turn four command tests green-by-absence. What is
     * answered here is read straight off the op stream — there WAS a commit, and this node is under
     * that surface — with no claim about what the renderer did with it: no tag Fabric minted, no
     * view that survived flattening, no guarantee it is mounted. A test that needs any of those
     * belongs in `core/engine/cpp/tests/js`.
     *
     * `handle` is the authored node and `tag` is `NO_TAG`, so a test reading either gets something
     * obviously not-from-Fabric rather than a plausible number. `rootTag` is real, not invented —
     * see `committedSurfaceRootTags`'s own comment for why the JS-level surface identifier is a
     * different unknown from the native Fabric tag.
     */
    committedRecordOf(handle: object): ICommittedRecord | undefined {
      let node: IRecorded | undefined = recorded.get(handle);
      if (node === undefined) return undefined;
      while (node.parent !== undefined) node = node.parent;
      if (!committedSurfaces.has(node)) return undefined;
      return {
        handle,
        tag: NO_TAG,
        rootTag: committedSurfaceRootTags.get(node) ?? NO_TAG,
      };
    },
    /**
     * REFUSED, loudly, and that is the whole point of implementing it here.
     *
     * This host records the OPS it was handed; it never builds a Fabric payload, because building
     * one is `SymbioteFabricProps.cpp`'s job and that code does not exist in a vitest process. An
     * answer synthesised from the JS twin would be a test asserting against the wrong
     * implementation — the exact drift `ITreeHost.committedPayloadOf` was added to close.
     *
     * So a test asking this question belongs in `core/engine/cpp/tests/js/` (`pnpm run test:itest`),
     * where the real builder runs. `.props` on this host stays the read for "what did the adapter
     * SAY", which is a different and still-useful question.
     */
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
      host.commands.push({
        handle,
        viewName: nodeOf(handle, 'dispatchCommand').viewName,
        commandName,
        args,
      });
    },
    sendAccessibilityEvent(handle: object, eventType: string): void {
      host.accessibilityEvents.push({ handle, eventType });
    },
    measure(_handle: object, _callback: IMeasureOnSuccess): void {},
    measureInWindow(
      _handle: object,
      _callback: IMeasureInWindowOnSuccess,
    ): void {},
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
      host.responderHandovers.push({
        handle,
        isResponder,
        blockNativeResponder,
      });
    },

    registerEventHandler(handler: IEventHandler): void {
      eventHandler = handler;
    },

    find(
      predicate: (node: IAuthoredNode) => boolean,
    ): IAuthoredNode | undefined {
      return created.find(predicate);
    },

    findAll(predicate: (node: IAuthoredNode) => boolean): IAuthoredNode[] {
      return created.filter(predicate);
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

    reset(): void {
      created = [];
      host.commits = 0;
      host.commands.length = 0;
      host.responderHandovers.length = 0;
      host.accessibilityEvents.length = 0;
    },

    forget(): void {
      recorded = new WeakMap();
      committedSurfaces = new WeakSet();
      committedSurfaceRootTags = new WeakMap();
      created = [];
      host.reset();
    },
  };

  return host;
}
