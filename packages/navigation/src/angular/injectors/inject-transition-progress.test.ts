// `injectTransitionProgress` inside an Angular Stack screen, driven by the native transition event
// The guard for a call outside a Stack screen is core's `requireTransitionProgress`, tested there

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import { ScreenDirective } from '../screen.directive';
import type { ITransitionProgress } from '../../core';
import { injectTransitionProgress } from './index';

const ROOT_TAG = 5_131;
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

let seen: ITransitionProgress | undefined;

@Component({
  selector: 'progress-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>screen</text>`,
})
class ProgressScreenComponent {
  constructor() {
    seen = injectTransitionProgress();
  }
}

@Component({
  selector: 'progress-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="homeComponent"
      ></ng-template>
    </Stack>
  `,
})
class ProgressTestHost {
  readonly homeComponent = ProgressScreenComponent;
}

function valuesOf(transition: ITransitionProgress): number[] {
  return [
    transition.progress.__getValue(),
    transition.closing.__getValue(),
    transition.goingForward.__getValue(),
  ];
}

describe('injectTransitionProgress in an Angular Stack screen', () => {
  it('follows the native transition event of its own screen', async () => {
    seen = undefined;
    mount(ROOT_TAG, ProgressTestHost);
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
});
