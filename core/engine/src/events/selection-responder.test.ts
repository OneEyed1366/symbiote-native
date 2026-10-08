// RN: `topSelectionChange` negotiates `selectionChangeShouldSetResponder`, но только при касании

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  setEventListener,
  type ISymbioteNode,
} from '../index';

const fabric = installRecordingFabric();
let nextRootTag = 9_950;

type ITree = { root: ISymbioteNode; input: ISymbioteNode };

function mount(): ITree {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const input = createElement('RCTView');
  appendChild(root, input);
  surface.commit();
  return { root, input };
}

function claimOnSelection(node: ISymbioteNode, grants: string[]): void {
  setEventListener(node, 'selectionChangeShouldSetResponder', () => true);
  setEventListener(node, 'responderGrant', () => {
    grants.push('grant');
    return false;
  });
}

function touchDown(): void {
  const finger = {
    identifier: 1,
    pageX: 10,
    pageY: 10,
    timestamp: 1,
    target: tree.input,
  };
  fabric.fireEvent(tree.input, 'topTouchStart', {
    changedTouches: [finger],
    touches: [finger],
  });
}

let tree: ITree;
beforeEach(() => {
  fabric.reset();
  tree = mount();
});

afterEach(() => {
  fabric.fireEvent(tree.input, 'topTouchEnd', {
    touches: [],
    changedTouches: [],
  });
  fabric.reset();
});

describe('a selection change negotiates the responder', () => {
  it('grants the node that claims it while a touch is down', () => {
    const grants: string[] = [];
    claimOnSelection(tree.input, grants);

    touchDown();
    fabric.fireEvent(tree.input, 'topSelectionChange');

    expect(grants).toEqual(['grant']);
  });

  it('stays out of it with no touch down', () => {
    const grants: string[] = [];
    claimOnSelection(tree.input, grants);

    fabric.fireEvent(tree.input, 'topSelectionChange');

    expect(grants).toEqual([]);
  });

  it('asks a capture claim on an ancestor first', () => {
    const asked: string[] = [];
    setEventListener(
      tree.root,
      'selectionChangeShouldSetResponderCapture',
      () => {
        asked.push('root');
        return false;
      },
    );
    setEventListener(tree.input, 'selectionChangeShouldSetResponder', () => {
      asked.push('input');
      return false;
    });

    touchDown();
    fabric.fireEvent(tree.input, 'topSelectionChange');

    expect(asked).toEqual(['root', 'input']);
  });
});
