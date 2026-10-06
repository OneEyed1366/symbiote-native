// Svelte `LinearGradient`, driven through the real compiler and the recording fabric

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
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

const ROOT_TAG = 1614;
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

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('linear-gradient');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('linear-gradient');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import LinearGradient from './linear-gradient.svelte';
 </script>
 <LinearGradient colors={['red', 'blue']} start={{ x: 0, y: 0 }} end={[1, 1]} testID="box" style={{ borderRadius: 4 }}>
   <view testID="${CHILD_ID}" />
 </LinearGradient>`;

async function mountProbe(name: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function gradientNode() {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  if (node === undefined) throw new Error('no gradient view was created');
  return live.nodeOf(node.handle);
}

describe('LinearGradient (Positive)', () => {
  it('paints one native view with the points and children inside it on iOS', async () => {
    await mountProbe('ios-app');

    const { payload, children } = gradientNode();
    expect(payload.startPoint).toEqual([0, 0]);
    expect(payload.endPoint).toEqual([1, 1]);
    expect(children.map(child => child.payload.testID)).toEqual([CHILD_ID]);
  });

  it('wraps the gradient in a View with the children beside it on Android', async () => {
    platform.OS = 'android';

    await mountProbe('android-app');

    const root = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'box',
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
    await mountProbe('register-app');

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoLinearGradient');
  });
});
