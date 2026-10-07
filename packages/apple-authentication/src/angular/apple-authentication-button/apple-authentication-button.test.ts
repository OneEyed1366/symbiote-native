// Angular `AppleAuthenticationButton` over the recording fabric with an injected view config

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { AppleAuthenticationButton } = await import('.');

const ROOT_TAG = 1615;
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

const pressed = vi.hoisted(() => vi.fn());

@Component({
  selector: 'apple-authentication-button-host',
  standalone: true,
  imports: [AppleAuthenticationButton],
  template: `<AppleAuthenticationButton
    [onPress]="onPress"
    [buttonType]="1"
    [buttonStyle]="2"
    [cornerRadius]="12"
  />`,
})
class HostFixture {
  readonly onPress = pressed;
}

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountHost(): Promise<void> {
  mount(ROOT_TAG, HostFixture);
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
    await mountHost();

    const node = buttonNode();
    expect(node ? live.nodeOf(node.handle).payload : {}).toMatchObject({
      buttonType: 1,
      buttonStyle: 2,
      cornerRadius: 12,
    });
  });

  it('calls onPress when the native button is pressed', async () => {
    await mountHost();
    const handle = buttonNode()?.instanceHandle;

    if (typeof handle === 'object' && handle !== null) {
      fabric.fireEvent(handle, 'topButtonPress', {});
    }

    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('registers the view manager when it renders', async () => {
    await mountHost();

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoAppleAuthentication',
    );
  });
});

describe('AppleAuthenticationButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountHost();

    expect(buttonNode()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
  });
});
