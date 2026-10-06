/** @jsxRuntime automatic */
// RN `VirtualizedSectionList-test` "handles nested lists", a same-axis list is a plain view
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedSectionList,
  mount,
  unmount,
  type ISection,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 62;
const VIEWPORT = { x: 0, y: 0, width: 320, height: 2_000 };

type IItem = { key: string };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function innerList(outerKey: string): ReactElement {
  const sections: ISection<IItem>[] = [
    {
      title: 'inner',
      key: 'inner',
      data: [{ key: `${outerKey}:inner0` }, { key: `${outerKey}:inner1` }],
    },
  ];
  return createElement(VirtualizedSectionList<IItem>, {
    sections,
    horizontal: outerKey === 'outer1',
    renderItem: ({ item }) => createElement('text', {}, item.key),
  });
}

function outerList(): ReactElement {
  const sections: ISection<IItem>[] = [
    {
      title: 'outer',
      key: 'outer',
      data: [{ key: 'outer0' }, { key: 'outer1' }],
    },
  ];
  return createElement(VirtualizedSectionList<IItem>, {
    sections,
    renderItem: ({ item }) => innerList(item.key),
  });
}

function scrollViews() {
  return live.findAllLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
}

describe('VirtualizedSectionList nested in a VirtualizedSectionList', () => {
  it('scrolls only the outer list and the one against its own axis', async () => {
    mount(ROOT_TAG, outerList());
    await flush();
    for (const scrollView of scrollViews()) {
      const handle = scrollView.instanceHandle;
      if (typeof handle === 'object' && handle !== null) {
        fabric.fireEvent(handle, 'topLayout', { layout: VIEWPORT });
      }
    }
    await flush();

    expect(scrollViews()).toHaveLength(2);
    expect(live.texts(live.appRoot())).toEqual([
      'outer0:inner0',
      'outer0:inner1',
      'outer1:inner0',
      'outer1:inner1',
    ]);
  });
});
