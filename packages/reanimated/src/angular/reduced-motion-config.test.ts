import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { ReduceMotion } from 'react-native-reanimated/src/commonTypes';
import { ReducedMotionManager } from 'react-native-reanimated/src/ReducedMotion';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { ReducedMotionConfig } from './reduced-motion-config';

installWrapperHost();
const ROOT_TAG = 21_801;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const mode = signal(ReduceMotion.Always);

@Component({
  selector: 'reduced-motion-host',
  standalone: true,
  imports: [ReducedMotionConfig],
  template: `<ReducedMotionConfig [mode]="mode()" />`,
})
class Host {
  readonly mode = mode;
}

beforeEach(() => {
  ReducedMotionManager.setEnabled(false);
  mode.set(ReduceMotion.Always);
});
afterEach(() => unmount(ROOT_TAG));

describe('ReducedMotionConfig', () => {
  it('turns reduced motion on while it stands, for the mode Always', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(ReducedMotionManager.jsValue).toBe(true);
  });

  it('puts the setting back once it is gone', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });

  it('follows the mode when it changes', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    mode.set(ReduceMotion.Never);
    await tick();

    expect(ReducedMotionManager.jsValue).toBe(false);
  });
});
