/**
 * A tree host that RECORDS and derives nothing, for test files that never read a tree
 * It keeps the AUTHORED tree (who was appended to whom, which props were set), not what COMMITS
 * A test that needs the committed tree belongs in `core/engine/cpp/tests/js`
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
  // Set at the commit that first lands this node, never cleared by a later removal
  // So a parting write in the teardown sweep still reaches a node `removeChild` detached

  // The numeric root tag `createSurface` was called with, not the native Fabric `tag`
  // `requestCommitForRoot` reads it to pick the surface, one shared sentinel named the wrong one
  committedRootTag: number | undefined;
};

export type IRecordingHost = ITreeHost & {
  /** How many commits the engine asked for, the op stream's own count */
  commits: number;
  /** The imperative calls the engine made, in order, on the authored node a test holds */
  commands: {
    handle: object;
    /** As the ops named it, not a committed name */
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
  /** Hands an event to the registered handler, naming the target yourself, no hit-testing */
  fireEvent: (
    handle: object,
    topLevelType: string,
    nativeEvent?: Record<string, unknown>,
  ) => void;
  /** The slot call, kept here so one object owns both halves of the round trip */
  registerEventHandler: (handler: IEventHandler) => void;
  /** The first authored node matching `predicate`, for a node the adapter created */
  find: (
    predicate: (node: IAuthoredNode) => boolean,
  ) => IAuthoredNode | undefined;
  /** Every authored node matching `predicate`, in creation order, not document order */
  findAll: (predicate: (node: IAuthoredNode) => boolean) => IAuthoredNode[];
  /**
   * Clears the recordings and the list `find` searches, the authored tree survives
   * A file reusing its `testID`s per case would otherwise find an earlier case's node
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

/** A node as the ops described it, with no tag because this host never spoke to Fabric */
export type IAuthoredNode = {
  /** The engine node itself, to hand back to the engine's own API */
  handle: ISymbioteNode;
  /** The object `fireEvent` must be aimed at, undefined for a raw text or an anchor */
  instanceHandle: unknown;
  /** As the ops named it, Fabric may commit it under a different name */
  viewName: string;
  /** The intrinsic tag of a node a host behavior attached to, empty for every other node */
  tagName: string;
  /** Which event names a behavior owns have an app callback wired, presence only */
  ownedListeners: Record<string, boolean>;
  /** Whether a behavior's feedback is showing, see `OP_SET_UNDERLAY_SHOWN` */
  underlayShown: boolean;
  props: Readonly<Record<string, unknown>>;
};

/**
 * Installs the recording host with the minimum slot the engine insists on
 * `createSurface` throws without `nativeFabricUIManager`, so the slot only has to be present
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
      configureNextLayoutAnimation(): void {},
      measure(): void {},
      measureInWindow(): void {},
      measureLayout(): void {},
    },
  });
  setTreeHost(host);
  return host;
}

/**
 * The Fabric payload for a node, built by the engine's own builder
 * Props are the author's bag (`style` is an object), the payload is what `fabricProps` makes of it
 */
export function payloadOf(node: ISymbioteNode): Record<string, unknown> {
  return fabricProps(node, propsOf(node));
}

// Where a tag would be, this host never speaks to Fabric so any number would be an invention
const NO_TAG = -1;

export function createRecordingHost(): IRecordingHost {
  const tree: IRecordedTree = createRecordedTree();
  const { nodeOf } = tree;
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

  let eventHandler: IEventHandler | undefined;

  return {
    registerEventHandler(handler: IEventHandler): void {
      eventHandler = handler;
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
    // Nothing is memoized here, so there is nothing to invalidate
    markPropsDirty(): void {},
    // Read off `committedRootTag`, т.к. `removeChild` cuts the parent link before the sweep
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
    // Refused loudly, т.к. the payload builder is C++ and does not run here
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
    // Narrows like the engine's walk, else the sweep cases would pass whatever the engine does
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
      // The skip counts belong to commit rules this host lacks, so zero is the honest answer
      return {
        nodes,
        anchors: 0,
        emptyRawTexts: 0,
        renderable: nodes,
        flattenWidths: [],
      };
    },

    // Three imperative calls carry a request the engine made and are recorded
    // The measuring three want an answer only a platform has, and there is none here
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

    find(
      predicate: (node: IAuthoredNode) => boolean,
    ): IAuthoredNode | undefined {
      return tree.authored.find(predicate);
    },

    findAll(predicate: (node: IAuthoredNode) => boolean): IAuthoredNode[] {
      return tree.authored.filter(predicate);
    },

    reset: clearRecords,

    forget(): void {
      tree.forget();
      clearRecords();
    },
  };
}
