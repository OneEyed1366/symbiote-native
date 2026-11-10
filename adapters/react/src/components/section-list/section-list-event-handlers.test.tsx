/** @jsxRuntime automatic */
// `event handlers` из `SectionList-itest`: `onLayout` на обёртке заголовка и на scroll view
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SectionList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 63;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountList(): Promise<void> {
  mount(
    ROOT_TAG,
    createElement(SectionList<{ key: string }>, {
      initialNumToRender: Infinity,
      ListHeaderComponent: () => createElement('text', {}, 'List Header'),
      sections: [{ title: 's1', key: 's1', data: [{ key: 'i1' }] }],
      renderItem: ({ item }) => createElement('text', {}, item.key),
      renderSectionHeader: () => null,
    }),
  );
  await flush();
}

function nodesWith(predicate: (node: ILiveNode) => boolean): ILiveNode[] {
  const found: ILiveNode[] = [];
  live.walkLive(live.appRoot(), node => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

describe('SectionList event handlers', () => {
  // RN also wires the header wrapper, but `_headerLength` is written there and never read
  it('registers onLayout on the scroll view', async () => {
    await mountList();

    const scrollViews = nodesWith(node => node.viewName === 'RCTScrollView');
    expect(scrollViews).toHaveLength(1);
    expect(scrollViews[0]?.payload.onLayout).toBe(true);
  });
});
