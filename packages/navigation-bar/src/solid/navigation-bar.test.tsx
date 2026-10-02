// Solid twin of the `../react` and `../vue` `NavigationBar` tests

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INavigationBarStyle } from '../core';

const { pushStackEntry, popStackEntry, replaceStackEntry, createColorScheme } =
  vi.hoisted(() => ({
    pushStackEntry: vi.fn((props: unknown) => props),
    popStackEntry: vi.fn(),
    replaceStackEntry: vi.fn((_entry: unknown, props: unknown) => props),
    createColorScheme: vi.fn(),
  }));

vi.mock('../core', () => ({
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
}));
vi.mock('@symbiote-native/solid', async importOriginal => ({
  ...(await importOriginal<typeof import('@symbiote-native/solid')>()),
  createColorScheme,
}));

const { NavigationBar } = await import('./navigation-bar');

const ROOT_TAG = 982;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let colorScheme: ReturnType<typeof createSignal<'light' | 'dark' | null>>;
let harnessProps: ReturnType<
  typeof createSignal<{ style?: INavigationBarStyle; hidden?: boolean }>
>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  colorScheme = createSignal<'light' | 'dark' | null>('light');
  createColorScheme.mockReturnValue(colorScheme[0]);
  harnessProps = createSignal<{
    style?: INavigationBarStyle;
    hidden?: boolean;
  }>({
    style: 'dark',
    hidden: false,
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
});

function mountHarness(): void {
  const [props] = harnessProps;
  mount(ROOT_TAG, () => (
    <NavigationBar style={props().style} hidden={props().hidden} />
  ));
}

describe('NavigationBar (Positive: pushes/replaces/pops a stack entry across its lifecycle)', () => {
  it('pushes a stack entry on mount with its initial props', async () => {
    mountHarness();
    await tick();

    expect(pushStackEntry).toHaveBeenCalledWith({
      style: 'dark',
      hidden: false,
    });
  });

  it('reads the current color scheme, so an auto style stays reactive to it', async () => {
    mountHarness();
    await tick();

    expect(createColorScheme).toHaveBeenCalled();
  });

  it('pops the stack entry on unmount', async () => {
    mountHarness();
    await tick();

    unmount(ROOT_TAG);

    expect(popStackEntry).toHaveBeenCalledTimes(1);
  });

  it('replaces the stack entry when its own props change', async () => {
    mountHarness();
    await tick();
    replaceStackEntry.mockClear();

    const [, setProps] = harnessProps;
    setProps({ style: 'light', hidden: true });
    await tick();

    expect(replaceStackEntry).toHaveBeenCalledWith(
      { style: 'dark', hidden: false },
      { style: 'light', hidden: true },
    );
  });

  it('replaces the stack entry when the color scheme changes', async () => {
    mountHarness();
    await tick();
    replaceStackEntry.mockClear();

    const [, setColorScheme] = colorScheme;
    setColorScheme('dark');
    await tick();

    expect(replaceStackEntry).toHaveBeenCalled();
  });
});
