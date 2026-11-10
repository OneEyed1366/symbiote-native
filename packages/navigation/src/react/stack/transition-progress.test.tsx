// `useTransitionProgress` inside a React Stack screen, driven by the native transition event

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import { useTransitionProgress } from '../hooks';
import type { ITransitionProgress } from '../../core';

const ROOT_TAG = 514;
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

let seen: ITransitionProgress | undefined;

function ProgressScreen(): ReturnType<typeof createElement> {
  seen = useTransitionProgress();
  return createElement('text', {}, 'screen');
}

function valuesOf(transition: ITransitionProgress): number[] {
  return [
    transition.progress.__getValue(),
    transition.closing.__getValue(),
    transition.goingForward.__getValue(),
  ];
}

describe('useTransitionProgress in a React Stack screen', () => {
  it('follows the native transition event of its own screen', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: ProgressScreen,
        }),
      ),
    );
    const screen = fabric.find(node => node.viewName === SCREEN_VIEW);
    if (screen === undefined || seen === undefined) {
      throw new Error('stack screen did not render');
    }

    act(() =>
      fabric.fireEvent(screen.instanceHandle, 'topTransitionProgress', {
        progress: 0.75,
        closing: 0,
        goingForward: 1,
      }),
    );

    expect(valuesOf(seen)).toEqual([0.75, 0, 1]);
  });

  it('throws outside a screen rendered by a navigator', () => {
    function Orphan(): ReturnType<typeof createElement> {
      useTransitionProgress();
      return createElement('text', {}, 'orphan');
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      act(() => mount(ROOT_TAG, createElement(Orphan)));
    }).toThrow(/useTransitionProgress must be used within a screen/);
    logged.mockRestore();
  });
});
