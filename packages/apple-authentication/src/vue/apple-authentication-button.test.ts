// Vue `AppleAuthenticationButton` over the recording fabric with an injected view config

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { AppleAuthenticationButton } =
  await import('./apple-authentication-button');

const ROOT_TAG = 1612;
const VIEW_NAME = 'ViewManagerAdapter_ExpoAppleAuthentication';
const BUTTON_ATTRS = { buttonType: 1, buttonStyle: 2, cornerRadius: 12 };

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

async function mountButton(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode => h(AppleAuthenticationButton, attrs),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function buttonNode(): ReturnType<typeof fabric.find> {
  return fabric.find(node => node.viewName === VIEW_NAME);
}

describe('AppleAuthenticationButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountButton({ ...BUTTON_ATTRS, onPress: vi.fn() });

    const node = buttonNode();
    expect(node).toBeDefined();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject(
      BUTTON_ATTRS,
    );
  });

  it('takes kebab-case attributes the way a Vue template writes them', async () => {
    await mountButton({
      'button-type': 0,
      'button-style': 1,
      'corner-radius': 4,
      onPress: vi.fn(),
    });

    const node = buttonNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      buttonType: 0,
      buttonStyle: 1,
      cornerRadius: 4,
    });
  });

  it('calls onPress when the native button is pressed', async () => {
    const onPress = vi.fn();
    await mountButton({ ...BUTTON_ATTRS, onPress });
    const handle = buttonNode()?.instanceHandle;

    if (typeof handle === 'object' && handle !== null) {
      fabric.fireEvent(handle, 'topButtonPress', {});
    }

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('registers the view manager when it renders', async () => {
    await mountButton({ ...BUTTON_ATTRS, onPress: vi.fn() });

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoAppleAuthentication',
    );
  });
});

describe('AppleAuthenticationButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountButton({ ...BUTTON_ATTRS, onPress: vi.fn() });

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
