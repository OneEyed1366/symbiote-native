import { mount, unmount } from '@symbiote-native/vue';
import { h, nextTick, reactive } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { ReducedMotionManager } from 'react-native-reanimated/src/ReducedMotion';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { ReducedMotionConfig } from './reduced-motion-config';

installWrapperHost();
const ROOT_TAG = 21_501;

beforeEach(() => ReducedMotionManager.setEnabled(false));
afterEach(() => unmount(ROOT_TAG));

describe('ReducedMotionConfig', () => {
  it('turns reduced motion on while it stands, for the mode Always', async () => {
    mount(ROOT_TAG, {
      render: () => h(ReducedMotionConfig, { mode: ReduceMotion.Always }),
    });
    await nextTick();

    expect(ReducedMotionManager.jsValue).toBe(true);
  });

  it('puts the setting back once it is gone', async () => {
    mount(ROOT_TAG, {
      render: () => h(ReducedMotionConfig, { mode: ReduceMotion.Always }),
    });
    await nextTick();

    unmount(ROOT_TAG);

    expect(ReducedMotionManager.jsValue).toBe(false);
  });

  it('follows the mode when it changes', async () => {
    const state = reactive({ mode: ReduceMotion.Always });
    mount(ROOT_TAG, {
      render: () => h(ReducedMotionConfig, { mode: state.mode }),
    });
    await nextTick();

    state.mode = ReduceMotion.Never;
    await nextTick();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });
});
