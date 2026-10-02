// Angular twin of the `../react`/`../vue`/`../solid`/`../svelte` `NavigationBar` tests. Drives
// the real `ColorSchemeService` (a genuine Angular signal `effect()` can track) through a mocked
// `Appearance`, rather than faking the service itself

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type {
  IColorSchemeName,
  IEventSubscription,
} from '@symbiote-native/engine';
import type { INavigationBarStyle } from '../core';

const {
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
  getColorScheme,
  addChangeListener,
} = vi.hoisted(() => ({
  pushStackEntry: vi.fn((props: unknown) => props),
  popStackEntry: vi.fn(),
  replaceStackEntry: vi.fn((_entry: unknown, props: unknown) => props),
  getColorScheme: vi.fn<() => IColorSchemeName | null>(),
  addChangeListener: vi.fn(),
}));

vi.mock('../core', () => ({
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
}));
vi.mock('@symbiote-native/engine', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@symbiote-native/engine')>();
  return { ...actual, Appearance: { getColorScheme, addChangeListener } };
});

const { NavigationBar } = await import('./navigation-bar');

const ROOT_TAG = 984;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IHostProps = { style?: INavigationBarStyle; hidden?: boolean };
type IColorSchemeListener = (preferences: {
  colorScheme: IColorSchemeName | null;
}) => void;

let capturedHost: HostFixture | undefined;
let colorSchemeListener: IColorSchemeListener | undefined;
let removeListenerSpy: ReturnType<typeof vi.fn>;

@Component({
  selector: 'navigation-bar-host',
  standalone: true,
  imports: [NavigationBar],
  template: `<navigation-bar
    [style]="props().style"
    [hidden]="props().hidden"
  />`,
})
class HostFixture {
  readonly props = signal<IHostProps>({ style: 'dark', hidden: false });
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  removeListenerSpy = vi.fn<() => void>();
  getColorScheme.mockReturnValue('light');
  addChangeListener.mockImplementation((listener: IColorSchemeListener) => {
    colorSchemeListener = listener;
    return { remove: removeListenerSpy } satisfies IEventSubscription;
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('NavigationBar (Positive: pushes/replaces/pops a stack entry across its lifecycle)', () => {
  it('pushes a stack entry on mount with its initial props', () => {
    mount(ROOT_TAG, HostFixture);

    expect(pushStackEntry).toHaveBeenCalledWith({
      style: 'dark',
      hidden: false,
    });
  });

  it('pops the stack entry on unmount', () => {
    mount(ROOT_TAG, HostFixture);

    unmount(ROOT_TAG);

    expect(popStackEntry).toHaveBeenCalledTimes(1);
  });

  it('replaces the stack entry when its own props change', async () => {
    mount(ROOT_TAG, HostFixture);
    replaceStackEntry.mockClear();

    capturedHost?.props.set({ style: 'light', hidden: true });
    await tick();

    expect(replaceStackEntry).toHaveBeenCalledWith(
      { style: 'dark', hidden: false },
      { style: 'light', hidden: true },
    );
  });

  it('replaces the stack entry when the color scheme changes', async () => {
    mount(ROOT_TAG, HostFixture);
    replaceStackEntry.mockClear();

    colorSchemeListener?.({ colorScheme: 'dark' });
    await tick();

    expect(replaceStackEntry).toHaveBeenCalled();
  });
});
