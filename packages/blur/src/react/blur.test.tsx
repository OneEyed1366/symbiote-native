// React `BlurView` и `BlurTargetView` через recording fabric с подставленным view config
import { createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNativeTag } from '@symbiote-native/engine';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/react';
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

const { BlurView, BlurTargetView } = await import('./blur');

const ROOT_TAG = 1621;
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
  it('paints a native blur filling a transparent View on iOS', () => {
    mount(
      ROOT_TAG,
      createElement(BlurView, {
        tint: 'light',
        intensity: 0.65,
        testID: 'blur',
      }),
    );

    const { payload } = nodeNamed(BLUR_VIEW);
    expect(payload.tint).toBe('light');
    expect(payload.intensity).toBe(0.65);
    expect(payload.blurMethod).toBe('none');
    expect(payload.blurReductionFactor).toBe(4);
  });

  it('keeps the children after the native blur inside the wrapper', () => {
    mount(
      ROOT_TAG,
      createElement(
        BlurView,
        { testID: 'blur' },
        createElement('view', { testID: CHILD_ID }),
      ),
    );

    const wrapper = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'blur',
    );
    expect(wrapper?.children.map(child => child.viewName)).toEqual([
      BLUR_VIEW,
      'RCTView',
    ]);
  });

  it('resolves the blurTarget ref into the native blurTargetId on Android', async () => {
    platform.OS = 'android';
    const target = createRef<never>();

    mount(
      ROOT_TAG,
      createElement(
        'view',
        {},
        createElement(BlurTargetView, { ref: target }),
        createElement(BlurView, {
          blurTarget: target,
          blurMethod: 'dimezisBlurView',
        }),
      ),
    );
    await Promise.resolve();

    const targetTag = getNativeTag(nodeNamed(TARGET_VIEW).handle);
    expect(targetTag).toBeTypeOf('number');
    expect(nodeNamed(BLUR_VIEW).payload.blurTargetId).toBe(targetTag);
  });

  it('registers the blur view manager when it renders', () => {
    mount(ROOT_TAG, createElement(BlurView, {}));

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurView',
    );
  });
});

describe('BlurView warnings', () => {
  it('warns once on mount when a dimezis method has no blurTarget on Android', () => {
    platform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount(
      ROOT_TAG,
      createElement(BlurView, { blurMethod: 'dimezisBlurViewSdk31Plus' }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('BlurTargetView', () => {
  it('is a plain View on iOS', () => {
    mount(ROOT_TAG, createElement(BlurTargetView, { testID: 'target' }));

    expect(fabric.find(node => node.viewName === TARGET_VIEW)).toBeUndefined();
  });

  it('is the native target view on Android and holds its children', () => {
    platform.OS = 'android';

    mount(
      ROOT_TAG,
      createElement(
        BlurTargetView,
        {},
        createElement('view', { testID: CHILD_ID }),
      ),
    );

    expect(nodeNamed(TARGET_VIEW).children).toHaveLength(1);
  });
});
