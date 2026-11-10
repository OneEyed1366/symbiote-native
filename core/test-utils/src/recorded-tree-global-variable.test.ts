// The recording host keeps the process-wide `:root` table the way native does

import { beforeEach, describe, expect, it } from 'vitest';
import {
  recordRemoveGlobalVariable,
  recordSetGlobalVariable,
  resetMutationBuffer,
  takeBatch,
} from '@symbiote-native/engine/mutation-buffer';
import { createRecordedTree } from './recorded-tree';

beforeEach(() => {
  resetMutationBuffer();
});

describe('a recorded tree and the global variable op', () => {
  it('stores the value under its name', () => {
    const tree = createRecordedTree();
    recordSetGlobalVariable('--gap', '8px');
    tree.applyOps(takeBatch());

    expect(tree.globalVariables.get('--gap')).toBe('8px');
  });

  it('forgets a name the batch removes', () => {
    const tree = createRecordedTree();
    recordSetGlobalVariable('--gap', '8px');
    recordSetGlobalVariable('--ink', '#111');
    tree.applyOps(takeBatch());

    recordRemoveGlobalVariable('--gap');
    tree.applyOps(takeBatch());

    expect([...tree.globalVariables.keys()]).toEqual(['--ink']);
  });

  it('starts empty again after a reset', () => {
    const tree = createRecordedTree();
    recordSetGlobalVariable('--gap', '8px');
    tree.applyOps(takeBatch());
    tree.reset();

    expect(tree.globalVariables.size).toBe(0);
  });
});
