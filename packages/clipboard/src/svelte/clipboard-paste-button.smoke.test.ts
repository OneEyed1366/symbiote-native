// Svelte `ClipboardPasteButton`, driven through the real compiler and the recording fabric

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

const ROOT_TAG = 1514;
const VIEW_NAME = 'ViewManagerAdapter_ExpoClipboard';
const fakeColor = (value: unknown): string => `processed(${String(value)})`;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          cornerStyle: true,
          displayMode: true,
          backgroundColor: { process: fakeColor },
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('clipboard-paste-button');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('clipboard-paste-button');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import ClipboardPasteButton from './clipboard-paste-button.svelte';
 </script>
 <ClipboardPasteButton onPress={() => {}} cornerStyle="large" displayMode="iconOnly" backgroundColor="red" />`;

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

describe('ClipboardPasteButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountProbe('ios-app');

    expect(buttonPayload()?.cornerStyle).toBe('large');
    expect(buttonPayload()?.displayMode).toBe('iconOnly');
  });

  it('runs the view config prop processors, the background is processed', async () => {
    await mountProbe('background-app');

    expect(buttonPayload()?.backgroundColor).toBe('processed(red)');
  });

  it('registers the view manager when it renders', async () => {
    await mountProbe('register-app');

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoClipboard');
  });
});

describe('ClipboardPasteButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountProbe('android-app');

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
