// `innerViewRef` у `ScrollView` в React, сам behavior проверен в core
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 6_103;

const fabric = installRecordingFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('ScrollView innerViewRef', () => {
  it('receives the content node after mount and null after unmount', () => {
    const innerViewRef = vi.fn();
    mount(ROOT_TAG, <scroll-view innerViewRef={innerViewRef} />);

    expect(innerViewRef).toHaveBeenCalledTimes(1);
    expect(innerViewRef.mock.lastCall?.[0]).not.toBe(null);

    unmount(ROOT_TAG);

    expect(innerViewRef).toHaveBeenLastCalledWith(null);
  });

  it('moves from the old ref to the new one on rerender', () => {
    const first = vi.fn();
    const second = vi.fn();
    mount(ROOT_TAG, <scroll-view innerViewRef={first} />);

    mount(ROOT_TAG, <scroll-view innerViewRef={second} />);

    expect(first).toHaveBeenLastCalledWith(null);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
