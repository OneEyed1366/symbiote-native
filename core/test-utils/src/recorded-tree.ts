// The authored tree an op batch describes, and the walk that builds it. Apart from
// `recording-host` so that file holds the `ITreeHost` surface and this one the mechanism

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
import { isSymbioteNode } from '@symbiote-native/engine';
import type { IRecorded } from './recording-host';

/** The five words one op occupies, named, so an applier takes two parameters instead of six. */
type IOpWords = {
  code: number;
  a: number;
  b: number;
  c: number;
  d: number;
};

type IApplyContext = {
  batch: IMutationBatch;
  at: (slot: number) => IRecorded;
  create: (
    slot: number,
    viewName: string,
    props: Record<string, unknown>,
    instanceHandle?: unknown,
  ) => void;
  onCommit: (rootTag: number, node: IRecorded) => void;
};

export type IRecordedTree = {
  /** How many commits the ops asked for. */
  commits: number;
  /** Every node the ops created, in creation order, which is what `find` searches. */
  readonly authored: IRecorded[];
  applyOps: (batch: IMutationBatch) => void;
  recordedOf: (handle: object) => IRecorded | undefined;
  nodeOf: (handle: object, what: string) => IRecorded;
  reset: () => void;
  forget: () => void;
};

function detach(node: IRecorded): void {
  const { parent } = node;
  if (parent === undefined) return;
  const at = parent.children.indexOf(node);
  if (at >= 0) parent.children.splice(at, 1);
  node.parent = undefined;
}

// Lands a `rootTag` onto a whole subtree, the moment the real engine hands every node in the walk
// its own `ShadowNode`. Never cleared afterwards, see `IRecorded.committedRootTag`
function markCommitted(node: IRecorded, rootTag: number): void {
  node.committedRootTag = rootTag;
  for (const child of node.children) markCommitted(child, rootTag);
}

function applyStructureOp(ctx: IApplyContext, op: IOpWords): boolean {
  const { strings, instanceHandles } = ctx.batch;
  switch (op.code) {
    case OP_CREATE_ELEMENT:
      // Slot 4 indexes `instanceHandles`, the object Fabric would hand back with an event, which is
      // what a test firing one has to name
      ctx.create(op.a, strings[op.b], {}, instanceHandles[op.d]);
      return true;
    case OP_CREATE_RAW_TEXT:
      ctx.create(op.a, 'RCTRawText', { text: strings[op.b] });
      return true;
    case OP_CREATE_ANCHOR:
      ctx.create(op.a, '', {});
      return true;
    case OP_APPEND_CHILD: {
      const parent = ctx.at(op.a);
      const child = ctx.at(op.b);
      detach(child);
      child.parent = parent;
      parent.children.push(child);
      return true;
    }
    case OP_INSERT_BEFORE: {
      const parent = ctx.at(op.a);
      const child = ctx.at(op.b);
      const before = ctx.at(op.c);
      detach(child);
      child.parent = parent;
      const index = parent.children.indexOf(before);
      const landing = index < 0 ? parent.children.length : index;
      parent.children.splice(landing, 0, child);
      return true;
    }
    case OP_REMOVE_CHILD:
      detach(ctx.at(op.b));
      return true;
    default:
      return false;
  }
}

// `OP_SET_TAG`, `OP_SET_OWNED_LISTENER` and `OP_SET_UNDERLAY_SHOWN` are RECORDED and not acted on,
// т.к. what each one means is resolved in `SymbioteFabricProps.cpp`, and this host must not grow a
// second copy of those rules. A test that needs the resolved key reads a committed payload instead
function applyValueOp(ctx: IApplyContext, op: IOpWords): boolean {
  const { strings, values } = ctx.batch;
  switch (op.code) {
    case OP_SET_PROP: {
      const node = ctx.at(op.a);
      if (op.c === NO_VALUE) delete node.props[strings[op.b]];
      else node.props[strings[op.b]] = values[op.c];
      return true;
    }
    case OP_SET_TEXT:
      ctx.at(op.a).props.text = strings[op.b];
      return true;
    case OP_SET_COMPONENT:
      ctx.at(op.a).viewName = strings[op.b];
      return true;
    case OP_SET_TAG:
      ctx.at(op.a).tagName = strings[op.b];
      return true;
    case OP_SET_OWNED_LISTENER:
      ctx.at(op.a).ownedListeners[strings[op.b]] = op.c !== 0;
      return true;
    case OP_SET_UNDERLAY_SHOWN:
      ctx.at(op.a).underlayShown = op.b !== 0;
      return true;
    case OP_COMMIT:
      ctx.onCommit(op.a, ctx.at(op.b));
      return true;
    default:
      return false;
  }
}

function walkBatch(ctx: IApplyContext): void {
  const { ops } = ctx.batch;
  for (let cursor = 0; cursor + OP_STRIDE <= ops.length; cursor += OP_STRIDE) {
    const op: IOpWords = {
      code: ops[cursor],
      a: ops[cursor + 1],
      b: ops[cursor + 2],
      c: ops[cursor + 3],
      d: ops[cursor + 4],
    };
    if (applyStructureOp(ctx, op)) continue;
    if (applyValueOp(ctx, op)) continue;
    throw new Error(`applyOps: unknown opcode ${String(op.code)}`);
  }
}

function handleAt(batch: IMutationBatch, slot: number): object {
  const handle = batch.handles[slot];
  if (handle === undefined) {
    throw new Error(`applyOps: slot ${slot} is outside this batch's handles`);
  }
  return handle;
}

function newRecord(
  handle: object,
  viewName: string,
  props: Record<string, unknown>,
  instanceHandle: unknown,
): IRecorded {
  // Checked rather than assumed: the batch types handles as `object`, and the whole value of
  // holding the node is being able to hand it back to the engine's own API
  if (!isSymbioteNode(handle)) {
    throw new Error('applyOps: a handle in this batch is not an engine node');
  }
  return {
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
}

export function createRecordedTree(): IRecordedTree {
  let recorded = new WeakMap<object, IRecorded>();
  // A `WeakMap` cannot be enumerated and `find` has to start somewhere. Strong references, so
  // `forget()` is what a long file calls to stop this growing
  const authored: IRecorded[] = [];

  const nodeOf = (handle: object, what: string): IRecorded => {
    const node = recorded.get(handle);
    if (node === undefined) {
      throw new Error(`${what}: handle names no node in this tree`);
    }
    return node;
  };

  const tree: IRecordedTree = {
    commits: 0,
    authored,
    recordedOf: handle => recorded.get(handle),
    nodeOf,
    applyOps(batch: IMutationBatch): void {
      walkBatch({
        batch,
        at: slot => nodeOf(handleAt(batch, slot), 'applyOps'),
        create: (slot, viewName, props, instanceHandle) => {
          const node = newRecord(
            handleAt(batch, slot),
            viewName,
            props,
            instanceHandle,
          );
          recorded.set(node.handle, node);
          authored.push(node);
        },
        onCommit: (rootTag, node) => {
          tree.commits += 1;
          markCommitted(node, rootTag);
        },
      });
    },
    reset(): void {
      authored.length = 0;
      tree.commits = 0;
    },
    forget(): void {
      recorded = new WeakMap();
      tree.reset();
    },
  };
  return tree;
}
