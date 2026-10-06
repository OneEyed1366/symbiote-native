// Angular `BlurView` и `BlurTargetView` через recording fabric с подставленным view config

import '@angular/compiler';
import { Component } from '@angular/core';
import type { Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNativeTag } from '@symbiote-native/engine';
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

const { BlurView } = await import('./blur-view');
const { BlurTargetView: IosTarget } =
  await import('./blur-target-view/index.ios');
const { BlurTargetView: AndroidTarget } =
  await import('./blur-target-view/index.android');

const ROOT_TAG = 1625;
const BLUR_VIEW = 'ViewManagerAdapter_ExpoBlur_ExpoBlurView';
const TARGET_VIEW = 'ViewManagerAdapter_ExpoBlur_ExpoBlurTargetView';
const CHILD_ID = 'content';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name => {
  if (name === BLUR_VIEW) {
    return {
      validAttributes: {
        tint: true,
        intensity: true,
        blurReductionFactor: true,
        blurMethod: true,
        blurTargetId: true,
      },
    };
  }
  return name === TARGET_VIEW ? { validAttributes: {} } : undefined;
});

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let hostCounter = 0;

function hostFor(template: string, targets: Type<unknown>[]): Type<unknown> {
  hostCounter += 1;
  @Component({
    selector: `blur-host-${hostCounter}`,
    standalone: true,
    imports: [BlurView, ...targets],
    template,
  })
  class HostFixture {}
  return HostFixture;
}

async function mountTemplate(
  template: string,
  targets: Type<unknown>[] = [],
): Promise<void> {
  mount(ROOT_TAG, hostFor(template, targets));
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function nodeNamed(viewName: string) {
  const node = fabric.find(candidate => candidate.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return live.nodeOf(node.handle);
}

describe('BlurView (Positive)', () => {
  it('paints a native blur filling a transparent View', async () => {
    await mountTemplate(`<BlurView tint="light" [intensity]="0.65" />`);

    const { payload } = nodeNamed(BLUR_VIEW);
    expect(payload.tint).toBe('light');
    expect(payload.intensity).toBe(0.65);
    expect(payload.blurMethod).toBe('none');
    expect(payload.blurReductionFactor).toBe(4);
  });

  it('keeps the projected content after the native blur inside the wrapper', async () => {
    await mountTemplate(
      `<BlurView testID="blur"><view testID="${CHILD_ID}"></view></BlurView>`,
    );

    const wrapper = live.findLive(
      live.appRoot(),
      node => node.viewName === 'RCTView' && node.payload.testID === 'blur',
    );
    expect(wrapper?.children.map(child => child.viewName)).toEqual([
      BLUR_VIEW,
      'RCTView',
    ]);
  });

  it('resolves the blurTarget template ref into the native blurTargetId on Android', async () => {
    platform.OS = 'android';

    await mountTemplate(
      `<BlurTargetView #target />
       <BlurView [blurTarget]="target" blurMethod="dimezisBlurView" />`,
      [AndroidTarget],
    );

    const targetTag = getNativeTag(nodeNamed(TARGET_VIEW).handle);
    expect(targetTag).toBeTypeOf('number');
    expect(nodeNamed(BLUR_VIEW).payload.blurTargetId).toBe(targetTag);
  });

  it('registers the blur view manager when it renders', async () => {
    await mountTemplate(`<BlurView />`);

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurView',
    );
  });
});

describe('BlurView warnings', () => {
  it('warns once when a dimezis method has no blurTarget on Android', async () => {
    platform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mountTemplate(`<BlurView blurMethod="dimezisBlurViewSdk31Plus" />`);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('BlurTargetView', () => {
  it('is a plain View on iOS', async () => {
    await mountTemplate(`<BlurTargetView testID="target" />`, [IosTarget]);

    expect(fabric.find(node => node.viewName === TARGET_VIEW)).toBeUndefined();
  });

  it('is the native target view on Android and holds its content', async () => {
    platform.OS = 'android';

    await mountTemplate(
      `<BlurTargetView><view testID="${CHILD_ID}"></view></BlurTargetView>`,
      [AndroidTarget],
    );

    expect(nodeNamed(TARGET_VIEW).children).toHaveLength(1);
  });
});
