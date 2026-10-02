// Solid `ContactAccessButton`, driven through the recording fabric with an injected view config

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
import type { IContactAccessButtonProps } from '../core';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
  requireOptionalNativeModule: () => ({ isAvailable: true }),
}));

const { ContactAccessButton } = await import('./contact-access-button');

const ROOT_TAG = 1503;
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

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountButton(props: IContactAccessButtonProps): Promise<void> {
  mount(ROOT_TAG, () => <ContactAccessButton {...props} />);
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
    await mountButton({ query: 'ann', caption: 'email' });

    expect(buttonPayload()?.query).toBe('ann');
    expect(buttonPayload()?.caption).toBe('email');
  });

  it('runs the view config prop processors, the tint is processed', async () => {
    await mountButton({ query: 'ann', tintColor: 'red' });

    expect(buttonPayload()?.tintColor).toBe('processed(red)');
  });

  it('follows a reactive prop without recreating the native node', async () => {
    const [query, setQuery] = createSignal('ann');
    mount(ROOT_TAG, () => <ContactAccessButton query={query()} />);
    await tick();
    const created = fabric.find(candidate => candidate.viewName === VIEW_NAME);

    setQuery('bob');
    await tick();

    expect(buttonPayload()?.query).toBe('bob');
    expect(fabric.find(candidate => candidate.viewName === VIEW_NAME)).toBe(
      created,
    );
  });

  it('registers the view manager when it renders', async () => {
    await mountButton({ query: 'ann' });

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

    await mountButton({ query: 'ann' });

    expect(buttonPayload()).toBeUndefined();
    expect(requireNativeViewManager).not.toHaveBeenCalled();
    expect(ContactAccessButton.isAvailable()).toBe(false);
  });
});
