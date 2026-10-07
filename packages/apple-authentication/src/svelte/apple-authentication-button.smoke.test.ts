// Svelte `AppleAuthenticationButton` through the real compiler and the recording fabric

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
const VIEW_NAME = 'ViewManagerAdapter_ExpoAppleAuthentication';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        directEventTypes: {
          topButtonPress: { registrationName: 'onButtonPress' },
        },
        validAttributes: {
          buttonType: true,
          buttonStyle: true,
          cornerRadius: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('apple-authentication-button');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('apple-authentication-button');
  platform.OS = 'ios';
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import AppleAuthenticationButton from './apple-authentication-button.svelte';
   const onPress = globalThis.__onApplePress;
 </script>
 <AppleAuthenticationButton {onPress} buttonType={1} buttonStyle={2} cornerRadius={12} />`;

async function mountProbe(name: string, onPress = vi.fn()): Promise<void> {
  Reflect.set(globalThis, '__onApplePress', onPress);
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

function buttonNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('AppleAuthenticationButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountProbe('ios-app');

    const node = buttonNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      buttonType: 1,
      buttonStyle: 2,
      cornerRadius: 12,
    });
  });

  it('calls onPress when the native button is pressed', async () => {
    const onPress = vi.fn();
    await mountProbe('press-app', onPress);
    const handle = buttonNode()?.instanceHandle;

    if (typeof handle === 'object' && handle !== null) {
      fabric.fireEvent(handle, 'topButtonPress', {});
    }

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('registers the view manager when it renders', async () => {
    await mountProbe('register-app');

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoAppleAuthentication',
    );
  });
});

describe('AppleAuthenticationButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountProbe('android-app');

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
