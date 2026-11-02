// `useTransitionProgress` inside a Vue Stack screen, driven by the native transition event

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import { useTransitionProgress } from '../composables';
import type { ITransitionProgress } from '../../core';

const ROOT_TAG = 4_514;
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

const tick = (): Promise<void> =>
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

describe('useTransitionProgress in a Vue Stack screen', () => {
  it('follows the native transition event of its own screen', async () => {
    let seen: ITransitionProgress | undefined;
    const ProgressScreen = defineComponent(() => {
      seen = useTransitionProgress();
      return () => h('text', {}, 'screen');
    });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: ProgressScreen }),
          ]),
      }),
    );
    await tick();
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
    const reportError = vi.fn();
    Object.assign(globalThis, { ErrorUtils: { reportError } });
    const Orphan = defineComponent(() => {
      useTransitionProgress();
      return () => h('text', {}, 'orphan');
    });

    mount(ROOT_TAG, Orphan);

    expect(String(reportError.mock.calls[0]?.[0])).toMatch(
      /useTransitionProgress must be used within a screen/,
    );
  });
});
