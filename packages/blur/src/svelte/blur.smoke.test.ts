// Svelte `BlurView` и `BlurTargetView` через настоящий компилятор и recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import {
  getNativeTag,
  setNativeViewConfigSource,
} from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

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

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1624;
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

let harness = createSvelteHarness('blur');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('blur');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const IMPORTS = `import BlurView from './blur-view.svelte';
   import BlurTargetView from './blur-target-view.svelte';`;

async function mountProbe(name: string, body: string): Promise<void> {
  const source = `<script lang="ts">
   ${IMPORTS}
   let target = $state<unknown>();
 </script>
 ${body}`;
  const app = harness.compileSource(__dirname, name, source);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function nodeNamed(viewName: string) {
  const node = fabric.find(candidate => candidate.viewName === viewName);
  if (node === undefined) throw new Error(`no ${viewName} was created`);
  return live.nodeOf(node.handle);
}

describe('BlurView (Positive)', () => {
  it('paints a native blur filling a transparent View on iOS', async () => {
    await mountProbe(
      'ios-app',
      `<BlurView tint="light" intensity={0.65} testID="blur" />`,
    );

    const { payload } = nodeNamed(BLUR_VIEW);
    expect(payload.tint).toBe('light');
    expect(payload.intensity).toBe(0.65);
    expect(payload.blurMethod).toBe('none');
    expect(payload.blurReductionFactor).toBe(4);
  });

  it('keeps the children after the native blur inside the wrapper', async () => {
    await mountProbe(
      'children-app',
      `<BlurView testID="blur"><view testID="${CHILD_ID}" /></BlurView>`,
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

  it('resolves the bound target ref into the native blurTargetId on Android', async () => {
    platform.OS = 'android';

    await mountProbe(
      'target-app',
      `<view>
         <BlurTargetView bind:ref={target} />
         <BlurView blurTarget={target} blurMethod="dimezisBlurView" />
       </view>`,
    );

    const targetTag = getNativeTag(nodeNamed(TARGET_VIEW).handle);
    expect(targetTag).toBeTypeOf('number');
    expect(nodeNamed(BLUR_VIEW).payload.blurTargetId).toBe(targetTag);
  });

  it('registers the blur view manager when it renders', async () => {
    await mountProbe('register-app', `<BlurView />`);

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

    await mountProbe(
      'warn-app',
      `<BlurView blurMethod="dimezisBlurViewSdk31Plus" />`,
    );

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('BlurTargetView', () => {
  it('is a plain View on iOS', async () => {
    await mountProbe('plain-app', `<BlurTargetView testID="target" />`);

    expect(fabric.find(node => node.viewName === TARGET_VIEW)).toBeUndefined();
  });

  it('is the native target view on Android and holds its children', async () => {
    platform.OS = 'android';

    await mountProbe(
      'native-app',
      `<BlurTargetView><view testID="${CHILD_ID}" /></BlurTargetView>`,
    );

    expect(nodeNamed(TARGET_VIEW).children).toHaveLength(1);
  });
});
