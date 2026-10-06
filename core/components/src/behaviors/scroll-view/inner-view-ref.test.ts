// `innerViewRef` из `ScrollView-test` в RN
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerScrollViewBehavior, SCROLL_VIEW_TAG } from './index';

const fabric = installRecordingFabric();
createLiveTree(fabric);

let nextRootTag = 9_900;

function mount(props: Readonly<Record<string, unknown>>) {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = createElement(
    descriptorFor(SCROLL_VIEW_TAG).component,
    false,
    SCROLL_VIEW_TAG,
  );
  for (const key of Object.keys(props)) routeProp(node, key, props[key]);
  appendChild(root, node);
  return { surface, root, node };
}

function slotOf(owner: ISymbioteNode): ISymbioteNode {
  if (owner.childHost === undefined) throw new Error('the owner has no slot');
  return owner.childHost;
}

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('innerViewRef', () => {
  it('receives the content node once the owner has committed', () => {
    const innerViewRef = vi.fn();
    const { surface, node } = mount({ innerViewRef });

    surface.commit();

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).toHaveBeenLastCalledWith(slotOf(node));
  });

  it('receives null when the scroll view leaves the tree', () => {
    const innerViewRef = vi.fn();
    const { surface, root, node } = mount({ innerViewRef });
    surface.commit();

    removeChild(root, node);
    surface.commit();

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });

  it('hands the old ref null and the new one the node when it changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { surface, node } = mount({ innerViewRef: first });
    surface.commit();

    routeProp(node, 'innerViewRef', second);
    surface.commit();

    expect(first).toHaveBeenLastCalledWith(null);
    expect(second).toHaveBeenLastCalledWith(slotOf(node));
  });

  it('stays quiet when the same ref is written again', () => {
    const innerViewRef = vi.fn();
    const { surface, node } = mount({ innerViewRef });
    surface.commit();

    routeProp(node, 'innerViewRef', innerViewRef);
    routeProp(node, 'testID', 'again');
    surface.commit();

    expect(innerViewRef).toHaveBeenCalledTimes(1);
  });
});
