// `checkbox` как тег через рендерер Solid, вид проверяет `checkbox-payload.itest.ts`
// Число нод это оракул регистрации: без неё тег коммитит голый view без галочки

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// Побочный импорт: поведение строит галочку, приложение получает его через барель
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 844;
const TEST_ID = 'agree';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

async function tap(): Promise<void> {
  const created = fabric.find(node => node.props.testID === TEST_ID);
  if (created === undefined) throw new Error('no checkbox was created');
  fabric.fireEvent(created.instanceHandle, 'topTouchStart');
  await tick();
  fabric.fireEvent(created.instanceHandle, 'topTouchEnd');
  await tick();
}

describe('Solid: `checkbox` as a tag', () => {
  it('commits the box with the checkmark image under it', async () => {
    mount(ROOT_TAG, () => <checkbox testID={TEST_ID} value />);
    await tick();

    expect(box().viewName).toBe('RCTView');
    expect(box().children).toHaveLength(1);
    expect(box().children[0].viewName).toBe('RCTImageView');
  });

  it('reports the inverted value from a real touch', async () => {
    const values: boolean[] = [];
    mount(ROOT_TAG, () => (
      <checkbox
        testID={TEST_ID}
        value={false}
        onValueChange={event => values.push(event.value)}
      />
    ));
    await tick();

    await tap();

    expect(values).toEqual([true]);
  });

  it('toggles from the value of the latest render', async () => {
    const [checked, setChecked] = createSignal(false);
    const values: boolean[] = [];
    mount(ROOT_TAG, () => (
      <checkbox
        testID={TEST_ID}
        value={checked()}
        onValueChange={event => {
          values.push(event.value);
          setChecked(event.value);
        }}
      />
    ));
    await tick();

    await tap();
    await tap();

    expect(values).toEqual([true, false]);
  });

  it('stays silent while disabled', async () => {
    const values: boolean[] = [];
    mount(ROOT_TAG, () => (
      <checkbox
        testID={TEST_ID}
        value={false}
        disabled
        onValueChange={event => values.push(event.value)}
      />
    ));
    await tick();

    await tap();

    expect(values).toEqual([]);
  });
});
