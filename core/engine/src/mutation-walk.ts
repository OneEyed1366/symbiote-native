// Decodes a mutation batch for the hosts that build a tree from it, so a headless host and the DOM
// host read the wire one way and cannot drift apart. Opcode layout is in `mutation-buffer.ts`

import {
  NO_VALUE,
  OP_APPEND_CHILD,
  OP_COMMIT,
  OP_CREATE_ANCHOR,
  OP_CREATE_ELEMENT,
  OP_CREATE_RAW_TEXT,
  OP_CREATE_VOID,
  OP_INSERT_BEFORE,
  OP_REMOVE_CHILD,
  OP_SET_COMPONENT,
  OP_SET_OWNED_LISTENER,
  OP_SET_PROP,
  OP_SET_TAG,
  OP_SET_TEXT,
  OP_SET_UNDERLAY_SHOWN,
  OP_STRIDE,
  type IMutationBatch,
} from './mutation-buffer';

// What a host implements, one method per opcode
export type IOpVisitor = {
  createElement: (
    handle: object,
    viewName: string,
    instanceHandle: unknown,
  ) => void;
  createRawText: (handle: object, text: string) => void;
  createAnchor: (handle: object) => void;
  createVoid: (handle: object) => void;
  appendChild: (parent: object, child: object) => void;
  insertBefore: (parent: object, child: object, before: object) => void;
  removeChild: (parent: object, child: object) => void;
  setProp: (handle: object, key: string, value: unknown) => void;
  deleteProp: (handle: object, key: string) => void;
  setText: (handle: object, text: string) => void;
  setComponent: (handle: object, viewName: string) => void;
  setTag: (handle: object, tag: string) => void;
  setOwnedListener: (handle: object, name: string, isPresent: boolean) => void;
  setUnderlayShown: (handle: object, isShown: boolean) => void;
  commit: (rootTag: number, surface: object) => void;
};

function handleAt(batch: IMutationBatch, slot: number): object {
  const handle = batch.handles[slot];
  if (handle === undefined) {
    throw new Error(`walkOps: slot ${slot} is outside this batch's handles`);
  }
  return handle;
}

// Creates and structure, false for an opcode that is neither
function walkStructureOp(
  batch: IMutationBatch,
  visitor: IOpVisitor,
  at: number,
): boolean {
  const { ops: words, strings: names } = batch;
  const [a, b, c, d] = [
    words[at + 1],
    words[at + 2],
    words[at + 3],
    words[at + 4],
  ];
  switch (words[at]) {
    case OP_CREATE_ELEMENT:
      visitor.createElement(
        handleAt(batch, a),
        names[b],
        batch.instanceHandles[d],
      );
      return true;
    case OP_CREATE_RAW_TEXT:
      visitor.createRawText(handleAt(batch, a), names[b]);
      return true;
    case OP_CREATE_ANCHOR:
      visitor.createAnchor(handleAt(batch, a));
      return true;
    case OP_CREATE_VOID:
      visitor.createVoid(handleAt(batch, a));
      return true;
    case OP_APPEND_CHILD:
      visitor.appendChild(handleAt(batch, a), handleAt(batch, b));
      return true;
    case OP_INSERT_BEFORE:
      visitor.insertBefore(
        handleAt(batch, a),
        handleAt(batch, b),
        handleAt(batch, c),
      );
      return true;
    case OP_REMOVE_CHILD:
      visitor.removeChild(handleAt(batch, a), handleAt(batch, b));
      return true;
    default:
      return false;
  }
}

// Writes on an existing node and the commit, false for an opcode that is neither
function walkValueOp(
  batch: IMutationBatch,
  visitor: IOpVisitor,
  at: number,
): boolean {
  const { ops: words, strings: names, values: payloads } = batch;
  const [a, b, c] = [words[at + 1], words[at + 2], words[at + 3]];
  switch (words[at]) {
    case OP_SET_PROP:
      if (c === NO_VALUE) visitor.deleteProp(handleAt(batch, a), names[b]);
      else visitor.setProp(handleAt(batch, a), names[b], payloads[c]);
      return true;
    case OP_SET_TEXT:
      visitor.setText(handleAt(batch, a), names[b]);
      return true;
    case OP_SET_COMPONENT:
      visitor.setComponent(handleAt(batch, a), names[b]);
      return true;
    case OP_SET_TAG:
      visitor.setTag(handleAt(batch, a), names[b]);
      return true;
    case OP_SET_OWNED_LISTENER:
      visitor.setOwnedListener(handleAt(batch, a), names[b], c !== 0);
      return true;
    case OP_SET_UNDERLAY_SHOWN:
      visitor.setUnderlayShown(handleAt(batch, a), b !== 0);
      return true;
    case OP_COMMIT:
      visitor.commit(a, handleAt(batch, b));
      return true;
    default:
      return false;
  }
}

/** Call the visitor once per op, in the order they were recorded. */
export function walkOps(batch: IMutationBatch, visitor: IOpVisitor): void {
  const { ops: words } = batch;
  for (let at = 0; at + OP_STRIDE <= words.length; at += OP_STRIDE) {
    if (walkStructureOp(batch, visitor, at)) continue;
    if (walkValueOp(batch, visitor, at)) continue;
    throw new Error(`walkOps: unknown opcode ${String(words[at])}`);
  }
}
