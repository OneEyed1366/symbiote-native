// Vue twin of ../react's NavigationBar test (ADR 0025)

import { h, ref, type Ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INavigationBarProps } from '../core';

const { pushStackEntry, popStackEntry, replaceStackEntry, useColorScheme } =
  vi.hoisted(() => ({
    pushStackEntry: vi.fn((props: unknown) => props),
    popStackEntry: vi.fn(),
    replaceStackEntry: vi.fn((_entry: unknown, props: unknown) => props),
    useColorScheme: vi.fn(),
  }));

vi.mock('../core', () => ({
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
}));
vi.mock('@symbiote-native/vue', async importOriginal => ({
  ...(await importOriginal<typeof import('@symbiote-native/vue')>()),
  useColorScheme,
}));

const { NavigationBar } = await import('./navigation-bar');

const ROOT_TAG = 980;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let colorScheme: Ref<'light' | 'dark' | null>;
let harnessProps: Ref<INavigationBarProps>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  colorScheme = ref('light');
  useColorScheme.mockReturnValue(colorScheme);
  harnessProps = ref<INavigationBarProps>({ style: 'dark', hidden: false });
});

afterEach(() => {
  unmount(ROOT_TAG);
});

function mountHarness(): void {
  mount(ROOT_TAG, {
    render: (): VNode => h(NavigationBar, harnessProps.value),
  });
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

    expect(useColorScheme).toHaveBeenCalled();
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

    harnessProps.value = { style: 'light', hidden: true };
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

    colorScheme.value = 'dark';
    await tick();

    expect(replaceStackEntry).toHaveBeenCalled();
  });
});
