import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { ReducedMotionManager } from 'react-native-reanimated/src/ReducedMotion';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { ReducedMotionConfig } from './reduced-motion-config';

installWrapperHost();
const ROOT_TAG = 21_701;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => ReducedMotionManager.setEnabled(false));
afterEach(() => unmount(ROOT_TAG));

describe('ReducedMotionConfig', () => {
  it('turns reduced motion on while it stands, for the mode Always', async () => {
    mount(ROOT_TAG, () => <ReducedMotionConfig mode={ReduceMotion.Always} />);
    await tick();

    expect(ReducedMotionManager.jsValue).toBe(true);
  });

  it('puts the setting back once it is gone', async () => {
    mount(ROOT_TAG, () => <ReducedMotionConfig mode={ReduceMotion.Always} />);
    await tick();

    unmount(ROOT_TAG);

    expect(ReducedMotionManager.jsValue).toBe(false);
  });

  it('follows the mode when it changes', async () => {
    const [mode, setMode] = createSignal(ReduceMotion.Always);
    mount(ROOT_TAG, () => <ReducedMotionConfig mode={mode()} />);
    await tick();

    setMode(ReduceMotion.Never);

    expect(ReducedMotionManager.jsValue).toBe(false);
  });
});
