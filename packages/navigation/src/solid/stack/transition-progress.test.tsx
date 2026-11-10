// `useTransitionProgress` inside a Solid Stack screen, driven by the native transition event

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import { useTransitionProgress } from '../primitives';
import type { ITransitionProgress } from '../../core';

const ROOT_TAG = 7_702;
const SCREEN_VIEW = 'RNSScreen';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topTransitionProgress: { registrationName: 'onTransitionProgress' },
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: {} },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function valuesOf(transition: ITransitionProgress): number[] {
  return [
    transition.progress.__getValue(),
    transition.closing.__getValue(),
    transition.goingForward.__getValue(),
  ];
}

describe('useTransitionProgress in a Solid Stack screen', () => {
  it('follows the native transition event of its own screen', async () => {
    let seen: ITransitionProgress | undefined;
    const ProgressScreen = () => {
      seen = useTransitionProgress();
      return <text>screen</text>;
    };
    mount(ROOT_TAG, () => (
      <Stack initialRouteName="Home">
        <Stack.Screen name="Home" component={ProgressScreen} />
      </Stack>
    ));
    await flush();
    const screen = fabric.find(node => node.viewName === SCREEN_VIEW);
    if (screen === undefined || seen === undefined) {
      throw new Error('stack screen did not render');
    }

    fabric.fireEvent(screen.instanceHandle, 'topTransitionProgress', {
      progress: 0.75,
      closing: 0,
      goingForward: 1,
    });

    expect(valuesOf(seen)).toEqual([0.75, 0, 1]);
  });

  it('throws outside a screen rendered by a navigator', () => {
    expect(() =>
      mount(ROOT_TAG, () => useTransitionProgress() as never),
    ).toThrow(/useTransitionProgress must be used within a screen/);
  });
});
