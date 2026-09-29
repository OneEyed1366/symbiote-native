// Svelte `ContactAccessButton`, driven through the real compiler and the recording fabric

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

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireOptionalNativeModule: () => ({ isAvailable: true }),
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1504;
const VIEW_NAME = 'ViewManagerAdapter_ExpoContactAccessButton';
const fakeColor = (value: unknown): string => `processed(${String(value)})`;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          query: true,
          caption: true,
          tintColor: { process: fakeColor },
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('contact-access-button');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('contact-access-button');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import ContactAccessButton from './contact-access-button.svelte';
 </script>
 <ContactAccessButton query="ann" caption="email" tintColor="red" />`;

async function mountProbe(name: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function buttonPayload(): Record<string, unknown> | undefined {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  return node ? live.nodeOf(node.handle).payload : undefined;
}

describe('ContactAccessButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountProbe('ios-app');

    expect(buttonPayload()?.query).toBe('ann');
    expect(buttonPayload()?.caption).toBe('email');
  });

  it('runs the view config prop processors, the tint is processed', async () => {
    await mountProbe('tint-app');

    expect(buttonPayload()?.tintColor).toBe('processed(red)');
  });

  it('registers the view manager when it renders', async () => {
    await mountProbe('register-app');

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoContactAccessButton',
    );
  });
});

describe('ContactAccessButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountProbe('android-app');

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
