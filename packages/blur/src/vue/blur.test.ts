// Vue `BlurView` и `BlurTargetView` через recording fabric с подставленным view config
import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNativeTag } from '@symbiote-native/engine';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/vue';
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

const ROOT_TAG = 1622;
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

async function mountRoot(render: () => VNode): Promise<void> {
  mount(ROOT_TAG, { render });
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
  it('paints a native blur filling a transparent View on iOS', async () => {
    await mountRoot(() =>
      h(BlurView, { tint: 'light', intensity: 0.65, testID: 'blur' }),
    );

    const { payload } = nodeNamed(BLUR_VIEW);
    expect(payload.tint).toBe('light');
    expect(payload.intensity).toBe(0.65);
    expect(payload.blurMethod).toBe('none');
    expect(payload.blurReductionFactor).toBe(4);
  });

  it('keeps the default slot after the native blur inside the wrapper', async () => {
    await mountRoot(() =>
      h(
        BlurView,
        { testID: 'blur' },
        { default: () => h('view', { testID: CHILD_ID }) },
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

  it('resolves the blurTarget template ref into the native blurTargetId on Android', async () => {
    platform.OS = 'android';
    const Host = defineComponent(() => {
      const target = ref<unknown>(null);
      return (): VNode =>
        h('view', {}, [
          h(BlurTargetView, { ref: target }),
          h(BlurView, { blurTarget: target, blurMethod: 'dimezisBlurView' }),
        ]);
    });

    await mountRoot(() => h(Host));

    const targetTag = getNativeTag(nodeNamed(TARGET_VIEW).handle);
    expect(targetTag).toBeTypeOf('number');
    expect(nodeNamed(BLUR_VIEW).payload.blurTargetId).toBe(targetTag);
  });

  it('registers the blur view manager when it renders', async () => {
    await mountRoot(() => h(BlurView));

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoBlur',
      'ExpoBlurView',
    );
  });
});

describe('BlurView warnings', () => {
  it('warns once on mount when a dimezis method has no blurTarget on Android', async () => {
    platform.OS = 'android';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mountRoot(() =>
      h(BlurView, { blurMethod: 'dimezisBlurViewSdk31Plus' }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('BlurTargetView', () => {
  it('is a plain View on iOS', async () => {
    await mountRoot(() => h(BlurTargetView, { testID: 'target' }));

    expect(fabric.find(node => node.viewName === TARGET_VIEW)).toBeUndefined();
  });

  it('is the native target view on Android and holds its slot', async () => {
    platform.OS = 'android';

    await mountRoot(() =>
      h(BlurTargetView, {}, { default: () => h('view', { testID: CHILD_ID }) }),
    );

    expect(nodeNamed(TARGET_VIEW).children).toHaveLength(1);
  });
});
