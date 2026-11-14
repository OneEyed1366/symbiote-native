// A host that builds a tree from a batch reads it through `walkOps`, so every host decodes the
// wire the same way. Each case records ops the way an adapter does and reads back what was visited

import { beforeEach, describe, expect, it } from 'vitest';

import {
  recordAppendChild,
  recordCommit,
  recordCreateAnchor,
  recordCreateElement,
  recordCreateRawText,
  recordCreateVoid,
  recordInsertBefore,
  recordRemoveChild,
  recordSetComponent,
  recordSetOwnedListener,
  recordSetProp,
  recordSetTag,
  recordSetText,
  recordSetUnderlayShown,
  resetMutationBuffer,
  takeBatch,
  type IMutationHandle,
} from './mutation-buffer';
import { walkOps, type IOpVisitor } from './mutation-walk';

const ROOT_TAG = 11;

function newHandle(): IMutationHandle {
  return { slot: 0, slotBatch: 0, createdBatch: 0 };
}

// Names handles in the log, so a case reads `append(root, child)` and not object identity
function recordingVisitor(names: Map<object, string>): {
  visitor: IOpVisitor;
  log: string[];
} {
  const log: string[] = [];
  const nameOf = (handle: object): string => names.get(handle) ?? '?';
  const visitor: IOpVisitor = {
    createElement: (handle, viewName, instanceHandle) =>
      log.push(
        `element(${nameOf(handle)}, ${viewName}, ${String(instanceHandle)})`,
      ),
    createRawText: (handle, text) =>
      log.push(`rawText(${nameOf(handle)}, ${text})`),
    createAnchor: handle => log.push(`anchor(${nameOf(handle)})`),
    createVoid: handle => log.push(`void(${nameOf(handle)})`),
    appendChild: (parent, child) =>
      log.push(`append(${nameOf(parent)}, ${nameOf(child)})`),
    insertBefore: (parent, child, before) =>
      log.push(
        `insert(${nameOf(parent)}, ${nameOf(child)}, ${nameOf(before)})`,
      ),
    removeChild: (parent, child) =>
      log.push(`remove(${nameOf(parent)}, ${nameOf(child)})`),
    setProp: (handle, key, value) =>
      log.push(`prop(${nameOf(handle)}, ${key}, ${JSON.stringify(value)})`),
    deleteProp: (handle, key) =>
      log.push(`deleteProp(${nameOf(handle)}, ${key})`),
    setText: (handle, text) => log.push(`text(${nameOf(handle)}, ${text})`),
    setComponent: (handle, viewName) =>
      log.push(`component(${nameOf(handle)}, ${viewName})`),
    setTag: (handle, tag) => log.push(`tag(${nameOf(handle)}, ${tag})`),
    setOwnedListener: (handle, name, isPresent) =>
      log.push(`listener(${nameOf(handle)}, ${name}, ${String(isPresent)})`),
    setUnderlayShown: (handle, isShown) =>
      log.push(`underlay(${nameOf(handle)}, ${String(isShown)})`),
    commit: (rootTag, surface) =>
      log.push(`commit(${String(rootTag)}, ${nameOf(surface)})`),
  };
  return { visitor, log };
}

describe('walkOps', () => {
  beforeEach(() => {
    resetMutationBuffer();
  });

  it('visits creates, structure and commit in the order they were recorded', () => {
    const root = newHandle();
    const view = newHandle();
    const label = newHandle();
    const names = new Map<object, string>([
      [root, 'root'],
      [view, 'view'],
      [label, 'label'],
    ]);
    recordCreateAnchor(root);
    recordCreateElement(view, 'RCTView', false, 'instance-view');
    recordCreateRawText(label, 'hello');
    recordAppendChild(root, view);
    recordInsertBefore(view, label, label);
    recordRemoveChild(view, label);
    recordCommit(ROOT_TAG, root);

    const { visitor, log } = recordingVisitor(names);
    walkOps(takeBatch(), visitor);

    expect(log).toEqual([
      'anchor(root)',
      'element(view, RCTView, instance-view)',
      'rawText(label, hello)',
      'append(root, view)',
      'insert(view, label, label)',
      'remove(view, label)',
      'commit(11, root)',
    ]);
  });

  it('separates a prop write from a prop delete', () => {
    const node = newHandle();
    const names = new Map<object, string>([[node, 'node']]);
    recordSetProp(node, 'opacity', 0.5);
    recordSetProp(node, 'opacity', undefined);

    const { visitor, log } = recordingVisitor(names);
    walkOps(takeBatch(), visitor);

    expect(log).toEqual([
      'prop(node, opacity, 0.5)',
      'deleteProp(node, opacity)',
    ]);
  });

  it('visits the value ops a node carries after it is created', () => {
    const node = newHandle();
    const names = new Map<object, string>([[node, 'node']]);
    recordSetText(node, 'caption');
    recordSetComponent(node, 'RCTText');
    recordSetTag(node, 'pressable');
    recordSetOwnedListener(node, 'onPress', true);
    recordSetUnderlayShown(node, false);

    const { visitor, log } = recordingVisitor(names);
    walkOps(takeBatch(), visitor);

    expect(log).toEqual([
      'text(node, caption)',
      'component(node, RCTText)',
      'tag(node, pressable)',
      'listener(node, onPress, true)',
      'underlay(node, false)',
    ]);
  });

  it('visits a void node', () => {
    const node = newHandle();
    const names = new Map<object, string>([[node, 'node']]);
    recordCreateVoid(node);

    const { visitor, log } = recordingVisitor(names);
    walkOps(takeBatch(), visitor);

    expect(log).toEqual(['void(node)']);
  });

  it('rejects an opcode it does not know', () => {
    const batch = takeBatch();
    const unknown = { ...batch, ops: Int32Array.of(99, 0, 0, 0, 0, 0) };
    const { visitor } = recordingVisitor(new Map());

    expect(() => walkOps(unknown, visitor)).toThrow('unknown opcode 99');
  });

  it('rejects a slot outside the batch handles', () => {
    const node = newHandle();
    recordSetText(node, 'caption');
    const batch = takeBatch();
    const stripped = { ...batch, handles: [] };
    const { visitor } = recordingVisitor(new Map());

    expect(() => walkOps(stripped, visitor)).toThrow('outside this batch');
  });
});
