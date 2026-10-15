import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { ReducedMotionManager } from 'react-native-reanimated/src/ReducedMotion';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { mountSvelte } from '../../test-support/mount-svelte';
import Fixture, { config } from './reduced-motion-config.fixture.svelte';

installWrapperHost();
const ROOT_TAG = 21_601;
let unmountTree = () => {};

beforeEach(() => {
  ReducedMotionManager.setEnabled(false);
  config.mode = ReduceMotion.Always;
});
afterEach(() => unmountTree());

describe('ReducedMotionConfig', () => {
  it('turns reduced motion on while it stands, for the mode Always', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture);

    expect(ReducedMotionManager.jsValue).toBe(true);
  });

  it('puts the setting back once it is gone', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture);

    unmountTree();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });

  it('follows the mode when it changes', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture);

    config.mode = ReduceMotion.Never;
    flushSync();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });
});
