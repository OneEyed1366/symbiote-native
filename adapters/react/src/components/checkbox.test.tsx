// `checkbox` как тег через рендерер React, вид проверяет `checkbox-payload.itest.ts`
// Число нод это оракул регистрации: без неё тег коммитит голый view без галочки
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 111;
const TEST_ID = 'agree';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
});

function box(): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.payload.testID === TEST_ID,
  );
  if (found === undefined) throw new Error('checkbox did not commit');
  return found;
}

function tap(): void {
  const created = fabric.find(node => node.props.testID === TEST_ID);
  if (created === undefined) throw new Error('no checkbox was created');
  fabric.fireEvent(created.instanceHandle, 'topTouchStart');
  fabric.fireEvent(created.instanceHandle, 'topTouchEnd');
}

describe('React: `checkbox` as a tag', () => {
  it('commits the box with the checkmark image under it', () => {
    mount(ROOT_TAG, <checkbox testID={TEST_ID} value />);

    expect(box().viewName).toBe('RCTView');
    expect(box().children).toHaveLength(1);
    expect(box().children[0].viewName).toBe('RCTImageView');
  });

  it('reports the inverted value from a real touch', () => {
    const values: boolean[] = [];
    mount(
      ROOT_TAG,
      <checkbox
        testID={TEST_ID}
        value={false}
        onValueChange={event => values.push(event.value)}
      />,
    );

    tap();

    expect(values).toEqual([true]);
  });

  it('stays silent while disabled', () => {
    const values: boolean[] = [];
    mount(
      ROOT_TAG,
      <checkbox
        testID={TEST_ID}
        value={false}
        disabled
        onValueChange={event => values.push(event.value)}
      />,
    );

    tap();

    expect(values).toEqual([]);
  });
});
