// RN hands a list's `innerViewRef` to its ScrollView through `...props`
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';

const ROOT_TAG = 825;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Solid FlatList innerViewRef', () => {
  it('receives the content node and null after unmount', async () => {
    const innerViewRef = vi.fn();
    mount(ROOT_TAG, () => (
      <FlatList
        data={['a', 'b']}
        innerViewRef={innerViewRef}
        renderItem={info => <text>{info().item}</text>}
      />
    ));
    await tick();

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef).not.toHaveBeenCalledWith(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });
});
