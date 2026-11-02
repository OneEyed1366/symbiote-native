// Angular `ScreenContainer` against injected ViewConfigs, headless runs as iOS

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenContainer } from './screen-container';

const ROOT_TAG = 5_123;
const CONTAINER_VIEW = 'RNSScreenContainer';
const NAVIGATION_CONTAINER_VIEW = 'RNSScreenNavigationContainer';

const NATIVE_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { testID: true },
};
const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [CONTAINER_VIEW]: NATIVE_CONFIG,
  [NAVIGATION_CONTAINER_VIEW]: NATIVE_CONFIG,
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

@Component({
  selector: 'container-test-host',
  standalone: true,
  imports: [ScreenContainer],
  template: `
    <ScreenContainer><view testID="inside"></view></ScreenContainer>
  `,
})
class PlainContainerHost {}

@Component({
  selector: 'two-state-container-test-host',
  standalone: true,
  imports: [ScreenContainer],
  template: `<ScreenContainer [hasTwoStates]="true"></ScreenContainer>`,
})
class TwoStateContainerHost {}

@Component({
  selector: 'disabled-container-test-host',
  standalone: true,
  imports: [ScreenContainer],
  template: `
    <ScreenContainer [enabled]="false">
      <view testID="inside"></view>
    </ScreenContainer>
  `,
})
class DisabledContainerHost {}

@Component({
  selector: 'props-container-test-host',
  standalone: true,
  imports: [ScreenContainer],
  template: `
    <ScreenContainer
      [enabled]="true"
      [hasTwoStates]="false"
      [viewProps]="{ testID: 'screens' }"
    ></ScreenContainer>
  `,
})
class PropsContainerHost {}

const viewNamed = (viewName: string) =>
  fabric.find(node => node.viewName === viewName);

describe('Angular ScreenContainer', () => {
  it('mounts the native container with its content inside', async () => {
    mount(ROOT_TAG, PlainContainerHost);
    await tick();

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('uses the two-state container on iOS for navigators showing one screen', async () => {
    mount(ROOT_TAG, TwoStateContainerHost);
    await tick();

    expect(viewNamed(NAVIGATION_CONTAINER_VIEW)).toBeDefined();
    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
  });

  it('renders a plain view when the app turns screens off', async () => {
    mount(ROOT_TAG, DisabledContainerHost);
    await tick();

    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native container', async () => {
    mount(ROOT_TAG, PropsContainerHost);
    await tick();

    expect(viewNamed(CONTAINER_VIEW)?.props.testID).toBe('screens');
  });

  it('keeps the container flags off the native view', async () => {
    mount(ROOT_TAG, PropsContainerHost);
    await tick();

    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('enabled');
    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('hasTwoStates');
  });
});
