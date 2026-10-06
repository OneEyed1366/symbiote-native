// Solid `AppleAuthenticationButton` over the recording fabric with an injected view config

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import type { IAppleAuthenticationButtonProps } from '../core';

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

const ROOT_TAG = 1613;
const VIEW_NAME = 'ViewManagerAdapter_ExpoAppleAuthentication';
const BUTTON_PROPS = { buttonType: 1, buttonStyle: 2, cornerRadius: 12 };

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

async function mountButton(
  props: IAppleAuthenticationButtonProps,
): Promise<void> {
  mount(ROOT_TAG, () => <AppleAuthenticationButton {...props} />);
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
    await mountButton({ ...BUTTON_PROPS, onPress: vi.fn() });

    const node = buttonNode();
    expect(node).toBeDefined();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject(
      BUTTON_PROPS,
    );
  });

  it('follows a reactive prop without recreating the native node', async () => {
    const [radius, setRadius] = createSignal(12);
    mount(ROOT_TAG, () => (
      <AppleAuthenticationButton
        buttonType={1}
        buttonStyle={2}
        cornerRadius={radius()}
        onPress={vi.fn()}
      />
    ));
    await tick();
    const created = buttonNode();

    setRadius(4);
    await tick();

    const node = buttonNode();
    expect(node ? live.nodeOf(node.handle).payload.cornerRadius : null).toBe(4);
    expect(node).toBe(created);
  });

  it('calls onPress when the native button is pressed', async () => {
    const onPress = vi.fn();
    await mountButton({ ...BUTTON_PROPS, onPress });
    const handle = buttonNode()?.instanceHandle;

    if (typeof handle === 'object' && handle !== null) {
      fabric.fireEvent(handle, 'topButtonPress', {});
    }

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('registers the view manager when it renders', async () => {
    await mountButton({ ...BUTTON_PROPS, onPress: vi.fn() });

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoAppleAuthentication',
    );
  });
});

describe('AppleAuthenticationButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountButton({ ...BUTTON_PROPS, onPress: vi.fn() });

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
