/** @jsxRuntime automatic */
// RN #55708: после перестановки `ItemSeparatorComponent` получает старые соседние элементы

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 34;

type IRow = { key: string };
type ISectionShape = { title: string; data: readonly IRow[] };
type ISeparatorProps = { leadingItem?: IRow; trailingItem?: IRow };

const INITIAL: ISectionShape[] = [
  { title: 'S', data: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] },
];
const REORDERED: ISectionShape[] = [
  { title: 'S', data: [{ key: 'b' }, { key: 'a' }, { key: 'c' }] },
];

function Separator({
  leadingItem,
  trailingItem,
}: ISeparatorProps): ReactElement {
  return createElement(
    'text',
    {},
    `sep:${leadingItem?.key ?? 'none'}|${trailingItem?.key ?? 'none'}`,
  );
}

function App(): ReactElement {
  const [isReordered, setIsReordered] = useState(false);
  return (
    <view>
      <pressable testID="reorder" onPress={() => setIsReordered(true)} />
      {createElement(VirtualizedSectionList<IRow>, {
        sections: isReordered ? REORDERED : INITIAL,
        keyExtractor: (item: IRow) => item.key,
        ItemSeparatorComponent: Separator,
        renderItem: ({ item }: { item: IRow }) =>
          createElement('text', {}, `row:${item.key}`),
      })}
    </view>
  );
}

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function separators(): string[] {
  return live.texts(live.appRoot()).filter(text => text.startsWith('sep:'));
}

function showViewport(): void {
  const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
  if (scrollView === undefined) throw new Error('RCTScrollView missing');
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: 400 },
  });
}

function tapReorder(): void {
  const button = fabric.find(
    node => node.viewName === 'RCTView' && node.props.testID === 'reorder',
  );
  if (button === undefined) throw new Error('reorder button missing');
  fabric.fireEvent(button.instanceHandle, 'topTouchStart');
  fabric.fireEvent(button.instanceHandle, 'topTouchEnd');
}

describe('VirtualizedSectionList separators follow a reorder', () => {
  it('hands every separator its current neighbours', () => {
    mount(ROOT_TAG, <App />);
    showViewport();
    expect(separators()).toEqual(['sep:a|b', 'sep:b|c']);

    tapReorder();

    expect(separators()).toEqual(['sep:b|a', 'sep:a|c']);
  });
});
