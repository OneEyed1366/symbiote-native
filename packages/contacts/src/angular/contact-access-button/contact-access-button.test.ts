// Angular `ContactAccessButton`, driven through the recording fabric with an injected view config

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

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireOptionalNativeModule: () => ({ isAvailable: true }),
}));

const { ContactAccessButton } = await import('.');

const ROOT_TAG = 1505;
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
          ignoredEmails: true,
          tintColor: { process: fakeColor },
        },
      }
    : undefined,
);

@Component({
  selector: 'contact-access-button-host',
  standalone: true,
  imports: [ContactAccessButton],
  template: `<ContactAccessButton
    query="ann"
    caption="email"
    tintColor="red"
  />`,
})
class HostFixture {}

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

function buttonPayload(): Record<string, unknown> | undefined {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  return node ? live.nodeOf(node.handle).payload : undefined;
}

describe('ContactAccessButton (Positive)', () => {
  it('paints the native view with its props on iOS', async () => {
    await mountHost();

    expect(buttonPayload()?.query).toBe('ann');
    expect(buttonPayload()?.caption).toBe('email');
  });

  it('runs the view config prop processors, the tint is processed', async () => {
    await mountHost();

    expect(buttonPayload()?.tintColor).toBe('processed(red)');
  });

  it('registers the view manager when it renders', async () => {
    await mountHost();

    expect(requireNativeViewManager).toHaveBeenCalledWith(
      'ExpoContactAccessButton',
    );
  });

  it('exposes `isAvailable` as a static like upstream', () => {
    expect(ContactAccessButton.isAvailable()).toBe(true);
  });
});

describe('ContactAccessButton (Negative)', () => {
  it('renders nothing on Android', async () => {
    platform.OS = 'android';

    await mountHost();

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
    expect(ContactAccessButton.isAvailable()).toBe(false);
  });
});
