// Angular `LinearGradient`, driven through the recording fabric with an injected view config

import '@angular/compiler';
import { Component, computed, signal } from '@angular/core';
import type { Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/angular';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));

const { LinearGradient: IosGradient } = await import('./index.ios');
const { LinearGradient: AndroidGradient } = await import('./index.android');

const ROOT_TAG = 1_615;
const VIEW_NAME = 'ViewManagerAdapter_ExpoLinearGradient';
const CHILD_ID = 'content';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          colors: true,
          locations: true,
          startPoint: true,
          endPoint: true,
          borderRadii: true,
          dither: true,
        },
      }
    : undefined,
);

const TEMPLATE = `<LinearGradient
    [colors]="colors"
    [start]="start"
    [end]="end"
    testID="box"
    [style]="style"
  >
    <view testID="${CHILD_ID}"></view>
  </LinearGradient>`;

function hostFor(gradient: Type<unknown>, selector: string): Type<unknown> {
  @Component({
    selector,
    standalone: true,
    imports: [gradient],
    template: TEMPLATE,
  })
  class HostFixture {
    readonly colors = ['red', 'blue'];
    readonly start = { x: 0, y: 0 };
    readonly end: [number, number] = [1, 1];
    readonly style = { borderRadius: 4 };
  }
  return HostFixture;
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountHost(
  gradient: Type<unknown>,
  selector: string,
): Promise<void> {
  mount(ROOT_TAG, hostFor(gradient, selector));
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function gradientNode() {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  if (node === undefined) throw new Error('no gradient view was created');
  return live.nodeOf(node.handle);
}

const fillPercent = signal(35);

@Component({
  selector: 'signal-style-host',
  standalone: true,
  imports: [IosGradient],
  template: `<LinearGradient
    [colors]="colors"
    [style]="fillStyle()"
  ></LinearGradient>`,
})
class SignalStyleHost {
  readonly colors = ['red', 'blue'];
  readonly fillStyle = computed(() => ({ width: `${fillPercent()}%` }));
}

// A `[style]` binding does not dirty an OnPush component, so the bar stayed on its first width
describe('LinearGradient style from a signal', () => {
  it('repaints with the new style after the signal moves', async () => {
    fillPercent.set(35);
    mount(ROOT_TAG, SignalStyleHost);
    await tick();
    expect(gradientNode().payload.width).toBe('35%');

    fillPercent.set(55);
    await tick();

    expect(gradientNode().payload.width).toBe('55%');
  });
});

describe('LinearGradient (Positive)', () => {
  it('paints one native view with the points and children inside it on iOS', async () => {
    await mountHost(IosGradient, 'ios-gradient-host');

    const { payload, children } = gradientNode();
    expect(payload.startPoint).toEqual([0, 0]);
    expect(payload.endPoint).toEqual([1, 1]);
    expect(payload.testID).toBe('box');
    expect(children.map(child => child.payload.testID)).toEqual([CHILD_ID]);
  });

  it('wraps the gradient in a View with the children beside it on Android', async () => {
    platform.OS = 'android';

    await mountHost(AndroidGradient, 'android-gradient-host');

    // The host anchor carries the static `testID` too, the wrapper is the RCTView
    const root = live.findLive(
      live.appRoot(),
      node => node.viewName === 'RCTView' && node.payload.testID === 'box',
    );
    expect(root?.children.map(child => child.viewName)).toEqual([
      VIEW_NAME,
      'RCTView',
    ]);
    expect(gradientNode().payload.borderRadii).toEqual([
      4, 4, 4, 4, 4, 4, 4, 4,
    ]);
  });

  it('registers the view manager when it renders', async () => {
    await mountHost(IosGradient, 'ios-gradient-host');

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoLinearGradient');
  });
});
